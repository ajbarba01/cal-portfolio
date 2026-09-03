/**
 * cancelBookingCore — booking cancellation with refund/debt logic.
 */

import { z } from "zod";
import { previewCancellation } from "./cancellation";
// Client entry point: this core is re-exported through the booking feature's
// client barrel, so it must not pull in the server-only StripeGateway.
import {
  netPaid,
  planRefunds,
  type PaymentGateway,
} from "@/features/payments/index.client";
import type { BookingPaymentTxn } from "./booking-repository";
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

/** The one message any failed cancel shows the client; details go to the log. */
const CANCEL_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Issues `refundCents` across the booking's captured intents, each clamped to
 * what it has left. Returns false when the gateway rejected a call: the refund
 * has to succeed before the booking may be marked cancelled, or the client is
 * told they were refunded when they were not.
 */
async function refundAcrossIntents(
  gateway: PaymentGateway,
  payments: BookingPaymentTxn[],
  refundCents: number,
): Promise<boolean> {
  for (const { txn, amountCents } of planRefunds(payments, refundCents)) {
    try {
      await gateway.refund(txn.paymentIntentId, amountCents);
    } catch (error) {
      console.error(
        `cancelBookingCore: refund of ${amountCents} against ${txn.paymentIntentId} failed`,
        error,
      );
      return false;
    }
  }
  return true;
}

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
 *
 * The refund is issued before the status write, so a gateway rejection returns
 * `error` with the booking untouched rather than cancelling a booking whose
 * money never moved.
 */
export async function cancelBookingCore(
  deps: CancelDeps,
  rawInput: CancelBookingInput,
): Promise<CancelBookingResult> {
  const parseResult = cancelBookingInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    console.error(
      "cancelBookingCore: input validation failed",
      parseResult.error.issues,
    );
    return { kind: "error", message: CANCEL_ERROR_MESSAGE };
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
  // Net, not gross: money already refunded (an admin Kiche discount, say) is not
  // refundable a second time, and asking Stripe for it fails the whole cancel.
  const paidCents = netPaid(booking.payments);

  // Admin/Cal cancels always refund 100% (fullRefund path in the input); the
  // client path uses the timing-based projection. Preserve that split.
  if (input.fullRefund ?? false) {
    if (paidCents > 0) {
      const refunded = await refundAcrossIntents(
        gateway,
        booking.payments,
        paidCents,
      );
      if (!refunded) return { kind: "error", message: CANCEL_ERROR_MESSAGE };
    }
  } else {
    const outcome = previewCancellation({
      finalCents: booking.finalCents,
      paidCents,
      startsAt: booking.startsAt,
      now,
      fullRefundHours: settings.cancellation_full_refund_hours,
      lateRefundPct: settings.late_cancel_refund_pct,
      noShowChargePct: settings.no_show_charge_pct,
    });

    // Initiate the default-tier refund (webhook re-projects payment_status).
    if (outcome.refundCents > 0) {
      const refunded = await refundAcrossIntents(
        gateway,
        booking.payments,
        outcome.refundCents,
      );
      if (!refunded) return { kind: "error", message: CANCEL_ERROR_MESSAGE };
    }

    // Unpaid late cancel → debt for the forfeited amount.
    if (outcome.debtCents > 0) {
      await repo.insertDebit({
        client_id: booking.client_id,
        booking_id: booking.id,
        amount_cents: outcome.debtCents,
        reason: "late_cancel",
      });
    }
  }

  await repo.updateBookingStatus(input.bookingId, transitionResult.state);
  return { kind: "success" };
}
