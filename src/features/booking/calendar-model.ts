/**
 * Pure calendar-derivation model.
 *
 * Feeds the calendar UI without duplicating eligibility logic: reuses the
 * guards in `availability.ts`. No IO, no clock reads — `now` is always passed
 * in. (#5 ENGINEERING)
 *
 * OVERLAP SEMANTICS
 * -----------------
 * All overlap tests are HALF-OPEN `[)` to match the Postgres GiST exclusion
 * constraint (`tstzrange(..., '[)')`): two ranges that only touch at a boundary
 * do NOT overlap. This keeps the calendar from disabling a slot the DB would
 * accept (or vice-versa).
 *
 * HOUSE_SITTING TIME-OF-DAY
 * -------------------------
 * Month-range mode selects whole calendar days (check-in / check-out dates).
 * `validateStayRange` resolves those to a concrete instant range by anchoring
 * both check-in and check-out at `bookingOpenMinute` (Denver). An N-night stay
 * therefore spans exactly N×24h and trivially satisfies the hours-of-day guard
 * (start time-of-day == open >= open; end time-of-day == open <= close).
 *
 * OVERNIGHT NIGHTS
 * ----------------
 * Overnight (house_sitting) availability is driven by the `overnight_nights`
 * table — an explicit set of Denver calendar-day keys ("YYYY-MM-DD") on which
 * Cal is available to start sleeping over. `overnightNights` replaces the old
 * `windows: TimeRange[]` in both `DeriveBookableDaysArgs` and
 * `ValidateStayRangeArgs`.
 */

import { denverDayKey, denverMidnight } from "./availability";
import type { TimeRange, BookingRuleSettings } from "./availability";
import { startOptions, type MinuteWindow } from "./day-timeline-model";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// Overlap
// ---------------------------------------------------------------------------

/**
 * Half-open `[)` overlap: true iff the ranges share any instant, treating each
 * range's end as exclusive. Boundary-touching ranges do NOT overlap.
 */
export function overlapsHalfOpen(a: TimeRange, b: TimeRange): boolean {
  return (
    a.startsAt.getTime() < b.endsAt.getTime() &&
    b.startsAt.getTime() < a.endsAt.getTime()
  );
}

// ---------------------------------------------------------------------------
// markSlotsBusy
// ---------------------------------------------------------------------------

export interface MarkedSlot {
  slot: TimeRange;
  busy: boolean;
}

/**
 * Tags each slot with whether it overlaps any busy range (half-open). Advisory
 * only — the DB exclusion constraint arbitrates at submit. Callers should have
 * already filtered `busy` to the relevant concurrency class.
 */
export function markSlotsBusy(
  slots: TimeRange[],
  busy: TimeRange[],
): MarkedSlot[] {
  return slots.map((slot) => ({
    slot,
    busy: busy.some((b) => overlapsHalfOpen(slot, b)),
  }));
}

// ---------------------------------------------------------------------------
// deriveBookableDays (house_sitting month view)
// ---------------------------------------------------------------------------

export type DayState =
  | "available"
  | "busy"
  | "out-of-window"
  | "past"
  | "too-far";

export interface DayAvailability {
  /** America/Denver calendar day, "YYYY-MM-DD". */
  dayKey: string;
  /** The Denver-midnight instant passed in for this day. */
  dayStart: Date;
  state: DayState;
  /**
   * Set only when `state === 'busy'` and the overlapping resident booking
   * carries an id; identifies the owning booking for grouping/inspection.
   */
  bookingId?: string;
}

/**
 * Resident booking that blocks whole days.
 * `id` is optional — plain `TimeRange` callers still type-check.
 * When present, surfaced as {@link DayAvailability.bookingId}.
 */
export interface ResidentBusy extends TimeRange {
  id?: string;
}

export interface DeriveBookableDaysArgs {
  /** One Denver-midnight instant per calendar day to classify. */
  days: Date[];
  /** Set of Denver day-keys ("YYYY-MM-DD") that are overnight-bookable. */
  overnightNights: Set<string>;
  /** Other resident (house_sitting) bookings that block whole days. */
  busyResident: ResidentBusy[];
  rules: BookingRuleSettings;
  now: Date;
}

