/** A booking row's payment status — the pill, dispute pill, and retained-half line. Pure presentation. */

import { RotateCcw, TriangleAlert, Check, Circle } from "lucide-react";
import {
  paymentPill,
  retainedHalfLabel,
  disputeLabel,
  type BookingPaymentStatus,
} from "@/features/payments/index.client";

const PAYMENT_PILL_CLASSES: Record<
  "unpaid" | "paid" | "partial" | "refunded",
  string
> = {
  paid: "bg-status-available text-status-available-foreground",
  partial: "bg-warning text-warning-foreground",
  refunded: "bg-status-unavailable text-status-unavailable-foreground",
  unpaid: "bg-muted text-muted-foreground",
};

function PaymentPillIcon({
  tone,
}: {
  tone: "unpaid" | "paid" | "partial" | "refunded";
}) {
  if (tone === "paid") return <Check className="size-3" aria-hidden="true" />;
  if (tone === "partial" || tone === "refunded")
    return <RotateCcw className="size-3" aria-hidden="true" />;
  return <Circle className="size-3" aria-hidden="true" />;
}

/** The payment pill, plus a dispute pill when the booking is disputed. */
export function BookingPaymentBadges({
  finalCents,
  paymentStatus,
  disputed,
  disputeStatus,
}: {
  finalCents: number;
  paymentStatus: BookingPaymentStatus;
  disputed: boolean;
  disputeStatus: string | null;
}) {
  // A booking with nothing to charge has no payment state worth showing: a
  // free meet & greet is not "Unpaid", it is simply free. Mirrors the same
  // guard on the bookings hub's BookingRow.
  const pill = finalCents > 0 ? paymentPill(paymentStatus) : null;

  return (
    <>
      {pill ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYMENT_PILL_CLASSES[pill.tone]}`}
        >
          <PaymentPillIcon tone={pill.tone} />
          {pill.label}
        </span>
      ) : null}
      {/* Dispute pill — red reserved for disputes only */}
      {disputed ? (
        <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-current">
          <TriangleAlert className="size-3" aria-hidden="true" />
          {disputeLabel(disputeStatus)}
        </span>
      ) : null}
    </>
  );
}

/** The "half retained" notice for a partially refunded booking, or nothing. */
export function RetainedHalfNotice({
  finalCents,
  refundedCents,
}: {
  finalCents: number;
  refundedCents: number;
}) {
  const line = retainedHalfLabel({ finalCents, refundedCents });
  if (!line) return null;

  return (
    <div className="text-warning-foreground inline-flex items-center gap-1.5 text-xs">
      <RotateCcw className="size-3" aria-hidden="true" />
      {line}
    </div>
  );
}
