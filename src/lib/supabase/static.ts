import { createClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for statically-rendered / ISR pages. Reads no auth
 * cookies (so the route can prerender) and uses the public publishable key —
 * RLS (anon) already allows reading active services + published reviews. Never
 * use this where the caller's identity matters; for that, use the cookie-bound
 * server client (`./server`).
 */
export function createStaticClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
