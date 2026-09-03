/**
 * Pure helpers for the admin bookings hub: the window a page reads, and the
 * predicates both views filter it with. No IO, no side effects — fully
 * unit-testable.
 */

// `denverMidnight` comes from the shared lib, not the booking client barrel:
// this module is re-exported from the admin client barrel, which the site
// header pulls into every public page, and `booking/index.client.ts` carries
// the Scheduler (react-day-picker + date-fns) with it. The type import below is
// erased, so it costs nothing.
import type { BookingStatusDb } from "@/features/booking/index.client";
import { denverDayKey, denverMidnight } from "@/lib/time-of-day";

import { matchesClientQuery } from "./client-search";
import type { BookingCalendarRow } from "./bookings-calendar-actions";

/** Every booking status the hub can filter to, plus the unfiltered default. */
export type BookingStatusFilter = "all" | BookingStatusDb;

/** `?month=` values the hub accepts: a four-digit year and a 01–12 month. */
const MONTH_PARAM = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;

/**
 * The instants bounding the Denver calendar month named by a `?month=YYYY-MM`
 * parameter — half-open, `[startIso, endIso)`. An absent or malformed parameter
 * falls back to the month containing `now`.
 *
 * The bounds are Denver midnights rather than UTC ones: an evening booking on
 * the last day of a month is already the next day in UTC, so a UTC window drops
 * it out of the month Cal is looking at.
 */
export function denverMonthWindow(
  monthParam: string | undefined,
  now: Date,
): { startIso: string; endIso: string } {
  const month =
    monthParam !== undefined && MONTH_PARAM.test(monthParam)
      ? monthParam
      : denverDayKey(now).slice(0, 7);
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const next =
    index === 12
      ? `${year + 1}-01`
      : `${year}-${String(index + 1).padStart(2, "0")}`;
  return {
    startIso: denverMidnight(`${month}-01`).toISOString(),
    endIso: denverMidnight(`${next}-01`).toISOString(),
  };
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

const DAY_MS = 86_400_000;

/**
 * Every Denver day-key a booking's `[starts_at, ends_at)` span touches. A stay
 * runs across several days and the calendar has to treat each of them as
 * booked, not only the day it checked in on.
 *
 * Stepping a whole day from an instant always lands on the next Denver calendar
 * day — a day across a DST change is 23 or 25 hours long, never short enough to
 * skip one — so the walk needs no midnight arithmetic. The check-out day is
 * added separately because the walk stops short of it whenever check-out is
 * earlier in the day than check-in. Keys can repeat; callers collect them into
 * a set.
 */
function denverDaysCovered(row: BookingCalendarRow): string[] {
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  const days = [denverDayKey(new Date(start))];
  for (let instant = start + DAY_MS; instant < end; instant += DAY_MS) {
    days.push(denverDayKey(new Date(instant)));
  }
  // The span is half-open, so the last instant inside it is a millisecond
  // before `ends_at`: a stay ending at midnight does not reach the next day.
  if (end > start) days.push(denverDayKey(new Date(end - 1)));
  return days;
}

/**
 * Returns the set of Denver day-keys (YYYY-MM-DD) covered by at least one
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
      for (const day of denverDaysCovered(row)) days.add(day);
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
