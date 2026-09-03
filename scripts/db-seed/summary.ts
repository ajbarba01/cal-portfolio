import type { DbClient } from "../../src/lib/supabase/db-client";
import { ADMIN_EMAIL, SEED_PASSWORD } from "./constants";

const TABLES = [
  "profiles",
  "pets",
  "availability_windows",
  "overnight_nights",
  "bookings",
  "booking_series",
  "booking_pets",
  "payments",
  "client_debits",
  "reviews",
  "inquiries",
] as const;

export async function printSummary(db: DbClient): Promise<void> {
  console.log("\nSeeded state:");
  for (const table of TABLES) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    console.log(`  ${table.padEnd(22)} ${count}`);
  }
  console.log(
    `\nLogins (all seeded users share one password): ${SEED_PASSWORD}`,
  );
  console.log(`  admin: ${ADMIN_EMAIL}`);
  const { data, error } = await db
    .from("profiles")
    .select("email, onboarding_status")
    .neq("role", "admin")
    .order("email");
  if (error) throw new Error(`list profiles: ${error.message}`);
  for (const p of data ?? []) {
    console.log(`  client: ${p.email} (${p.onboarding_status})`);
  }
}
