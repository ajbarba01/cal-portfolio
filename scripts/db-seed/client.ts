import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

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

export function makeServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — run via `npm run db:seed` so .env.local is loaded.",
    );
  }
  assertLocalDbUrl(url);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
