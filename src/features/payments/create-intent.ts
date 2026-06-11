"use server";

/**
 * Server action: create a Stripe PaymentIntent for a booking.
 *
 * SECURITY:
 *  - Amount is server-derived from the booking record; never client-supplied.
 *  - Identity comes from getUser() (session cookie), never from the payload.
 *  - payments row is inserted via service client (clients have no INSERT grant).
 *  - Booking ownership is verified before calling the gateway.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentGateway } from "./types";
import { amountOwedCents } from "./projection";
import { StripeGateway } from "./stripe-gateway";

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string };

interface PaymentRow {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amount_cents: number;
  refunded_cents: number;
}

interface BookingRow {
  id: string;
  client_id: string;
  final_cents: number;
  payments: PaymentRow[];
}

// ─── DI core (testable) ───────────────────────────────────────────────────────

export async function runCreatePrepayIntent(
  deps: {
    sessionClient: SupabaseClient;
    serviceClient: SupabaseClient;
    gateway: PaymentGateway;
  },
  bookingId: string,
): Promise<CreateIntentResult> {
  // 1. Verify session.
  const {
    data: { user },
  } = await deps.sessionClient.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // 2. Read booking + payments via session client (RLS enforces ownership).
  const { data, error: fetchError } = await deps.sessionClient
    .from("bookings")
    .select(
      "id, client_id, final_cents, payments(status, amount_cents, refunded_cents)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError || !data) {
    return { ok: false, error: "Booking not found." };
  }

  const booking = data as BookingRow;

  // Belt-and-suspenders ownership check (RLS should already enforce this).
  if (booking.client_id !== user.id) {
    return { ok: false, error: "Booking not found." };
  }

  // Guard against a non-numeric final_cents before any money math (defends
  // against a NaN amount reaching the gateway). DB column is NOT NULL, but
  // never trust the shape of an untyped client response.
  if (!Number.isFinite(booking.final_cents)) {
    return { ok: false, error: "Booking total is unavailable." };
  }

  // 3. Derive amount server-side. Map DB row → PaymentTxn (snake_case → camelCase).
  const txns = booking.payments.map((p) => ({
    status: p.status,
    amountCents: p.amount_cents,
    refundedCents: p.refunded_cents,
  }));
  const owed = amountOwedCents(booking.final_cents, txns);
  if (owed <= 0) {
    return { ok: false, error: "This booking is already paid." };
  }

  // 4. Reuse an existing open intent of the same amount, if any (PAY4).
  // Base key dedupes rapid double-clicks. If we cancel + recreate, the key MUST
  // change — Stripe caches idempotent responses 24h, so reusing the base key
  // would return the just-canceled intent. Derive a deterministic retry key
  // from the retired intent id (idempotent across re-deliveries of the retry).
  let idempotencyKey = `prepay:${bookingId}:${owed}`;

  const hasOpenRow = booking.payments.some(
    (p) => p.status === "requires_payment",
  );
  if (hasOpenRow) {
    // Newest open intent. `limit(1)` keeps this deterministic if duplicates ever
    // exist — this is the one path meant to PREVENT intent proliferation, so it
    // must not silently fall through and mint yet another. Bail on a query error
    // rather than mint blind.
    const { data: openFull, error: openErr } = await deps.serviceClient
      .from("payments")
      .select("id, stripe_payment_intent_id, amount_cents")
      .eq("booking_id", bookingId)
      .eq("status", "requires_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openErr) {
      return { ok: false, error: "Could not check existing payment." };
    }

    if (openFull?.stripe_payment_intent_id) {
      const existing = await deps.gateway.retrieveIntent(
        openFull.stripe_payment_intent_id,
      );
      const reusable =
        openFull.amount_cents === owed &&
        (existing.status === "requires_payment_method" ||
          existing.status === "requires_confirmation") &&
        existing.clientSecret !== null;

      if (reusable) {
        return { ok: true, clientSecret: existing.clientSecret! };
      }

      // Stale or amount-changed: cancel at Stripe + retire the row, then mint
      // fresh under a key that won't collide with the canceled intent's cache.
      await deps.gateway.cancelIntent(openFull.stripe_payment_intent_id);
      await deps.serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", openFull.id);
      idempotencyKey = `prepay:${bookingId}:${owed}:retry-${openFull.stripe_payment_intent_id}`;
    }
  }

  // 5. Mint a new intent with the booking-scoped idempotency key.
  const intent = await deps.gateway.createIntent({
    amountCents: owed,
    currency: "usd",
    bookingId,
    clientId: user.id,
    idempotencyKey,
  });

  // 6. Persist the payments row via service client (clients have no INSERT grant).
  const { error: insertError } = await deps.serviceClient
    .from("payments")
    .insert({
      booking_id: bookingId,
      client_id: user.id,
      stripe_payment_intent_id: intent.paymentIntentId,
      amount_cents: owed,
      currency: "usd",
      status: "requires_payment",
    });

  if (insertError) {
    return {
      ok: false,
      error: `Failed to record payment: ${insertError.message}`,
    };
  }

  // 7. Return the client secret for Stripe.js.
  return { ok: true, clientSecret: intent.clientSecret };
}

// ─── Public server action (thin wrapper) ─────────────────────────────────────

export async function createPrepayIntent(
  bookingId: unknown,
): Promise<CreateIntentResult> {
  if (typeof bookingId !== "string" || bookingId.trim() === "") {
    return { ok: false, error: "Invalid booking ID." };
  }

  const sessionClient = await createClient();
  const serviceClient = createServiceClient();
  const gateway = new StripeGateway();

  return runCreatePrepayIntent(
    { sessionClient, serviceClient, gateway },
    bookingId,
  );
}
