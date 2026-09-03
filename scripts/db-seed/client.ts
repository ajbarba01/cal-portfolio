import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "../../src/lib/env";
import type { Database } from "../../src/lib/supabase/database.types";
import type { DbClient } from "../../src/lib/supabase/db-client";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const HINT = "run via `npm run db:seed` so .env.local is loaded";

/**
 * Seeding wipes data. It must be impossible to point this tool at a remote
 * project; there is deliberately no override flag (spec: safety guard).
 */
export function assertLocalDbUrl(url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `db:seed is local-only — refusing Supabase URL with host "${host}".`,
    );
  }
}

export function makeServiceClient(): DbClient {
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
  assertLocalDbUrl(url);
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
