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
 */

import { fitsWindow, denverDayKey } from "./availability";
import type { TimeRange, BookingRuleSettings } from "./availability";

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
}

export interface DeriveBookableDaysArgs {
  /** One Denver-midnight instant per calendar day to classify. */
  days: Date[];
  windows: TimeRange[];
  /** Other resident (house_sitting) bookings that block whole days. */
  busyResident: TimeRange[];
  rules: BookingRuleSettings;
  now: Date;
}

/**
 * Classifies each calendar day for house_sitting check-in/out selection.
 *
 * Precedence: past → too-far → busy → out-of-window → available. A day spans
 * `[dayStart, dayStart + 24h)`; it is in-window if any availability window
 * overlaps that span and busy if any resident booking overlaps it.
 */
export function deriveBookableDays(
  args: DeriveBookableDaysArgs,
): DayAvailability[] {
  const { days, windows, busyResident, rules, now } = args;
  const todayKey = denverDayKey(now);

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
    } else if (busyResident.some((b) => overlapsHalfOpen(daySpan, b))) {
      state = "busy";
    } else if (!windows.some((w) => overlapsHalfOpen(daySpan, w))) {
      state = "out-of-window";
    } else {
      state = "available";
    }

    return { dayKey, dayStart, state };
  });
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
  windows: TimeRange[];
  busyResident: TimeRange[];
  rules: BookingRuleSettings;
  now: Date;
}

/**
 * Validates a house_sitting check-in/check-out date pair and resolves it to a
 * concrete instant range. Reuses `fitsWindow` for window containment; applies
 * lead-time and hard-max-advance on the resolved start; rejects overlap with
 * any existing resident booking. Hours-of-day holds by construction (both
 * anchored at `bookingOpenMinute`).
 */
export function validateStayRange(args: ValidateStayRangeArgs): StayValidation {
  const { checkIn, checkOut, windows, busyResident, rules, now } = args;

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

  if (!fitsWindow(range, windows)) {
    return {
      ok: false,
      reason: "Selected dates are outside Cal's availability.",
    };
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
