/**
 * Webhook core: applies a parsed Stripe event to the DB.
 *
 * SECURITY:
 *  - Accepts a serviceClient (RLS-bypassed) — caller MUST verify Stripe
 *    signature before invoking this function.
 *  - ONLY writes payments.status and bookings.payment_status.
 *  - NEVER writes bookings.status.
 *  - Idempotent: re-delivering the same event converges to the same state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computePaymentStatus } from "./projection";
import type { PaymentTxn } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApplyResult =
  | { ok: true; handled: boolean }
  | { ok: false; error: string };

/** Minimal shape of a parsed Stripe event passed to this core. */
export interface StripeEventInput {
  type: string;
  data: { object: Record<string, unknown> };
}

// ─── Zod schemas for defensive extraction ────────────────────────────────────

/** Extracts `id` from a payment_intent object. */
const paymentIntentObjectSchema = z.object({
  id: z.string(),
});

/** Extracts `payment_intent` from a charge object. */
const chargeObjectSchema = z.object({
  payment_intent: z.string(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PaymentTxnStatus = PaymentTxn["status"];

/**
 * After updating a payments row, re-reads all sibling payments for the booking
 * and updates bookings.payment_status to the derived value.
 * NEVER touches bookings.status.
 */
async function projectBookingPaymentStatus(
  serviceClient: SupabaseClient,
  bookingId: string,
): Promise<ApplyResult> {
  // Re-read booking + all its payments via service role.
  const { data: booking, error: fetchError } = await serviceClient
    .from("bookings")
    .select("final_cents, payments(status, amount_cents)")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError || !booking) {
    return {
      ok: false,
      error: `Failed to re-read booking for projection: ${fetchError?.message ?? "not found"}`,
    };
  }

  const txns = (
    booking.payments as Array<{ status: string; amount_cents: number }>
  ).map(
    (p): PaymentTxn => ({
      status: p.status as PaymentTxnStatus,
      amountCents: p.amount_cents,
    }),
  );

  const projectedStatus = computePaymentStatus(
    booking.final_cents as number,
    txns,
  );

  // Update ONLY payment_status on the booking — never bookings.status.
  const { error: updateError } = await serviceClient
    .from("bookings")
    .update({ payment_status: projectedStatus })
    .eq("id", bookingId);

  if (updateError) {
    return {
      ok: false,
      error: `Failed to update booking payment_status: ${updateError.message}`,
    };
  }

  return { ok: true, handled: true };
}

/**
 * Finds a payments row by stripe_payment_intent_id, updates its status, and
 * re-projects the booking's payment_status.
 */
async function applyPaymentIntentStatus(
  serviceClient: SupabaseClient,
  intentId: string,
  newStatus: PaymentTxnStatus,
): Promise<ApplyResult> {
  // Fetch the payments row.
  const { data: payment, error: fetchError } = await serviceClient
    .from("payments")
    .select("id, booking_id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, error: `DB error: ${fetchError.message}` };
  }
  if (!payment) {
    // Unknown intent — could be out-of-band; don't crash.
    return { ok: true, handled: false };
  }

  const { error: updateError } = await serviceClient
    .from("payments")
    .update({ status: newStatus })
    .eq("id", payment.id);

  if (updateError) {
    return {
      ok: false,
      error: `Failed to update payment status: ${updateError.message}`,
    };
  }

  return projectBookingPaymentStatus(
    serviceClient,
    payment.booking_id as string,
  );
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Applies a Stripe event to the database.
 *
 * Caller is responsible for verifying the webhook signature before invoking
 * this function (see the route handler).
 */
export async function applyStripeEvent(
  serviceClient: SupabaseClient,
  event: StripeEventInput,
): Promise<ApplyResult> {
  const { type, data } = event;

  switch (type) {
    case "payment_intent.succeeded": {
      const parsed = paymentIntentObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Malformed payment_intent object: missing id",
        };
      }
      return applyPaymentIntentStatus(
        serviceClient,
        parsed.data.id,
        "succeeded",
      );
    }

    case "payment_intent.payment_failed": {
      const parsed = paymentIntentObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Malformed payment_intent object: missing id",
        };
      }
      return applyPaymentIntentStatus(serviceClient, parsed.data.id, "failed");
    }

    case "charge.refunded": {
      const parsed = chargeObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Malformed charge object: missing payment_intent",
        };
      }
      return applyPaymentIntentStatus(
        serviceClient,
        parsed.data.payment_intent,
        "refunded",
      );
    }

    default:
      // Ignore unrecognised events — don't crash.
      return { ok: true, handled: false };
  }
}
