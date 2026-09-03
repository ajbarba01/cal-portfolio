import { createClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cookie-free Supabase client for statically-rendered / ISR pages. Reads no auth
 * cookies (so the route can prerender) and uses the public publishable key —
 * RLS (anon) already allows reading active services + published reviews. Never
 * use this where the caller's identity matters; for that, use the cookie-bound
 * server client (`./server`).
 *
 * Typed with the generated `Database` schema — regenerate it with `npm run db:types`.
 */
export function createStaticClient() {
  return createClient<Database>(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
