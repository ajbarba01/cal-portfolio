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
    .select("id, client_id, final_cents, payments(status, amount_cents)")
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

  // 3. Derive amount server-side. Map DB row → PaymentTxn (snake_case → camelCase).
  const txns = booking.payments.map((p) => ({
    status: p.status,
    amountCents: p.amount_cents,
  }));
  const owed = amountOwedCents(booking.final_cents, txns);
  if (owed <= 0) {
    return { ok: false, error: "This booking is already paid." };
  }

  // 4. Create the PaymentIntent via gateway.
  const intent = await deps.gateway.createIntent({
    amountCents: owed,
    currency: "usd",
    bookingId,
    clientId: user.id,
  });

  // 5. Persist the payments row via service client (clients have no INSERT grant).
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

  // 6. Return the client secret for Stripe.js.
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
