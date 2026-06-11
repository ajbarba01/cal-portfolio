/**
 * Pure display helpers for booking payment data.
 * No JSX, no color values — UI maps tone strings to design tokens.
 */

import type { BookingPaymentStatus } from "./projection";

// Re-export so callers importing display helpers get the union from here.
export type { BookingPaymentStatus };

// ─── Pill ─────────────────────────────────────────────────────────────────────

export type PaymentPillTone = "unpaid" | "paid" | "partial" | "refunded";

export interface PaymentPill {
  label: string;
  tone: PaymentPillTone;
}

const PILL_MAP: Record<BookingPaymentStatus, PaymentPill> = {
  unpaid: { label: "Unpaid", tone: "unpaid" },
  paid: { label: "Paid", tone: "paid" },
  partially_refunded: { label: "Partially refunded", tone: "partial" },
  refunded: { label: "Refunded", tone: "refunded" },
};

/** Maps a booking payment status to a display label + tone key. Pure data — no JSX. */
export function paymentPill(status: BookingPaymentStatus): PaymentPill {
  return PILL_MAP[status];
}

// ─── Retained-half label ──────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Returns "Refunded $X.XX · kept $Y.YY" when refundedCents > 0, else null.
 * kept = finalCents − refundedCents.
 */
export function retainedHalfLabel({
  finalCents,
  refundedCents,
}: {
  finalCents: number;
  refundedCents: number;
}): string | null {
  if (refundedCents <= 0) return null;
  const keptCents = finalCents - refundedCents;
  return `Refunded ${centsToDollars(refundedCents)} · kept ${centsToDollars(keptCents)}`;
}

// ─── Dispute label ────────────────────────────────────────────────────────────

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  needs_response: "needs response",
  under_review: "under review",
  charge_refunded: "charge refunded",
  won: "won",
  lost: "lost",
  warning_needs_response: "warning · needs response",
  warning_under_review: "warning · under review",
  warning_closed: "warning · closed",
};

/**
 * Returns a friendly dispute label string.
 * disputeLabel("needs_response") → "Disputed · needs response"
 * disputeLabel(null)             → "Disputed"
 */
export function disputeLabel(disputeStatus: string | null): string {
  if (!disputeStatus) return "Disputed";
  const friendly =
    DISPUTE_STATUS_LABELS[disputeStatus] ?? disputeStatus.replace(/_/g, " ");
  return `Disputed · ${friendly}`;
}
