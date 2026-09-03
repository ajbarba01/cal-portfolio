import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * A Supabase client carrying the generated schema. Every repository or action
 * parameter takes `DbClient`, never a bare `SupabaseClient` — the bare type
 * defaults its schema generic, which erases the generated types at the boundary
 * and leaves every query inside untyped.
 */
export type DbClient = SupabaseClient<Database>;
