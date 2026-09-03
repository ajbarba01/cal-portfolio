"use server";

/**
 * Server action: create a Stripe PaymentIntent for a booking.
 *
 * SECURITY:
 *  - Amount is server-derived from the booking record; never client-supplied.
 *  - Identity comes from getUser() (session cookie), never from the payload.
 *  - payments row is inserted via service client (clients have no INSERT grant).
 *  - Booking ownership is verified before calling the gateway.
 *  - Refuses outright while the payments kill-switch is off.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";
import type { DbClient } from "@/lib/supabase/db-client";
import type { CreatedIntent, PaymentGateway, RetrievedIntent } from "./types";
import { amountOwedCents } from "./projection";
import { StripeGateway } from "./stripe-gateway";

// ─── Types ────────────────────────────────────────────────────────────────────

type CreateIntentResult =
  | { ok: true; clientSecret: string }
  | { ok: false; error: string };

/**
 * Same wording the prepay dialog shows when Stripe.js cannot load, so a client
 * who reaches the closed action reads one message for one situation. It is a
 * literal rather than a shared constant because a `"use server"` module may
 * only export async functions, and a `"use client"` module's exports are
 * opaque references on the server.
 */
const PAYMENTS_DISABLED_ERROR =
  "Online payment is temporarily unavailable. Please try again later.";

// ─── DI core (testable) ───────────────────────────────────────────────────────

export async function runCreatePrepayIntent(
  deps: {
    sessionClient: DbClient;
    serviceClient: DbClient;
    gateway: PaymentGateway;
  },
  bookingId: string,
): Promise<CreateIntentResult> {
  // 0. Sitewide kill-switch. Hiding the button is not a gate: a server action
  // stays callable by anyone with a session, so the refusal has to live here,
  // ahead of any gateway or database work.
  if (!PAYMENTS_ENABLED) {
    return { ok: false, error: PAYMENTS_DISABLED_ERROR };
  }

  // 1. Verify session.
  const {
    data: { user },
  } = await deps.sessionClient.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // 2. Read booking + payments via session client (RLS enforces ownership).
  const { data: booking, error: fetchError } = await deps.sessionClient
    .from("bookings")
    .select(
      "id, client_id, final_cents, payments(status, amount_cents, refunded_cents)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError || !booking) {
    return { ok: false, error: "Booking not found." };
  }

  // Belt-and-suspenders ownership check (RLS should already enforce this).
  if (booking.client_id !== user.id) {
    return { ok: false, error: "Booking not found." };
  }

  // Guard against a non-numeric final_cents before any money math (defends
  // against a NaN amount reaching the gateway). The column is NOT NULL and the
  // generated types call it a number, but the value still crossed the wire.
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
      let existing: RetrievedIntent | null = null;
      try {
        existing = await deps.gateway.retrieveIntent(
          openFull.stripe_payment_intent_id,
        );
      } catch {
        // Un-retrievable (e.g. a stale id that 404s at Stripe) → not reusable;
        // fall through to retire the row + mint fresh.
        existing = null;
      }

      const reusable =
        existing !== null &&
        openFull.amount_cents === owed &&
        (existing.status === "requires_payment_method" ||
          existing.status === "requires_confirmation") &&
        existing.clientSecret !== null;

      if (reusable) {
        return { ok: true, clientSecret: existing!.clientSecret! };
      }

      // Stale or amount-changed: cancel at Stripe (tolerate a 404 — already gone)
      // + retire the row, then mint fresh under a non-colliding key.
      try {
        await deps.gateway.cancelIntent(openFull.stripe_payment_intent_id);
      } catch {
        // Already canceled/un-cancelable — fine, we retire the row regardless.
      }
      await deps.serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("id", openFull.id);
      idempotencyKey = `prepay:${bookingId}:${owed}:retry-${openFull.stripe_payment_intent_id}`;
    }
  }

  // 5. Mint a new intent with the booking-scoped idempotency key. An unguarded
  // throw here surfaces as a dead Prepay button with nothing in the log.
  let intent: CreatedIntent;
  try {
    intent = await deps.gateway.createIntent({
      amountCents: owed,
      currency: "usd",
      bookingId,
      clientId: user.id,
      idempotencyKey,
    });
  } catch (error) {
    console.error("createIntentCore: gateway rejected the intent", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

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
    console.error("createIntentCore: failed to record payment", insertError);
    return {
      ok: false,
      error: "Something went wrong recording your payment. Please try again.",
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
