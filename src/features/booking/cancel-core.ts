/**
 * cancelBookingCore — booking cancellation with refund/debt logic.
 */

import { z } from "zod";
import { computeRefund, computeCancellationDebtCents } from "./cancellation";
import type { PaymentGateway } from "@/features/payments";
import { transition } from "./state-machine";
import {
  cancelBookingInputSchema,
  type BookingServiceDeps,
} from "./booking-service-shared";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type CancelBookingResult =
  | { kind: "success" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export type CancelBookingInput = z.input<typeof cancelBookingInputSchema>;

/** Deps for the cancel + refund/no-show paths: a gateway is required to refund. */
export interface CancelDeps extends BookingServiceDeps {
  gateway: PaymentGateway;
}

// ──────────────────────────────────────────────────────────────────────────────
// cancelBookingCore
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Core booking cancellation (testable via DI, no Next.js machinery).
 *
 * Applies the cancellation/refund policy (DESIGN): a refund is INITIATED via the
 * payment gateway (the Stripe `charge.refunded` webhook stays the sole writer of
 * `payment_status` — this path never writes it). An unpaid cancel inside the
 * cutoff writes a `client_debits` row for the forfeited amount.
 *
 * Ownership is checked here; the admin-override path passes the booking's own
 * client_id (see actions.ts).
 */
export async function cancelBookingCore(
  deps: CancelDeps,
  rawInput: CancelBookingInput,
): Promise<CancelBookingResult> {
  const parseResult = cancelBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { kind: "error", message: parseResult.error.message };
  }
  const input = parseResult.data;
  const { repo, now, gateway } = deps;

  const booking = await repo.getBookingWithPayments(input.bookingId);
  if (!booking) {
    return { kind: "not_found" };
  }
  if (booking.client_id !== input.userId) {
    return { kind: "forbidden" };
  }

  const transitionResult = transition(booking.status, "cancel", {
    requiresApproval: false, // context not needed for cancel
  });
  if ("error" in transitionResult) {
    return { kind: "error", message: transitionResult.error };
  }

  const settings = await repo.getSettings();
  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const refund = computeRefund({
    finalCents: booking.finalCents,
    paidCents,
    startsAt: booking.startsAt,
    now,
    fullRefundHours: settings.cancellation_full_refund_hours,
    lateRefundPct: settings.late_cancel_refund_pct,
  });

  // Initiate the default-tier refund (webhook re-projects payment_status).
  if (refund.refundCents > 0) {
    const succeeded = booking.payments.find((p) => p.status === "succeeded");
    if (succeeded) {
      await gateway.refund(succeeded.paymentIntentId, refund.refundCents);
    }
  }

  // Unpaid late cancel → debt for the forfeited amount.
  if (refund.tier === "none") {
    const debtCents = computeCancellationDebtCents({
      finalCents: booking.finalCents,
      reason: "late_cancel",
      lateRefundPct: settings.late_cancel_refund_pct,
      noShowChargePct: settings.no_show_charge_pct,
    });
    if (debtCents > 0) {
      await repo.insertDebit({
        client_id: booking.client_id,
        booking_id: booking.id,
        amount_cents: debtCents,
        reason: "late_cancel",
      });
    }
  }

  await repo.updateBookingStatus(input.bookingId, transitionResult.state);
  return { kind: "success" };
}
