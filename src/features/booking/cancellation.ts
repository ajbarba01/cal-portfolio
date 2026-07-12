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
  /**
   * When true, skip timing-based policy and return a full refund of whatever
   * was paid. Used for admin/Cal-initiated cancellations (DESIGN: decision 14).
   * Default false — preserves client late-cancel policy.
   */
  fullRefund?: boolean;
}

/**
 * Decides the default refund for a client-initiated cancel. Cancelling at or
 * before `fullRefundHours` before start refunds everything paid; inside the
 * cutoff refunds `lateRefundPct` of what was paid and flags the booking so Cal
 * can optionally grant the remainder.
 */
export function computeRefund(input: RefundInput): RefundDecision {
  // Admin/Cal-initiated cancel: always refund 100% of what was paid, regardless
  // of timing. If nothing was paid, refund is 0. (DESIGN: decision 14)
  if (input.fullRefund) {
    return {
      refundCents: input.paidCents,
      tier: "full",
      needsCalReview: false,
    };
  }

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

/**
 * No-show debt owed after crediting what the client already paid. A no-show
 * charge is computed the same as any no-show (`noShowChargePct%` of
 * `finalCents`), but a client who prepaid must not be charged again for the
 * portion already captured — never returns a negative debt.
 */
export function noShowDebtCents(input: {
  finalCents: number;
  paidCents: number;
  lateRefundPct: number;
  noShowChargePct: number;
}): number {
  const charge = computeCancellationDebtCents({
    finalCents: input.finalCents,
    reason: "no_show",
    lateRefundPct: input.lateRefundPct,
    noShowChargePct: input.noShowChargePct,
  });
  return Math.max(0, charge - input.paidCents);
}

/** The projected outcome of cancelling a booking right now — the single source
 * of truth shared by the preview action and the executing cancel core. */
export interface CancellationOutcome {
  tier: RefundTier;
  refundCents: number;
  remainderCents: number;
  debtCents: number;
}

export interface PreviewCancellationInput {
  finalCents: number;
  paidCents: number;
  startsAt: Date;
  now: Date;
  fullRefundHours: number;
  lateRefundPct: number;
  noShowChargePct: number;
}

/**
 * Projects the client self-cancel outcome by composing the existing refund and
 * debt math (no new money rules). `remainderCents` is what Cal could still grant
 * back beyond the late-tier default (paidCents minus the immediate refund);
 * `debtCents` is the late-cancel fee owed only when the slot was never paid.
 */
export function previewCancellation(
  input: PreviewCancellationInput,
): CancellationOutcome {
  const refund = computeRefund({
    finalCents: input.finalCents,
    paidCents: input.paidCents,
    startsAt: input.startsAt,
    now: input.now,
    fullRefundHours: input.fullRefundHours,
    lateRefundPct: input.lateRefundPct,
    fullRefund: false,
  });

  const remainderCents =
    refund.tier === "late" ? input.paidCents - refund.refundCents : 0;

  const debtCents =
    refund.tier === "none"
      ? computeCancellationDebtCents({
          finalCents: input.finalCents,
          reason: "late_cancel",
          lateRefundPct: input.lateRefundPct,
          noShowChargePct: input.noShowChargePct,
        })
      : 0;

  return {
    tier: refund.tier,
    refundCents: refund.refundCents,
    remainderCents,
    debtCents,
  };
}
