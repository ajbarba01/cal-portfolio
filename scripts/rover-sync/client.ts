import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export interface SyncTarget {
  db: SupabaseClient;
  /** Human label for logs: "local" or "PROD". */
  label: string;
  host: string;
}

/**
 * Builds a service-role client for whichever Supabase the loaded env points at.
 *
 * Unlike `db:seed` (which wipes and is hard-locked to local), `rover:sync` is a
 * safe reconcile scoped to `source = 'rover'` rows, so targeting prod is allowed
 * and intended. Pick the target by env file:
 *   - local: `tsx --env-file=.env.local ...`           (npm run rover:sync)
 *   - prod:  `tsx --env-file=.env.production.local ...` (npm run rover:sync:prod)
 */
export function makeTarget(): SyncTarget {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — run via `npm run rover:sync` (.env.local) or `npm run rover:sync:prod` (.env.production.local).",
    );
  }
  const host = new URL(url).hostname;
  const label = LOCAL_HOSTS.has(host) ? "local" : "PROD";
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { db, label, host };
}
