/**
 * Pure availability guard functions.
 *
 * No IO, no clock reads (`Date.now()` / `new Date()` with no arg), no `fetch`.
 * All time inputs are passed in as arguments. (#5 ENGINEERING)
 *
 * TIMEZONE NOTE
 * -------------
 * The hours-of-day check uses America/Denver (single-timezone app). The Denver
 * hour is derived PURELY from the passed `Date` via `Intl.DateTimeFormat` with
 * the IANA timezone identifier. This reads no system clock and is deterministic.
 * MST/MDT transitions are handled automatically by the IANA tz database built
 * into the JS runtime — no manual offset arithmetic is required.
 *
 * BOUNDARY SEMANTICS
 * ------------------
 * - `fitsWindow`:      window.startsAt <= candidate.startsAt && candidate.endsAt <= window.endsAt  (both inclusive)
 * - `passesGuards` lead time:    candidate.startsAt - now >= minLeadTimeHours  (inclusive, i.e. exactly min is OK)
 * - `passesGuards` max advance:  candidate.startsAt - now <= maxAdvanceDays    (inclusive, i.e. exactly max is OK)
 * - `passesGuards` hour-of-day:  start hour in [bookingOpenHour, bookingCloseHour)  (open inclusive, close exclusive)
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

import type { PricingType } from "../pricing/types";

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
 * eligibility. All hours are America/Denver local hours (0–23).
 */
export interface BookingRuleSettings {
  /** Inclusive lower bound on start hour in America/Denver. */
  bookingOpenHour: number;
  /** Exclusive upper bound on start hour in America/Denver. */
  bookingCloseHour: number;
  /** Minimum hours between now and booking start (inclusive). */
  minLeadTimeHours: number;
  /** Maximum days between now and booking start (inclusive). */
  maxAdvanceDays: number;
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
 * Returns the local hour (0–23) of `date` in America/Denver.
 *
 * Uses `Intl.DateTimeFormat` with `hour12: false` so the hour is in [0, 23].
 * The IANA tz database in the JS runtime handles MST (UTC-7) and MDT (UTC-6)
 * transparently — no manual offset math.
 */
function denverHour(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    hour12: false,
  });
  // hour12:false with 'numeric' gives "0"–"23"; parseInt handles leading zeros.
  const raw = fmt.format(date);
  const h = parseInt(raw, 10);
  // Intl can return 24 for midnight in some environments; normalise.
  return h === 24 ? 0 : h;
}

// ---------------------------------------------------------------------------
// passesGuards
// ---------------------------------------------------------------------------

/**
 * Returns true only when ALL booking eligibility guards pass:
 *
 * 1. **Hours of day** — `candidate.startsAt` falls in [bookingOpenHour, bookingCloseHour)
 *    evaluated in America/Denver local time.
 * 2. **Lead time** — `candidate.startsAt - now >= minLeadTimeHours` (inclusive).
 * 3. **Max advance** — `candidate.startsAt - now <= maxAdvanceDays` (inclusive).
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

  // Max advance: must not be more than maxAdvanceDays in the future (inclusive)
  if (diffMs > settings.maxAdvanceDays * MS_PER_DAY) {
    return false;
  }

  // Hours of day: start hour in [open, close) in America/Denver
  const hour = denverHour(candidate.startsAt);
  if (hour < settings.bookingOpenHour || hour >= settings.bookingCloseHour) {
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
