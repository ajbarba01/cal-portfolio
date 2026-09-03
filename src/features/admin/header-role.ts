/**
 * The role read behind the persistent header's admin tint and account name.
 *
 * The header resolves auth in the browser so the shell stays static, which
 * means this one read runs against the caller's own session client rather than
 * the service role. It lives here, with the rest of the admin feature, so the
 * design-system header does not carry a `profiles` query of its own.
 *
 * DISPLAY ONLY. A tampered client can claim to be an admin and change nothing:
 * the account and admin layouts keep their server-side gates, and the nav badge
 * counts come from an admin-gated server action.
 */

import type { DbClient } from "@/lib/supabase/db-client";

export interface HeaderRole {
  isAdmin: boolean;
  fullName: string | null;
}

/**
 * Reads the signed-in user's role and display name. A failed or missing row
 * resolves to a signed-in non-admin rather than throwing — the header must
 * still render its control.
 */
export async function readHeaderRole(
  supabase: DbClient,
  userId: string,
): Promise<HeaderRole> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  return {
    isAdmin: profile?.role === "admin",
    fullName: profile?.full_name ?? null,
  };
}
