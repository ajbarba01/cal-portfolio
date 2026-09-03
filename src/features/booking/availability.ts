/**
 * Pure availability guard functions.
 *
 * No IO, no clock reads (`Date.now()` / `new Date()` with no arg), no `fetch`.
 * All time inputs are passed in as arguments. (#5 ENGINEERING)
 *
 * TIMEZONE NOTE
 * -------------
 * The hours-of-day check uses America/Denver (single-timezone app). The Denver
 * minutes-since-midnight are derived PURELY from the passed `Date` via
 * `Intl.DateTimeFormat` with the IANA timezone identifier. This reads no system
 * clock and is deterministic. MST/MDT transitions are handled automatically by
 * the IANA tz database built into the JS runtime — no manual offset arithmetic.
 *
 * The Denver formatters and timezone arithmetic themselves live in
 * `@/lib/time-of-day` (business-agnostic, and reachable without pulling the
 * booking client graph in); this module re-exports the pair its callers use.
 *
 * BOUNDARY SEMANTICS
 * ------------------
 * - `fitsWindow`:      window.startsAt <= candidate.startsAt && candidate.endsAt <= window.endsAt  (both inclusive)
 * - `passesGuards` lead time:    candidate.startsAt - now >= minLeadTimeHours  (inclusive, i.e. exactly min is OK)
 * - `passesGuards` hard max advance:  candidate.startsAt - now <= hardMaxAdvanceDays  (inclusive; outer sanity cap only)
 * - `passesGuards` hours-of-day: start minute >= bookingOpenMinute AND end minute <= bookingCloseMinute
 *                                (both inclusive), each evaluated in America/Denver. The end bound uses
 *                                the end's local time-of-day regardless of date (a multi-day stay still
 *                                must end at a time-of-day at or before close).
 *
 * RECURRING DISCOUNT — house_sitting nuance
 * ------------------------------------------
 * Three nights within ONE stay = ONE occurrence element (one booking). That
 * single element does not meet the min-occurrences threshold. Three distinct
 * stays = three elements and DOES qualify. The `pricingType` parameter is part
 * of the signature for caller clarity and future divergence; currently the
 * arithmetic is identical across all types. If per-type logic is ever needed,
 * add it here without changing the call sites.
 */

import type { PricingType } from "@/features/pricing";
import {
  denverDayKey,
  denverMidnight,
  denverMinutesSinceMidnight,
} from "@/lib/time-of-day";

// The Denver formatters and timezone arithmetic belong to the shared display
// module; re-exported here so the availability callers keep one import for the
// whole Denver helper set.
export { denverDayKey, denverMidnight, denverMinutesSinceMidnight };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A half-open or closed time range (interpretation depends on context). */
export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Settings derived from the DB `settings` columns that govern booking
 * eligibility. Booking hours are minutes-since-midnight, America/Denver local
 * (390 = 6:30am, 1320 = 10:00pm).
 */
export interface BookingRuleSettings {
  /** Inclusive lower bound on start time, minutes-since-midnight (America/Denver). */
  bookingOpenMinute: number;
  /** Inclusive upper bound on end time, minutes-since-midnight (America/Denver). */
  bookingCloseMinute: number;
  /** Minimum hours between now and booking start (inclusive). */
  minLeadTimeHours: number;
  /**
   * Hard outer cap on how far ahead a booking may start, in days (inclusive).
   * A start beyond this is refused outright. The soft auto-confirm horizon
   * (pend-not-refuse) lives in the time gate, not here — see time-gate.ts.
   */
  hardMaxAdvanceDays: number;
  /**
   * Hours before the booking start within which a free-cancellation refund is
   * available. From settings.cancellation_full_refund_hours.
   * Optional: only loaded for surfaces that need to display the policy line.
   */
  cancellationFullRefundHours?: number;
  /**
   * Percentage of the booking total the client keeps on a late cancellation.
   * From settings.late_cancel_refund_pct.
   * Optional: only loaded for surfaces that need to display the policy line.
   */
  lateCancelRefundPct?: number;
}

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// fitsWindow
// ---------------------------------------------------------------------------

/**
 * Returns true iff `candidate` is fully contained within at least one open
 * window (both boundaries inclusive).
 *
 * Empty `openWindows` → false.
 */
export function fitsWindow(
  candidate: TimeRange,
  openWindows: TimeRange[],
): boolean {
  return openWindows.some(
    (w) =>
      w.startsAt.getTime() <= candidate.startsAt.getTime() &&
      candidate.endsAt.getTime() <= w.endsAt.getTime(),
  );
}

// ---------------------------------------------------------------------------
// fitsOvernightNights
// ---------------------------------------------------------------------------

