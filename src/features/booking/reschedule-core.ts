/**
 * rescheduleBookingCore — move a booking's time in place.
 */

import { haversineMiles } from "@/lib/haversine";
import type { BookingStatusDb } from "./booking-repository";
import { deriveTimeApproval } from "./time-gate";
import {
  toRuleSettings,
  passesGuards,
  fitsWindow,
  fitsOvernightNights,
  type BookingServiceDeps,
} from "./booking-service-shared";
import { findDriveBufferConflicts } from "./drive-buffer-guard";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type RescheduleBookingResult =
  | { kind: "success" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "error"; message: string };

export interface RescheduleBookingInput {
  bookingId: string;
  /** Verified session user id — ownership is checked against the booking row. */
  userId: string;
  /** New start instant; the booking's existing duration is preserved. */
  startsAt: Date;
}

/** Statuses a client may reschedule from (terminal/past states are rejected). */
const RESCHEDULABLE_STATUSES: BookingStatusDb[] = [
  "pending_approval",
  "confirmed",
];

// ──────────────────────────────────────────────────────────────────────────────
// rescheduleBookingCore
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generalized reschedule: validates the new slot the same way createBookingCore
 * validates a new booking (rule guards, availability-window containment, the
 * time-horizon hard cap, drive-time spacing), then UPDATEs the row's time IN
 * PLACE. The booking's duration, status, and price are preserved — only the
 * start/end move. The DB exclusion constraint is the overlap arbiter (and
 * naturally excludes the row's own old time), so this sidesteps the
 * create-path's one-at-a-time gate.
 *
 * This is the shared primitive for rescheduling ANY future booking; the
 * meet-greet onboarding flow is its first consumer.
 */
export async function rescheduleBookingCore(
  deps: BookingServiceDeps,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  const { repo, now } = deps;

  const booking = await repo.getBookingTimes(input.bookingId);
  if (!booking) return { kind: "not_found" };
  if (booking.client_id !== input.userId) return { kind: "forbidden" };
  if (!RESCHEDULABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }

  // Preserve the booking's duration; only the start moves.
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + durationMs);

  const settings = await repo.getSettings();
  const ruleSettings = toRuleSettings(settings);

  // Mirror createBookingCore validation for the new slot.
  const timeDecision = deriveTimeApproval(startsAt, now, {
    autoConfirmHorizonDays: settings.auto_confirm_horizon_days,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  });
  if (timeDecision === "refuse") {
    return {
      kind: "refuse",
      reason: `Requested start ${startsAt.toISOString()} is beyond the ${settings.hard_max_advance_days}-day booking limit.`,
    };
  }
  if (!passesGuards({ startsAt, endsAt }, ruleSettings, now)) {
    return {
      kind: "unavailable",
      reason:
        "The selected time does not meet booking rules (hours-of-day, lead time, or max advance).",
    };
  }
  // Availability containment, gated by service type (window vs overnight
  // nights). The pair slotIsAvailable wraps is inlined here because the
  // drive-time guard below needs the same window list — create-core and
  // edit-core inline it for the same reason rather than reading the windows
  // twice.
  const slot = { startsAt, endsAt };
  const isHouseSitting = booking.pricingType === "house_sitting";
  const openWindows = isHouseSitting ? [] : await repo.getOpenWindows(now);
  const available = isHouseSitting
    ? fitsOvernightNights(slot, await repo.getOpenNights(now))
    : fitsWindow(slot, openWindows);
  if (!available) {
    return {
      kind: "unavailable",
      reason: "The selected time is not within Cal's availability.",
    };
  }

  // Drive-time spacing — the same guard create and edit enforce, so a
  // reschedule can never land in a slot the client could not have booked.
  //
  // Skipped in two cases. House-sitting: a stay is resident, reserves no travel
  // time, and fits no intraday window, so a padded window check would refuse
  // every stay. A reschedule that does not move the booking (the duration is
  // preserved, so an unchanged start is an unchanged range): it places nothing
  // new on the calendar, and the guard pads the candidate by the client's own
  // buffer before checking window fit — a booking already sitting within its
  // buffer of a window edge would otherwise refuse its own time.
  //
  // When the time does move, the booking is dropped twice over — from the query
  // and again inside the guard — so its own range cannot block its own move.
  const timeChanged = startsAt.getTime() !== booking.startsAt.getTime();
  if (!isHouseSitting && timeChanged) {
    const distanceMiles =
      booking.clientLat !== null && booking.clientLng !== null
        ? haversineMiles(
            { lat: settings.origin_lat, lng: settings.origin_lng },
            { lat: booking.clientLat, lng: booking.clientLng },
          )
        : null;
    const conflicts = findDriveBufferConflicts({
      candidates: [slot],
      candidateDistanceMiles: distanceMiles,
      existing: await repo.getActiveBusyRanges(
        now,
        booking.concurrency,
        input.bookingId,
      ),
      openWindows,
      settings,
      excludeBookingId: input.bookingId,
    });
    if (conflicts.length > 0) {
      return {
        kind: "unavailable",
        reason:
          "That time doesn't leave enough travel time around another booking. Please pick another slot.",
      };
    }
  }

  try {
    await repo.updateBookingTimes(input.bookingId, startsAt, endsAt);
    return { kind: "success" };
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23P01") {
      return { kind: "slot_taken" };
    }
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