/**
 * Classifies each calendar day for house_sitting check-in/out selection.
 *
 * Precedence: past → too-far → busy → out-of-window → available. A day is
 * in-window if its dayKey is present in `overnightNights`; busy if any
 * resident booking overlaps the day span `[dayStart, dayStart + 24h)`.
 * Busy uses the first matching block in `busyResident`; overlapping resident
 * bookings are prevented by the DB exclusion constraint in practice.
 *
 * U2: Days within the lead-time window (`rules.minLeadTimeHours`) are treated
 * as `"out-of-window"` so they render grey in the calendar instead of
 * surfacing a post-selection error. Lead-time applies to the check-in start
 * (anchored at `bookingOpenMinute`); a day is blocked when that start instant
 * is less than `now + minLeadTimeHours` ahead.
 */
export function deriveBookableDays(
  args: DeriveBookableDaysArgs,
): DayAvailability[] {
  const { days, overnightNights, busyResident, rules, now } = args;
  const todayKey = denverDayKey(now);
  // Earliest bookable check-in start (absolute ms) — accounts for lead time.
  const leadTimeMs = rules.minLeadTimeHours * MS_PER_HOUR;
  const bookingOpenMs = rules.bookingOpenMinute * MS_PER_MIN;

  return days.map((dayStart) => {
    const dayKey = denverDayKey(dayStart);
    const daySpan: TimeRange = {
      startsAt: dayStart,
      endsAt: new Date(dayStart.getTime() + MS_PER_DAY),
    };

    let state: DayState;
    if (dayKey < todayKey) {
      state = "past";
    } else if (
      (dayStart.getTime() - now.getTime()) / MS_PER_DAY >
      rules.hardMaxAdvanceDays
    ) {
      state = "too-far";
    } else {
      const busyMatch = busyResident.find((b) => overlapsHalfOpen(daySpan, b));
      if (busyMatch !== undefined) {
        return { dayKey, dayStart, state: "busy", bookingId: busyMatch.id };
      } else if (!overnightNights.has(dayKey)) {
        state = "out-of-window";
      } else {
        // U2: check-in start for this day (dayStart + bookingOpenMinute).
        const checkInStartMs = dayStart.getTime() + bookingOpenMs;
        if (checkInStartMs - now.getTime() < leadTimeMs) {
          // Within lead-time window — show grey (same visual as out-of-window).
          state = "out-of-window";
        } else {
          state = "available";
        }
      }
    }

    return { dayKey, dayStart, state };
  });
}

// ---------------------------------------------------------------------------
// hourlyAvailableDayKeys (hourly month view — duration-aware)
// ---------------------------------------------------------------------------

export interface HourlyAvailableDayKeysArgs {
  /** One Denver-midnight instant per calendar day to consider. */
  days: Date[];
  /** Open availability windows (absolute instants). */
  windows: TimeRange[];
  /** Busy ranges (absolute instants) that block candidate starts. */
  busy: TimeRange[];
  /** Booking duration in minutes (drives slot fit). */
  durationMin: number;
  /** Start-time granularity in minutes. */
  granularityMin: number;
  /**
   * U2: Minimum lead time in milliseconds. When provided with `now`, any start
   * time before `now + leadTimeMs` is excluded from candidate starts — so a day
   * with no remaining valid starts (all within the lead-time window) is omitted
   * from the available set and renders grey in the calendar.
   */
  leadTimeMs?: number;
  /** Current instant (required when `leadTimeMs` is provided). */
  now?: Date;
}

/**
 * Day-keys that have at least one bookable start for an hourly service of the
 * given duration: a granularity-aligned start that fits an open window for that
 * day AND whose [start, start+duration) does not overlap any busy range.
 *
 * Mirrors `Scheduler.DayTimeline`'s candidate-start logic exactly so the month
 * grid and the day timeline never disagree. Pass this set as `overnightNights`
 * to {@link deriveBookableDays} to drive the hourly month "available" state, so
 * changing the duration re-derives which days are open.
 *
 * U2: When `leadTimeMs` + `now` are provided, starts before `now + leadTimeMs`
 * are filtered out, making lead-time-blocked days appear unavailable (grey) in
 * the month grid instead of surfacing a post-selection error.
 */
