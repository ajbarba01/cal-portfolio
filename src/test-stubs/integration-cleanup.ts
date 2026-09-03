/**
 * Fixture teardown for the suites that hit the local Supabase stack.
 *
 * Those suites share one database and pin fixed future slots, so a run that dies
 * part-way — a hook timeout, a deadlock, an interrupted watch — leaves confirmed
 * bookings behind, and the NEXT run's overlap and drive-buffer guards refuse the
 * same slots with `slot_taken` or `unavailable`. Deleting by the fixture email
 * prefix rather than by the ids a `beforeAll` managed to assign means a partial
 * failure still clears what it made, and a later run heals whatever an earlier
 * one leaked.
 *
 * Give every suite its own prefix. The delete is by prefix, so an overlapping
 * one would tear down another suite's fixtures mid-run.
 */

import type { DbClient } from "@/lib/supabase/db-client";

/** Auth users are paged; a local database holds few, so one big page is plenty. */
const USERS_PAGE_SIZE = 1000;

/** Every auth user whose email starts with `emailPrefix`. */
async function fixtureUserIds(
  client: DbClient,
  emailPrefix: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: USERS_PAGE_SIZE,
    });
    if (error) {
      throw new Error(`Failed to list fixture users: ${error.message}`);
    }
    for (const user of data.users) {
      if (user.email?.startsWith(emailPrefix)) ids.push(user.id);
    }
    if (data.users.length < USERS_PAGE_SIZE) return ids;
  }
}

/**
 * Delete every fixture client whose email starts with `emailPrefix`, and every
 * row that hangs off them.
 *
 * The order is load-bearing: `payments.booking_id` is ON DELETE RESTRICT, so a
 * booking that took a payment aborts the whole `bookings` delete — and with it
 * the users, whose confirmed slots then break the next run.
 */
export async function deleteFixtureClients(
  client: DbClient,
  emailPrefix: string,
): Promise<void> {
  const userIds = await fixtureUserIds(client, emailPrefix);
  if (userIds.length === 0) return;

  const { data: bookings } = await client
    .from("bookings")
    .select("id")
    .in("client_id", userIds);
  const bookingIds = (bookings ?? []).map((row) => row.id);
  if (bookingIds.length > 0) {
    await client.from("payments").delete().in("booking_id", bookingIds);
    await client.from("booking_pets").delete().in("booking_id", bookingIds);
  }

  const { error } = await client
    .from("bookings")
    .delete()
    .in("client_id", userIds);
  if (error) {
    throw new Error(`Failed to clean up fixture bookings: ${error.message}`);
  }

  await client.from("booking_series").delete().in("client_id", userIds);
  await client.from("client_debits").delete().in("client_id", userIds);
  // Deleting the auth user cascades to the profile, but not to its pets.
  await client.from("pets").delete().in("client_id", userIds);

  await Promise.all(userIds.map((id) => client.auth.admin.deleteUser(id)));
}
