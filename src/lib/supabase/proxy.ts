import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session and enforces the auth + onboarding gate
 * for the account area. Runs on every matched request (see `src/proxy.ts`).
 *
 * Why the gate lives here and not in `(account)/layout.tsx`: a server-component
 * layout cannot read the current pathname directly, so the old design forwarded
 * an `x-pathname` header and called `redirect()` inside the layout. That pattern
 * loops during client-side (RSC) navigation — `redirect()` thrown in a layout
 * that also wraps the redirect target re-fires whenever path detection is even
 * briefly off. Middleware sees the canonical `nextUrl.pathname` and issues one
 * clean redirect that Next's router handles uniformly for document and RSC
 * navigations, so the loop is structurally impossible.
 *
 * Keep the `getClaims()` call immediately after client creation — inserting
 * logic between client creation and the auth read risks logging users out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between client creation and getClaims().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isOnboarding = pathname === "/onboarding";
  const isAccountArea =
    pathname === "/account" || pathname.startsWith("/account/");

  // Carries refreshed auth cookies onto a redirect so the session survives it.
  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (isOnboarding || isAccountArea) {
    if (!claims) {
      return redirectTo("/login");
    }

    // Self-read of onboarding status (RLS permits a user to read their own row).
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_status")
      .eq("id", claims.sub)
      .single();
    const onboarded = profile?.onboarding_status === "approved";

    // Un-onboarded users are confined to /onboarding; onboarded users never see it.
    if (!onboarded && isAccountArea) {
      return redirectTo("/onboarding");
    }
    if (onboarded && isOnboarding) {
      return redirectTo("/account");
    }
  }

  return response;
}