/**
 * Overnight (house_sitting) availability guard — the server-side mirror of the
 * calendar's `validateStayRange` night check. A multi-day stay is ONE occurrence
 * with a multi-day span, so it can never sit inside a single intraday
 * `availability_window`; overnight stays are instead gated per night by the
 * `overnight_nights` table (see migration 20260603140000). This is the sole
 * source of truth for when overnight stays are bookable.
 *
 * Returns true iff EVERY night Cal sleeps over — the Denver calendar days in
 * `[startsAt's day, endsAt's day)` — is present in `overnightNights`. Comparison
 * is by Denver day-key (not raw instant) so the checkout-day morning does NOT
 * count as a required night: a one-night stay D→D+1 only needs night D.
 *
 * Empty set, zero-length/inverted span, or any missing night → false.
 */
export function fitsOvernightNights(
  candidate: TimeRange,
  overnightNights: Set<string>,
): boolean {
  const checkoutKey = denverDayKey(candidate.endsAt);
  let key = denverDayKey(candidate.startsAt);
  // Need at least one night: the first night's day must precede the checkout day.
  if (key >= checkoutKey) return false;
  while (key < checkoutKey) {
    if (!overnightNights.has(key)) return false;
    key = denverDayKey(nextDenverMidnight(key));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Denver day helper
// ---------------------------------------------------------------------------

/**
 * Denver midnight on the calendar day AFTER `dayKey` — the DST-correct step for
 * walking Denver days one at a time. `Date.UTC` rolls a day number past the end
 * of its month over, so no month-length math is needed here.
 */
export function nextDenverMidnight(dayKey: string): Date {
  const [y = NaN, m = NaN, d = NaN] = dayKey
    .split("-")
    .map((n) => parseInt(n, 10));
  return denverMidnight(
    `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
  );
}

// ---------------------------------------------------------------------------
// passesGuards
// ---------------------------------------------------------------------------

/**
 * Returns true only when ALL booking eligibility guards pass:
 *
 * 1. **Hours of day** — `candidate.startsAt` time-of-day >= bookingOpenMinute AND
 *    `candidate.endsAt` time-of-day <= bookingCloseMinute, evaluated in
 *    America/Denver local time (both bounds inclusive).
 * 2. **Lead time** — `candidate.startsAt - now >= minLeadTimeHours` (inclusive).
 * 3. **Hard max advance** — `candidate.startsAt - now <= hardMaxAdvanceDays` (inclusive).
 *    This is only the outer sanity cap; the soft pend-not-refuse horizon lives
 *    in the time gate (see time-gate.ts), not in this guard.
 *
 * @param candidate - The proposed booking time range.
 * @param settings  - Booking rule settings sourced from the DB `settings` row.
 * @param now       - Current time, passed in (no clock reads).
 */
export function passesGuards(
  candidate: TimeRange,
  settings: BookingRuleSettings,
  now: Date,
): boolean {
  const diffMs = candidate.startsAt.getTime() - now.getTime();

  // Lead time: must have at least minLeadTimeHours before booking start (inclusive)
  if (diffMs < settings.minLeadTimeHours * MS_PER_HOUR) {
    return false;
  }

  // Hard max advance: must not be more than hardMaxAdvanceDays out (inclusive).
  // The soft horizon (pend, not refuse) is applied separately by the time gate.
  if (diffMs > settings.hardMaxAdvanceDays * MS_PER_DAY) {
    return false;
  }

  // Hours of day: start >= open AND end <= close, in America/Denver (both inclusive)
  if (
    denverMinutesSinceMidnight(candidate.startsAt) < settings.bookingOpenMinute
  ) {
    return false;
  }
  if (
    denverMinutesSinceMidnight(candidate.endsAt) > settings.bookingCloseMinute
  ) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// seriesQualifiesForRecurringDiscount
// ---------------------------------------------------------------------------

/**
 * Returns true when the series has at least `recurringMinOccurrences` distinct
 * booking occurrences.
 *
 * HOUSE_SITTING NUANCE: Multiple nights within a single stay are ONE booking
 * (one element in `occurrences`). Three distinct stays = three elements. The
 * caller is responsible for passing one element per discrete booking, not one
 * per night.
 *
 * PRICING TYPE: `pricingType` is included in the signature for caller clarity
 * and to allow per-type divergence in the future without a call-site change.
 * Currently the qualification arithmetic is identical across all types.
 *
 * DISTINCT: occurrences with identical start timestamps are deduplicated by
 * timestamp value (two references to the same Date count once).
 */
export function seriesQualifiesForRecurringDiscount(
  occurrences: Date[],
  _pricingType: PricingType,
  settings: { recurringMinOccurrences: number },
): boolean {
  const distinctCount = new Set(occurrences.map((d) => d.getTime())).size;
  return distinctCount >= settings.recurringMinOccurrences;
}
