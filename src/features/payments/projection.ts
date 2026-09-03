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

/**
 * Captured money = succeeded + (now-refunded) rows; refunds tracked separately.
 * Exported for callers that need the two halves apart (e.g. clamping a refund
 * request); callers that only want the difference should use `netPaid`.
 */
export function sums(txns: PaymentTxn[]): {
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

/**
 * Cents the client is actually out of pocket: captured money minus everything
 * refunded. Every "how much has been paid" question routes through this rather
 * than summing gross amounts, which over-counts after a partial refund.
 */
export function netPaid(txns: PaymentTxn[]): number {
  const { capturedSum, refundedSum } = sums(txns);
  return capturedSum - refundedSum;
}

/** Cents still owed after netting succeeded payments against refunds. Clamps to 0. */
export function amountOwedCents(
  finalCents: number,
  txns: PaymentTxn[],
): number {
  return Math.max(0, finalCents - netPaid(txns));
}

/** How much of a refund request one transaction should carry. */
export interface RefundAllocation<T> {
  txn: T;
  amountCents: number;
}

/**
 * Splits a refund request across the transactions that actually captured money,
 * never asking any one of them for more than it has left
 * (`amountCents - refundedCents`).
 *
 * Aiming a whole request at the first succeeded transaction over-refunds it on
 * a two-intent booking and re-refunds money on an already partially refunded
 * one. Stripe rejects both outright, and the rejection propagates before the
 * booking status is written — so the clamp is what keeps a cancel from leaving
 * the booking active. Allocation stops early when nothing is left to refund;
 * the caller decides what a short plan means.
 */
export function planRefunds<T extends PaymentTxn>(
  txns: T[],
  requestedCents: number,
): RefundAllocation<T>[] {
  const plan: RefundAllocation<T>[] = [];
  let unallocated = Math.max(0, requestedCents);

  for (const txn of txns) {
    if (unallocated === 0) break;
    if (txn.status !== "succeeded" && txn.status !== "refunded") continue;
    const remaining = Math.max(0, txn.amountCents - txn.refundedCents);
    if (remaining === 0) continue;
    const amountCents = Math.min(remaining, unallocated);
    plan.push({ txn, amountCents });
    unallocated -= amountCents;
  }

  return plan;
}
