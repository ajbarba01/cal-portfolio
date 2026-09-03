import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "../../src/lib/env";
import type { Database } from "../../src/lib/supabase/database.types";
import type { DbClient } from "../../src/lib/supabase/db-client";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const HINT =
  "run via `npm run rover:sync` (.env.local) or `npm run rover:sync:prod` (.env.production.local)";

export interface SyncTarget {
  db: DbClient;
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
  const url = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    HINT,
  );
  const key = requireEnv(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY,
    HINT,
  );
  const host = new URL(url).hostname;
  const label = LOCAL_HOSTS.has(host) ? "local" : "PROD";
  const db = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { db, label, host };
}
