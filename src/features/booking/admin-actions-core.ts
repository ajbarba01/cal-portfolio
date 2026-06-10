/**
 * Admin booking operations: grant-full-refund, mark-no-show, settle-debt.
 */

import { computeCancellationDebtCents } from "./cancellation";
import { transition } from "./state-machine";
import type { BookingServiceDeps } from "./booking-service-shared";
import type { CancelDeps } from "./cancel-core";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type AdminBookingResult =
  | { kind: "success" }
  | { kind: "not_found" }
  | { kind: "invalid_state"; message: string }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Admin operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Admin grants the remaining (full) refund beyond the default late-cancel tier:
 * refunds whatever paid amount has not yet been refunded. Authorization is the
 * caller's responsibility (admin-gated action wrapper).
 */
export async function grantFullRefundCore(
  deps: CancelDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo, gateway } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const refundedCents = booking.payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const remaining = paidCents - refundedCents;
  if (remaining <= 0) return { kind: "success" }; // nothing left to refund

  const intent =
    booking.payments.find((p) => p.status === "succeeded")?.paymentIntentId ??
    booking.payments[0]?.paymentIntentId;
  if (!intent) return { kind: "success" };

  await gateway.refund(intent, remaining);
  return { kind: "success" };
}

/**
 * Admin marks a confirmed booking a no-show: transitions to the terminal
 * `no_show` state and writes a `client_debits` row for `no_show_charge_pct` of
 * the final amount. Authorization is the caller's responsibility.
 */
export async function markNoShowCore(
  deps: BookingServiceDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  const transitionResult = transition(booking.status, "no_show", {
    requiresApproval: false,
  });
  if ("error" in transitionResult) {
    return { kind: "invalid_state", message: transitionResult.error };
  }

  await repo.updateBookingStatus(bookingId, transitionResult.state);

  const settings = await repo.getSettings();
  const debtCents = computeCancellationDebtCents({
    finalCents: booking.finalCents,
    reason: "no_show",
    lateRefundPct: settings.late_cancel_refund_pct,
    noShowChargePct: settings.no_show_charge_pct,
  });
  if (debtCents > 0) {
    await repo.insertDebit({
      client_id: booking.client_id,
      booking_id: booking.id,
      amount_cents: debtCents,
      reason: "no_show",
    });
  }

  return { kind: "success" };
}

/** Admin marks a debit settled (Cal collected offline or the client paid). */
export async function settleDebtCore(
  deps: BookingServiceDeps,
  debitId: string,
): Promise<AdminBookingResult> {
  await deps.repo.settleDebit(debitId, deps.now);
  return { kind: "success" };
}
