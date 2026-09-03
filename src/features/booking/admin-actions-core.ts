/**
 * Admin booking operations: grant-full-refund, mark-no-show, manual discounts,
 * settle-debt.
 */

import { noShowDebtCents } from "./cancellation";
import { transition } from "./state-machine";
import {
  KICHE_ID,
  manualDiscounts,
  manualOverpayRefundCents,
  requoteWithManual,
  storedManualInputs,
  toggleManualIds,
} from "./manual-discounts";
// Client entry point — see the note in cancel-core.ts.
import { netPaid, planRefunds } from "@/features/payments/index.client";
import { parsePricingConfig } from "@/features/pricing";
import type { QuoteInput, ServicePricingConfig } from "@/features/pricing";
import { asJson } from "./booking-repository-types";
import type { BookingStatusDb } from "./booking-repository-types";
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

/** Result of applying/removing one manual discount on a booking. */
export type SetManualAppliedResult =
  | {
      kind: "success";
      applied: boolean;
      newFinalCents: number;
      /** Cents refunded to settle an overpayment (0 when none). */
      refundedCents: number;
    }
  | { kind: "not_found" }
  /** Kiche only: the client never marked Kiche welcome, so it cannot be applied. */
  | { kind: "no_consent" }
  /** The booking's frozen config declares no manual modifier with that id. */
  | { kind: "unsupported" }
  | { kind: "invalid_state"; message: string }
  | { kind: "error"; message: string };

/** The one message a failed admin money operation shows; details go to the log. */
const ADMIN_ERROR_MESSAGE = "Something went wrong. Please try again.";

// ──────────────────────────────────────────────────────────────────────────────
// Admin operations
// ──────────────────────────────────────────────────────────────────────────────

/** Statuses on which granting the remainder of a refund makes sense. */
const REFUNDABLE_STATUSES: readonly BookingStatusDb[] = [
  "cancelled",
  "declined",
  "no_show",
  "completed",
];

/**
 * Admin grants the remaining (full) refund beyond the default late-cancel tier:
 * refunds whatever paid amount has not yet been refunded. Authorization is the
 * caller's responsibility (admin-gated action wrapper).
 *
 * Only a booking that is over (cancelled, declined, no-show or completed) can be
 * refunded out this way — granting the remainder on a live booking would leave
 * Cal working an unpaid slot. Each gateway call carries a key derived from the
 * amount outstanding, so a double click grants one refund, not two.
 */
