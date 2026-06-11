/**
 * Pure view-layer predicates for the admin bookings hub.
 * No IO, no side effects — fully unit-testable.
 */

import { matchesClientQuery } from "./client-search";
import type { BookingCalendarRow } from "./bookings-calendar-actions";

export type BookingStatusFilter =
  | "all"
  | "pending_approval"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "declined"
  | "no_show";

const TIME_ZONE = "America/Denver";

const denverDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDenverDayKey(isoString: string): string {
  return denverDayFormatter.format(new Date(isoString));
}

/**
 * Filters bookings by status, service type, and client search query.
 * - status "all" passes every row through the status check.
 * - service "all" (or undefined) passes every row through the service check.
 * - query is matched against `client_name` (case-insensitive substring).
 */
export function filterBookings(
  rows: BookingCalendarRow[],
  {
    status,
    query,
    service,
  }: { status: BookingStatusFilter; query: string; service?: string },
): BookingCalendarRow[] {
  return rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (service != null && service !== "all" && row.service_name !== service)
      return false;
    return matchesClientQuery(
      { full_name: row.client_name, email: null, phone: null },
      query,
    );
  });
}

/**
 * Returns the set of Denver day-keys (YYYY-MM-DD) that have at least one
 * booking matching `query`. Used to drive calendar hatch styling.
 */
export function daysWithMatch(
  rows: BookingCalendarRow[],
  query: string,
): Set<string> {
  const days = new Set<string>();
  for (const row of rows) {
    if (
      matchesClientQuery(
        { full_name: row.client_name, email: null, phone: null },
        query,
      )
    ) {
      days.add(toDenverDayKey(row.starts_at));
    }
  }
  return days;
}

/**
 * Returns a single-element array containing the row with the given id,
 * or an empty array if not found. Used to isolate a booking on click.
 */
export function isolate(
  rows: BookingCalendarRow[],
  id: string,
): BookingCalendarRow[] {
  const found = rows.find((row) => row.id === id);
  return found ? [found] : [];
}
