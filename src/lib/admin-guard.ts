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

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true if the given userId has role='admin' in profiles.
 * Uses the provided service-role client — must NOT be a session client.
 */
export async function assertActorIsAdmin(
  serviceClient: SupabaseClient,
  actorUserId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", actorUserId)
    .single();

  if (error || !data) return false;
  return data.role === "admin";
}
