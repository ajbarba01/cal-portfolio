import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session and syncs auth cookies onto the response.
 * Called from the root proxy on every matched request so Server Components always
 * see a fresh session. Keep the `getClaims()` call immediately after client creation —
 * inserting logic between them risks logging users out at random.
 *
 * Also forwards `x-pathname` so server layouts can read the current path via
 * `headers()` — needed for the onboarding guard in `(account)/layout.tsx`.
 */
export async function updateSession(request: NextRequest) {
  // Forward the pathname so Server Component layouts can read it via headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
        // Preserve requestHeaders (including x-pathname) when rebuilding the response.
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
