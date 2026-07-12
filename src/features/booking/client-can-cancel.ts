/**
 * Pure client-cancellability predicate. Deliberately distinct from
 * clientCanEditBooking: cancel is ALWAYS allowed before start, including for
 * paid bookings and meet & greets (edit blocks both). The only gates are a
 * non-terminal status and the booking not having started yet. Precedence:
 * status first, then timing — so a past terminal booking reports "status".
 */
import type { BookingStatusDb } from "@/features/booking/booking-repository";

export interface CancellabilityInput {
  status: BookingStatusDb;
  startsAt: Date;
}

export type CancelBlockReason = "status" | "started";

export type Cancellability =
  | { cancellable: true }
  | { cancellable: false; reason: CancelBlockReason };

const CANCELLABLE_STATUSES: BookingStatusDb[] = [
  "pending_approval",
  "confirmed",
];

export function clientCanCancelBooking(
  booking: CancellabilityInput,
  now: Date,
): Cancellability {
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return { cancellable: false, reason: "status" };
  }
  if (now.getTime() >= booking.startsAt.getTime()) {
    return { cancellable: false, reason: "started" };
  }
  return { cancellable: true };
}

/** Inline copy for a locked (non-cancellable) row. */
export function cancelLockCopy(reason: CancelBlockReason): string {
  switch (reason) {
    case "status":
      return "This booking can no longer be cancelled.";
    case "started":
      return "Already started — contact Cal.";
  }
}
