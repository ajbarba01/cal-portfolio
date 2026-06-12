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
// Denver hour helper
// ---------------------------------------------------------------------------

/**
 * Returns the local time-of-day of `date` as minutes since midnight (0–1439)
 * in America/Denver.
 *
 * Uses `Intl.DateTimeFormat` with `hour12: false`. The IANA tz database in the
 * JS runtime handles MST (UTC-7) and MDT (UTC-6) transparently — no manual
 * offset math.
 */
export function denverMinutesSinceMidnight(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteRaw = parts.find((p) => p.type === "minute")?.value ?? "0";
  // hour12:false can render midnight as "24" in some environments; normalise.
  const hour = parseInt(hourRaw, 10) % 24;
  const minute = parseInt(minuteRaw, 10);
  return hour * 60 + minute;
}

/**
 * Returns the America/Denver calendar day of `date` as an ISO "YYYY-MM-DD"
 * string. Pure: derived from `Intl.DateTimeFormat` with the IANA tz, no clock
 * read. Two instants on the same Denver day share a key regardless of UTC
 * offset (MST/MDT). Useful for grouping/comparing days without offset math.
 */
export function denverDayKey(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA renders ISO-ordered "YYYY-MM-DD".
  return fmt.format(date);
}

/**
 * America/Denver UTC offset in minutes east of UTC for the given instant
 * (negative: -420 in MST, -360 in MDT). Derived from `Intl` — DST-correct, no
 * hardcoded offsets.
 */
function denverOffsetMinutes(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)!.value, 10);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Inverse of {@link denverDayKey}: returns the UTC instant of 00:00 America/Denver
 * for the calendar day "YYYY-MM-DD". DST-correct (probes the offset at local
 * midday, after any 2am transition). Pure — no clock read.
 *
 * Calendar grids (month-range mode) select whole calendar days; the booking core
 * works in concrete instants. This bridges the two so `deriveBookableDays` /
 * `validateStayRange` receive true Denver-midnight instants.
 */
export function denverMidnight(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  const utc = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two-step solve: the offset at the first candidate can differ from the offset
  // at the UTC anchor across a DST transition (spring-forward midnight is still
  // standard time). Re-probe at the candidate and adopt that offset if it moved.
  const off1 = denverOffsetMinutes(new Date(utc));
  const candidate = utc - off1 * 60000;
  const off2 = denverOffsetMinutes(new Date(candidate));
  return new Date(off2 === off1 ? candidate : utc - off2 * 60000);
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
