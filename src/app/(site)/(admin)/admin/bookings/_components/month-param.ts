/**
 * The two conversions the bookings hub needs to keep one month on screen: the
 * `?month=YYYY-MM` parameter the page reads its window from, and the local
 * first-of-month `Date` the month grid reads its `month` prop in.
 *
 * The grid takes the year and month straight off the viewer's own clock, so the
 * Denver month cannot be handed to it as the instant the window starts at: that
 * instant is already the next month on a clock far enough east, and still the
 * previous one far enough west. Both sides of the round trip go through a local
 * first-of-month `Date` instead, which names a month and nothing finer.
 */

import { denverDayKey } from "@/lib/time-of-day";

/** The Denver month an instant falls in, as a local first-of-month `Date`. */
export function denverMonthDate(instantIso: string): Date {
  const [year = NaN, month = NaN] = denverDayKey(new Date(instantIso))
    .split("-")
    .map(Number);
  return new Date(year, month - 1, 1);
}

/** The `?month=` value naming the month a first-of-month `Date` is showing. */
export function monthParamOf(month: Date): string {
  const year = month.getFullYear();
  return `${year}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}
