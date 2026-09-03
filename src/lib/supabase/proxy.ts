import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { isGatedPath, onboardingRedirect } from "./onboarding-redirect";

/**
 * Refreshes the Supabase auth session and enforces the auth + onboarding gate
 * for the account area. Runs on every matched request (see `src/proxy.ts`).
 * The gate's decision rule itself is pure and lives in `onboarding-redirect.ts`;
 * this function is the IO around it.
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
 * Typed with the generated `Database` schema — regenerate it with `npm run db:types`.
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

  const supabase = createServerClient<Database>(url, publishableKey, {
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

  // Carries refreshed auth cookies onto a redirect so the session survives it.
  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (isGatedPath(pathname)) {
    if (!claims) {
      return redirectTo("/login");
    }

    // Self-read of onboarding status (RLS permits a user to read their own row).
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("onboarding_status")
      .eq("id", claims.sub)
      .single();

    const decision = onboardingRedirect({ profile, error, pathname });
    if (decision.kind === "error") {
      // A failed read is not evidence of an unfinished onboarding, so redirecting
      // would lock an approved client out on a transient failure. Let the request
      // through instead — the zone layout surfaces the error.
      console.error("updateSession: onboarding status read failed", error);
      return response;
    }
    if (decision.kind === "redirect") {
      return redirectTo(decision.to);
    }
  }

  return response;
}
