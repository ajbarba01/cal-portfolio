/**
 * Pure projection functions for payment status.
 * No IO, no side effects — fully unit-testable.
 *
 * Rules for computePaymentStatus:
 *   paidSum     = Σ amountCents where status === 'succeeded'
 *   refundedSum = Σ amountCents where status === 'refunded'
 *
 *   if finalCents > 0 && paidSum >= finalCents → 'paid'
 *   else if refundedSum > 0                    → 'refunded'
 *   else                                       → 'unpaid'
 */

import type { PaymentTxn } from "./types";

type BookingPaymentStatus = "unpaid" | "paid" | "refunded";

/** Derives the booking-level payment status from transaction history. */
export function computePaymentStatus(
  finalCents: number,
  txns: PaymentTxn[],
): BookingPaymentStatus {
  const paidSum = txns
    .filter((t) => t.status === "succeeded")
    .reduce((acc, t) => acc + t.amountCents, 0);

  const refundedSum = txns
    .filter((t) => t.status === "refunded")
    .reduce((acc, t) => acc + t.amountCents, 0);

  if (finalCents > 0 && paidSum >= finalCents) return "paid";
  if (refundedSum > 0) return "refunded";
  return "unpaid";
}

/** Cents still owed after accounting for succeeded payments. Clamps to 0. */
export function amountOwedCents(
  finalCents: number,
  txns: PaymentTxn[],
): number {
  const paidSum = txns
    .filter((t) => t.status === "succeeded")
    .reduce((acc, t) => acc + t.amountCents, 0);

  return Math.max(0, finalCents - paidSum);
}
