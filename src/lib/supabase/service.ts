import "server-only";
import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase client using the secret key (`sb_secret_...`), which has elevated privileges and
 * **bypasses Row Level Security**. Server-only — never import this into client code. Use only for
 * trusted server operations (e.g. webhook handlers, admin tasks).
 *
 * One instance per request: the client holds no session (`persistSession: false`), so sharing it
 * changes no behaviour, and callers that memoize per client — `assertActorIsAdmin` — only dedupe
 * when they are handed the same one. Outside a request (crons, webhooks) `cache` calls straight
 * through and every call builds its own client.
 *
 * Typed with the generated `Database` schema — regenerate it with `npm run db:types`.
 */
export const createServiceClient = cache(() =>
  createSupabaseClient<Database>(
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    { auth: { autoRefreshToken: false, persistSession: false } },
  ),
);
