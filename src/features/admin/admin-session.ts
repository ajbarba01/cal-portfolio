/**
 * Shared session helper for admin server actions.
 *
 * Resolves the authenticated caller's id from the session cookie, redirecting
 * to /login if there is no session. Identity ALWAYS comes from the verified
 * session — never from a client payload. Authorization (role === 'admin') is a
 * separate concern, re-checked inside each core via assertActorIsAdmin.
 *
 * Not a server action itself — a plain helper imported by the "use server"
 * action wrappers, so it stays DRY across the admin feature.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Returns the authenticated user's id, or redirects to /login if unauthenticated. */
export async function getActorOrRedirect(): Promise<string> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}
