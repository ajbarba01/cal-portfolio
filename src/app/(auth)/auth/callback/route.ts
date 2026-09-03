import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback: exchanges the one-time code for a session, then
 * redirects to onboarding (first login) or the account dashboard.
 * The `next` param is accepted for future deep-link support.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let failure = "auth_callback_failed";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Only allow a known internal next target (claim flow). Everything else
      // falls back to the onboarding gate, which routes by onboarding_status.
      // `verified=1` lets the landing page fire a one-time "email verified" toast.
      const next = searchParams.get("next");
      const dest = next === "/claim" ? "/claim" : "/onboarding?verified=1";
      return NextResponse.redirect(`${origin}${dest}`);
    }

    // Carry the SDK's own code across so /login can tell a link that timed out
    // (`otp_expired`, `flow_state_expired`, `flow_state_not_found`,
    // `invite_not_found`) from any other failure, and say so. The code is a
    // machine identifier used to pick a sentence, never shown.
    failure = error.code ?? failure;
  }

  // Invalid or missing code — redirect to login with an error hint.
  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", failure);
  return NextResponse.redirect(errorUrl);
}
