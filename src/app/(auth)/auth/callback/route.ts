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

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirect to onboarding; the account layout guard forwards to /account once complete.
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  // Invalid or missing code — redirect to login with an error hint.
  const errorUrl = new URL("/login", origin);
  errorUrl.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(errorUrl);
}
