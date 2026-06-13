import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only routes that read/refresh the auth session. Public static/ISR pages are
  // intentionally excluded so they can prerender without invoking middleware.
  // `/book/*` and `/contact` MUST stay: they read auth via the cookie-bound
  // server client whose `setAll` is a no-op in RSC — without middleware,
  // expired-token visits lose rotated refresh tokens → spurious logout.
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/onboarding",
    "/login",
    "/signup",
    "/auth/:path*",
    "/book/:path*",
    "/contact",
  ],
};
