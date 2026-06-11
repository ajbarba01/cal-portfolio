/**
 * Pure projection functions for payment status.
 * No IO, no side effects — fully unit-testable.
 *
 * Rules for computePaymentStatus (paid-first, refund-netting):
 *   capturedSum = Σ amountCents where status ∈ { 'succeeded', 'refunded' }
 *   refundedSum = Σ refundedCents across all txns
 *   netPaid     = capturedSum − refundedSum
 *
 *   if finalCents > 0 && netPaid >= finalCents → 'paid'       (paid-first: overpay-safe)
 *   else if capturedSum > 0 && refundedSum >= capturedSum → 'refunded'
 *   else if refundedSum > 0                               → 'partially_refunded'
 *   else                                                  → 'unpaid'
 */

import type { PaymentTxn } from "./types";

export type BookingPaymentStatus =
  | "unpaid"
  | "paid"
  | "partially_refunded"
  | "refunded";

/** Captured money = succeeded + (now-refunded) rows; refunds tracked separately. */
function sums(txns: PaymentTxn[]): {
  capturedSum: number;
  refundedSum: number;
} {
  const capturedSum = txns
    .filter((t) => t.status === "succeeded" || t.status === "refunded")
    .reduce((acc, t) => acc + t.amountCents, 0);
  const refundedSum = txns.reduce((acc, t) => acc + t.refundedCents, 0);
  return { capturedSum, refundedSum };
}

/**
 * Derives the booking-level payment status from transaction history.
 *
 * Precedence (paid FIRST — overpay-safe): a refund that does not drop net paid
 * below the bill keeps the booking 'paid' (the PAY5 overpay-reconcile case);
 * the late-cancel retained-half case (net < final) falls through to
 * 'partially_refunded'; a full refund (net 0) resolves to 'refunded'.
 */
export function computePaymentStatus(
  finalCents: number,
  txns: PaymentTxn[],
): BookingPaymentStatus {
  const { capturedSum, refundedSum } = sums(txns);
  const netPaid = capturedSum - refundedSum;

  if (finalCents > 0 && netPaid >= finalCents) return "paid";
  if (capturedSum > 0 && refundedSum >= capturedSum) return "refunded";
  if (refundedSum > 0) return "partially_refunded";
  return "unpaid";
}

/** Cents still owed after netting succeeded payments against refunds. Clamps to 0. */
export function amountOwedCents(
  finalCents: number,
  txns: PaymentTxn[],
): number {
  const { capturedSum, refundedSum } = sums(txns);
  return Math.max(0, finalCents - (capturedSum - refundedSum));
}