export function hourlyAvailableDayKeys(
  args: HourlyAvailableDayKeysArgs,
): Set<string> {
  const { days, windows, busy, durationMin, granularityMin, leadTimeMs, now } =
    args;
  // Earliest bookable start instant (absolute ms). Undefined when no lead-time.
  const earliestStartMs =
    leadTimeMs !== undefined && now !== undefined
      ? now.getTime() + leadTimeMs
      : undefined;

  const out = new Set<string>();

  for (const dayStart of days) {
    const startMs = dayStart.getTime();
    const endMs = startMs + MS_PER_DAY;

    const minuteWindows: MinuteWindow[] = windows
      .filter(
        (w) => w.startsAt.getTime() < endMs && w.endsAt.getTime() > startMs,
      )
      .map((w) => {
        const openMs = Math.max(w.startsAt.getTime(), startMs);
        const closeMs = Math.min(w.endsAt.getTime(), endMs);
        return [
          Math.round((openMs - startMs) / MS_PER_MIN),
          Math.round((closeMs - startMs) / MS_PER_MIN),
        ] as MinuteWindow;
      })
      .filter(([open, close]) => close > open);

    if (minuteWindows.length === 0) continue;

    const starts = startOptions({
      windows: minuteWindows,
      durationMin,
      granularityMin,
    });
    const hasFree = starts.some((s) => {
      const candidateStartMs = startMs + s * MS_PER_MIN;
      // U2: skip any start that falls within the lead-time window.
      if (earliestStartMs !== undefined && candidateStartMs < earliestStartMs) {
        return false;
      }
      const candidate: TimeRange = {
        startsAt: new Date(candidateStartMs),
        endsAt: new Date(startMs + (s + durationMin) * MS_PER_MIN),
      };
      return !busy.some((b) => overlapsHalfOpen(candidate, b));
    });

    if (hasFree) out.add(denverDayKey(dayStart));
  }

  return out;
}

// ---------------------------------------------------------------------------
// validateStayRange (house_sitting check-in/out → concrete range)
// ---------------------------------------------------------------------------

export type StayValidation =
  | { ok: true; nights: number; range: TimeRange }
  | { ok: false; reason: string };

export interface ValidateStayRangeArgs {
  /** Denver-midnight instant of the check-in date. */
  checkIn: Date;
  /** Denver-midnight instant of the check-out date. */
  checkOut: Date;
  /** Set of Denver day-keys ("YYYY-MM-DD") that are overnight-bookable. */
  overnightNights: Set<string>;
  busyResident: TimeRange[];
  rules: BookingRuleSettings;
  now: Date;
}

/**
 * Validates a house_sitting check-in/check-out date pair and resolves it to a
 * concrete instant range. Checks that every covered night [checkIn, checkOut)
 * is in `overnightNights`; applies lead-time and hard-max-advance on the
 * resolved start; rejects overlap with any existing resident booking.
 * Hours-of-day holds by construction (both anchored at `bookingOpenMinute`).
 *
 * NIGHT ENUMERATION (DST-safe)
 * Each night n (0-indexed from checkIn) is identified by computing its Denver
 * midnight via `denverMidnight` on the n-th day key, which is derived from the
 * n-th Denver midnight itself — a fixed-point that correctly handles the
 * spring-forward / fall-back 1h gap without drift.
 */
export function validateStayRange(args: ValidateStayRangeArgs): StayValidation {
  const { checkIn, checkOut, overnightNights, busyResident, rules, now } = args;

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY,
  );
  if (nights < 1) {
    return {
      ok: false,
      reason: "Check-out must be at least one night after check-in.",
    };
  }

  const offsetMs = rules.bookingOpenMinute * MS_PER_MIN;
  const range: TimeRange = {
    startsAt: new Date(checkIn.getTime() + offsetMs),
    endsAt: new Date(checkOut.getTime() + offsetMs),
  };

  // Check every night [checkIn, checkOut) is in overnightNights. Enumerate
  // covered nights DST-safely: start from checkIn's dayKey, advance via
  // denverMidnight to get successive true midnight instants, stop when the
  // resulting instant >= checkOut.
  let cursor = checkIn;
  while (cursor.getTime() < checkOut.getTime()) {
    const dayKey = denverDayKey(cursor);
    if (!overnightNights.has(dayKey)) {
      return {
        ok: false,
        reason: "Selected dates are outside Cal's availability.",
      };
    }
    // Advance to next Denver midnight DST-correctly.
    const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
    cursor = denverMidnight(
      `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`,
    );
  }

  const leadMs = range.startsAt.getTime() - now.getTime();
  if (leadMs < rules.minLeadTimeHours * MS_PER_HOUR) {
    return {
      ok: false,
      reason: "Check-in is too soon — more lead time required.",
    };
  }
  if (leadMs > rules.hardMaxAdvanceDays * MS_PER_DAY) {
    return { ok: false, reason: "Check-in is too far in advance." };
  }

  if (busyResident.some((b) => overlapsHalfOpen(range, b))) {
    return { ok: false, reason: "Those dates overlap an existing booking." };
  }

  return { ok: true, nights, range };
}
