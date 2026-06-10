import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL } from "./constants";
import { ensureAdmin } from "./factories";

// Children before parents (FK delete order). services + settings are
// migration-owned and never wiped (spec). PostgREST requires a filter on
// delete; `not col is null` matches every row.
const WIPE_ORDER: ReadonlyArray<{ table: string; col: string }> = [
  { table: "form_responses", col: "id" },
  { table: "payments", col: "id" },
  { table: "booking_pets", col: "booking_id" },
  { table: "bookings", col: "id" },
  { table: "booking_series", col: "id" },
  { table: "client_debits", col: "id" },
  { table: "reviews", col: "id" },
  { table: "inquiries", col: "id" },
  { table: "pets", col: "id" },
  { table: "availability_windows", col: "id" },
  { table: "overnight_nights", col: "night" },
];

/** Wipe-first reset: empty scenario-owned tables, delete non-admin auth
 *  users (cascades profiles), ensure the admin exists. Returns admin id. */
export async function wipe(db: SupabaseClient): Promise<string> {
  for (const { table, col } of WIPE_ORDER) {
    const { error } = await db.from(table).delete().not(col, "is", null);
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  }
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const targets = data.users.filter((u) => u.email !== ADMIN_EMAIL);
    if (targets.length === 0) break;
    for (const u of targets) {
      const { error: delErr } = await db.auth.admin.deleteUser(u.id);
      if (delErr) {
        throw new Error(`deleteUser ${u.email ?? u.id}: ${delErr.message}`);
      }
    }
  }
  return ensureAdmin(db);
}