export async function grantFullRefundCore(
  deps: CancelDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo, gateway } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  if (!REFUNDABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_state", message: ADMIN_ERROR_MESSAGE };
  }

  const remaining = netPaid(booking.payments);
  if (remaining <= 0) return { kind: "success" }; // nothing left to refund

  for (const { txn, amountCents } of planRefunds(booking.payments, remaining)) {
    try {
      await gateway.refund(
        txn.paymentIntentId,
        amountCents,
        `grant-full-refund:${bookingId}:${txn.paymentIntentId}:${remaining}`,
      );
    } catch (error) {
      console.error(
        `grantFullRefundCore: refund of ${amountCents} against ${txn.paymentIntentId} failed`,
        error,
      );
      return { kind: "error", message: ADMIN_ERROR_MESSAGE };
    }
  }
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
  const paidCents = netPaid(booking.payments);
  // Net against captured payment so a prepaid no-show is not double-charged.
  const debtCents = noShowDebtCents({
    finalCents: booking.finalCents,
    paidCents,
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

/**
 * Admin applies (or removes) one manual discount on a single booking.
 *
 * Re-quotes the booking's FROZEN stored quote with `modifierId` flipped (so only
 * that discount's line changes and any other manual discount already on the
 * booking survives), persists the new total, and — when applying drops the total
 * below what the client already paid — initiates a Stripe refund for the
 * overpayment. The `charge.refunded` webhook stays the sole writer of
 * `payment_status` (this path never writes it). Idempotent: re-applying the
 * current state is a no-op success.
 *
 * Guards (when applying): the booking's frozen config must declare that manual
 * modifier, and for Kiche the client must have marked Kiche welcome.
 * Authorization is the caller's responsibility (admin-gated action wrapper).
 *
 * Persist-then-refund: if the refund call fails the discount is still recorded
 * (client overpaid, not under-refunded) and the result is `error` so Cal knows
 * to retry the refund — money is never lost, only pending.
 */
export async function setManualAppliedCore(
  deps: CancelDeps,
  args: { bookingId: string; modifierId: string; applied: boolean },
): Promise<SetManualAppliedResult> {
  const { repo, gateway } = deps;
  const booking = await repo.getBookingForKiche(args.bookingId);
  if (!booking) return { kind: "not_found" };

  if (
    booking.status === "cancelled" ||
    booking.status === "declined" ||
    booking.status === "no_show"
  ) {
    return {
      kind: "invalid_state",
      message: "This booking can no longer be changed.",
    };
  }

  // The frozen QuoteInput must carry a re-priceable modifier config.
  const storedInput = booking.quote_inputs as Partial<QuoteInput> | null;
  if (!storedInput?.config) {
    return {
      kind: "error",
      message: "Booking has no stored quote to re-price.",
    };
  }

  // `quote_inputs` is jsonb, so its config is `unknown` until parsed. Validating
  // it here — rather than casting into the engine — keeps a malformed or legacy
  // stored quote from re-pricing a booking on made-up rates.
  let config: ServicePricingConfig;
  try {
    config = parsePricingConfig(storedInput.config);
  } catch (error) {
    console.error(
      `setManualAppliedCore: booking '${args.bookingId}' has an unparseable stored pricing config`,
      error,
    );
    return { kind: "error", message: ADMIN_ERROR_MESSAGE };
  }
  // Same reason for the Cal-set lists: `enabledManualIds` and
  // `customAdjustments` come off jsonb too, so a legacy or hand-edited row can
  // hold anything. Sanitizing them here keeps junk out of both the re-quote and
  // the ids written back.
  const { enabledManualIds: enabledIds, customAdjustments } =
    storedManualInputs(booking.quote_inputs);
  const validatedInput: QuoteInput = {
    ...storedInput,
    config,
    enabledManualIds: enabledIds,
    customAdjustments,
  };

  // Which discounts a booking can carry is read from its frozen config: it
  // supports a toggle iff that config declares a matching manual modifier.
  if (args.applied) {
    const supported = manualDiscounts(config.modifiers).some(
      (discount) => discount.id === args.modifierId,
    );
    if (!supported) return { kind: "unsupported" };
    if (args.modifierId === KICHE_ID && !booking.kiche_welcome)
      return { kind: "no_consent" };
  }

  // `kiche_applied` is the column the edit re-quote reads, so it stays the truth
  // for Kiche; every other discount lives in the frozen input's id list.
  const currentlyApplied =
    args.modifierId === KICHE_ID
      ? booking.kiche_applied
      : enabledIds.includes(args.modifierId);

  // Idempotent: nothing to do if already in the requested state.
  if (currentlyApplied === args.applied) {
    return {
      kind: "success",
      applied: args.applied,
      newFinalCents: booking.finalCents,
      refundedCents: 0,
    };
  }

  const breakdown = requoteWithManual(
    validatedInput,
    args.modifierId,
    args.applied,
  );

  // Persist the toggled id in the frozen input's enabledManualIds so a later
  // re-quote (an edit, a series roll) reproduces this total.
  await repo.updateBookingKiche(args.bookingId, {
    kiche_applied:
      args.modifierId === KICHE_ID ? args.applied : booking.kiche_applied,
    quote_inputs: asJson({
      ...storedInput,
      enabledManualIds: toggleManualIds(
        enabledIds,
        args.modifierId,
        args.applied,
      ),
    }),
    quote_breakdown: asJson(breakdown),
    final_cents: breakdown.finalCents,
  });

  // Refund any overpayment created by a now-lower total (webhook re-projects status).
  let refundedCents = 0;
  const paidCents = netPaid(booking.payments);
  const refundCents = manualOverpayRefundCents(paidCents, breakdown.finalCents);
  for (const { txn, amountCents } of planRefunds(
    booking.payments,
    refundCents,
  )) {
    try {
      await gateway.refund(txn.paymentIntentId, amountCents);
      refundedCents += amountCents;
    } catch (error) {
      console.error(
        `setManualAppliedCore: refund of ${amountCents} against ${txn.paymentIntentId} failed`,
        error,
      );
      return { kind: "error", message: ADMIN_ERROR_MESSAGE };
    }
  }

  return {
    kind: "success",
    applied: args.applied,
    newFinalCents: breakdown.finalCents,
    refundedCents,
  };
}

/** Admin marks a debit settled (Cal collected offline or the client paid). */
export async function settleDebtCore(
  deps: BookingServiceDeps,
  debitId: string,
): Promise<AdminBookingResult> {
  await deps.repo.settleDebit(debitId, deps.now);
  return { kind: "success" };
}
