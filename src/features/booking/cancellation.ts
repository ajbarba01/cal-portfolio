/**
 * Pure cancellation/refund math (DESIGN: cancellation / refund policy).
 *
 * No IO, no clock reads — `now` is passed in (ENGINEERING #5). Money is integer
 * cents throughout. Because prepay is full-amount-or-nothing, `paidCents` is
 * always either `finalCents` or 0 (no partial-payment case).
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Refund tier for a self-cancel:
 *  - "full": cancelled at or before the cutoff → full refund of whatever was paid.
 *  - "late": cancelled inside the cutoff while paid → partial refund (Cal may
 *            grant the rest).
 *  - "none": cancelled inside the cutoff while unpaid → nothing to refund (a
 *            debt is owed instead — see computeCancellationDebtCents).
 */
export type RefundTier = "full" | "late" | "none";

export interface RefundDecision {
  refundCents: number;
  tier: RefundTier;
  /** True when Cal could still grant a larger (full) refund than the default. */
  needsCalReview: boolean;
}

export interface RefundInput {
  finalCents: number;
  /** Amount actually paid: finalCents or 0 (prepay is all-or-nothing). */
  paidCents: number;
  startsAt: Date;
  now: Date;
  fullRefundHours: number;
  lateRefundPct: number;
}

/**
 * Decides the default refund for a client-initiated cancel. Cancelling at or
 * before `fullRefundHours` before start refunds everything paid; inside the
 * cutoff refunds `lateRefundPct` of what was paid and flags the booking so Cal
 * can optionally grant the remainder.
 */
export function computeRefund(input: RefundInput): RefundDecision {
  const hoursUntilStart =
    (input.startsAt.getTime() - input.now.getTime()) / MS_PER_HOUR;
  const atOrBeforeCutoff = hoursUntilStart >= input.fullRefundHours;

  if (atOrBeforeCutoff) {
    return {
      refundCents: input.paidCents,
      tier: "full",
      needsCalReview: false,
    };
  }

  // Inside the cutoff.
  if (input.paidCents === 0) {
    return { refundCents: 0, tier: "none", needsCalReview: false };
  }

  const refundCents = Math.round((input.paidCents * input.lateRefundPct) / 100);
  return { refundCents, tier: "late", needsCalReview: true };
}

/**
 * The debt a client owes when they walk away from a slot without paying: the
 * portion of `finalCents` that a paying client would have forfeited.
 *
 * - late_cancel: forfeited portion = the part NOT refunded under the late tier,
 *   i.e. `(100 - lateRefundPct)%` of `finalCents`. (At the default 50% these
 *   coincide with DESIGN's shorthand "late_cancel_refund_pct of final_cents".)
 * - no_show: `noShowChargePct%` of `finalCents` (100% by default → full price).
 */
export function computeCancellationDebtCents(input: {
  finalCents: number;
  reason: "late_cancel" | "no_show";
  lateRefundPct: number;
  noShowChargePct: number;
}): number {
  if (input.reason === "no_show") {
    return Math.round((input.finalCents * input.noShowChargePct) / 100);
  }
  return Math.round((input.finalCents * (100 - input.lateRefundPct)) / 100);
}
