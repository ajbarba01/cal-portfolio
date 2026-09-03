import { createBrowserClient } from "@supabase/ssr";

import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase client for use in Client Components (runs in the browser, uses the public
 * publishable key). Typed with the generated `Database` schema — regenerate it with `npm run db:types`.
 */
export function createClient() {
  return createBrowserClient<Database>(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
}
