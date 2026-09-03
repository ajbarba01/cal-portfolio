/**
 * Admin authorization guard.
 *
 * Reads the caller's role from the profiles table using the SERVICE-ROLE client
 * (bypasses RLS so the read is always authoritative). Never trust a role value
 * from a client payload — always re-derive from DB.
 *
 * Used by admin cores to enforce the "only admins can mutate" invariant before
 * any write. Defense-in-depth on top of the layout route guard.
 */

import { cache } from "react";
import type { DbClient } from "@/lib/supabase/db-client";

/**
 * Returns true if the given userId has role='admin' in profiles.
 * Uses the provided service-role client — must NOT be a session client.
 *
 * Memoized per request on (client, userId): one page renders through a dozen
 * admin cores, each re-reading the same row. The check itself is unchanged —
 * a different actor, or a different client, reads the database again.
 */
export const assertActorIsAdmin = cache(
  async (serviceClient: DbClient, actorUserId: string): Promise<boolean> => {
    const { data, error } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", actorUserId)
      .single();

    if (error || !data) return false;
    return data.role === "admin";
  },
);
