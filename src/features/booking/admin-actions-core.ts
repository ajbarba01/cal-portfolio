/**
 * Admin booking operations: grant-full-refund, mark-no-show, settle-debt.
 */

import { computeCancellationDebtCents } from "./cancellation";
import { transition } from "./state-machine";
import {
  quoteInputSupportsManual,
  requoteWithKiche,
  kicheOverpayRefundCents,
} from "./kiche";
import type { QuoteInput } from "@/features/pricing";
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

/** Result of applying/removing the Kiche discount on a booking. */
export type SetKicheAppliedResult =
  | {
      kind: "success";
      applied: boolean;
      newFinalCents: number;
      /** Cents refunded to settle an overpayment (0 when none). */
      refundedCents: number;
    }
  | { kind: "not_found" }
  /** Client never marked Kiche welcome — discount cannot be applied. */
  | { kind: "no_consent" }
  /** Service carries no Kiche rate (not house-sitting / walk). */
  | { kind: "unsupported" }
  | { kind: "invalid_state"; message: string }
  | { kind: "error"; message: string };

// ──────────────────────────────────────────────────────────────────────────────
// Admin operations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Admin grants the remaining (full) refund beyond the default late-cancel tier:
 * refunds whatever paid amount has not yet been refunded. Authorization is the
 * caller's responsibility (admin-gated action wrapper).
 */
export async function grantFullRefundCore(
  deps: CancelDeps,
  bookingId: string,
): Promise<AdminBookingResult> {
  const { repo, gateway } = deps;
  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };

  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const refundedCents = booking.payments
    .filter((p) => p.status === "refunded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const remaining = paidCents - refundedCents;
  if (remaining <= 0) return { kind: "success" }; // nothing left to refund

  const intent =
    booking.payments.find((p) => p.status === "succeeded")?.paymentIntentId ??
    booking.payments[0]?.paymentIntentId;
  if (!intent) return { kind: "success" };

  await gateway.refund(intent, remaining);
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
  const debtCents = computeCancellationDebtCents({
    finalCents: booking.finalCents,
    reason: "no_show",
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
 * Admin applies (or removes) the Kiche discount on a single booking.
 *
 * Re-quotes the booking's FROZEN stored quote with `applyKiche` flipped (so only
 * the Kiche line changes), persists the new total, and — when applying drops the
 * total below what the client already paid — initiates a Stripe refund for the
 * overpayment. The `charge.refunded` webhook stays the sole writer of
 * `payment_status` (this path never writes it). Idempotent: re-applying the
 * current state is a no-op success.
 *
 * Guards (when applying): the service must carry a Kiche rate (house-sitting /
 * walk) and the client must have marked Kiche welcome. Authorization is the
 * caller's responsibility (admin-gated action wrapper).
 *
 * Persist-then-refund: if the refund call fails the discount is still recorded
 * (client overpaid, not under-refunded) and Cal can retry the refund — money is
 * never lost, only pending.
 */
export async function setKicheAppliedCore(
  deps: CancelDeps,
  args: { bookingId: string; applied: boolean },
): Promise<SetKicheAppliedResult> {
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
      message: `Cannot change the Kiche discount on a ${booking.status} booking.`,
    };
  }

  // The frozen QuoteInput must carry a re-priceable modifier config. Kiche
  // support is now read from the config itself: a booking supports the toggle
  // iff its config defines a manual "kiche" modifier (replaces the old per-type
  // serviceSupportsKiche check).
  const storedInput = booking.quote_inputs as Partial<QuoteInput> | null;
  if (!storedInput?.config) {
    return {
      kind: "error",
      message: "Booking has no stored quote to re-price.",
    };
  }

  if (args.applied) {
    if (!quoteInputSupportsManual(storedInput, "kiche"))
      return { kind: "unsupported" };
    if (!booking.kiche_welcome) return { kind: "no_consent" };
  }

  // Idempotent: nothing to do if already in the requested state.
  if (booking.kiche_applied === args.applied) {
    return {
      kind: "success",
      applied: args.applied,
      newFinalCents: booking.finalCents,
      refundedCents: 0,
    };
  }

  const breakdown = requoteWithKiche(
    booking.quote_inputs as QuoteInput,
    args.applied,
  );

  // Persist the toggled "kiche" id in the frozen input's enabledManualIds so a
  // later re-quote (e.g. series roll) reproduces this total.
  const enabled = new Set(storedInput.enabledManualIds ?? []);
  if (args.applied) enabled.add("kiche");
  else enabled.delete("kiche");
  await repo.updateBookingKiche(args.bookingId, {
    kiche_applied: args.applied,
    quote_inputs: {
      ...(booking.quote_inputs as object),
      enabledManualIds: [...enabled],
    },
    quote_breakdown: breakdown,
    final_cents: breakdown.finalCents,
  });

  // Refund any overpayment created by a now-lower total (webhook re-projects status).
  let refundedCents = 0;
  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  const refundCents = kicheOverpayRefundCents(paidCents, breakdown.finalCents);
  if (refundCents > 0) {
    const succeeded = booking.payments.find((p) => p.status === "succeeded");
    if (succeeded) {
      await gateway.refund(succeeded.paymentIntentId, refundCents);
      refundedCents = refundCents;
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
