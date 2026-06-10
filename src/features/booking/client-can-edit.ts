/**
 * Pure client-editability predicate for a booking. Used by BOTH the edit route
 * guard and the bookings-table affordance so they never diverge. Precedence is
 * deliberate: meet-greet → status → paid → cutoff. The cutoff branch also
 * naturally covers past bookings (now is far beyond start − cutoff window).
 */
import type { BookingStatusDb } from "@/features/booking/booking-repository";

export const MEET_GREET_SLUG = "meet-greet";

export interface EditabilityInput {
  status: BookingStatusDb;
  startsAt: Date;
  paidCents: number;
  serviceSlug: string;
}

export type EditabilityReason = "meet_greet" | "status" | "paid" | "cutoff";

export type Editability =
  | { editable: true }
  | { editable: false; reason: EditabilityReason };

const EDITABLE_STATUSES: BookingStatusDb[] = ["pending_approval", "confirmed"];

export function clientCanEditBooking(
  booking: EditabilityInput,
  now: Date,
  cancellationFullRefundHours: number,
): Editability {
  if (booking.serviceSlug === MEET_GREET_SLUG) {
    return { editable: false, reason: "meet_greet" };
  }
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { editable: false, reason: "status" };
  }
  if (booking.paidCents > 0) {
    return { editable: false, reason: "paid" };
  }
  const cutoffMs =
    booking.startsAt.getTime() - cancellationFullRefundHours * 60 * 60 * 1000;
  if (now.getTime() > cutoffMs) {
    return { editable: false, reason: "cutoff" };
  }
  return { editable: true };
}

/** Inline copy for a locked row / route redirect reason. */
export function editLockCopy(reason: EditabilityReason): string {
  switch (reason) {
    case "meet_greet":
      return "Reschedule your meet & greet from onboarding.";
    case "status":
      return "This booking can no longer be changed.";
    case "paid":
      return "Paid — contact Cal to make changes.";
    case "cutoff":
      return "Inside 48h — contact Cal.";
  }
}
