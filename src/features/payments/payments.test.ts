/**
 * Integration tests for the payments feature against the local Supabase stack.
 *
 * Prerequisites: local Supabase running (`npx supabase start`).
 * Credentials from .env.test (gitignored).
 *
 * Test groups:
 *   1. create-intent (DI with fake gateway)
 *   2. webhook projection (applyStripeEvent)
 *   3. signature verification
 *   4. security / RLS guards (clients cannot write payments or payment_status)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { runCreatePrepayIntent } from "./create-intent";
import { applyStripeEvent } from "./webhook-core";
import { amountOwedCents } from "./projection";
import type { PaymentGateway, CreatedIntent } from "./types";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY!;
const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_testsecretforlocaltests";

if (!url || !serviceKey || !anonKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS, used for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "Test1234!";
const ts = Date.now();
const user1Email = `test-payments-u1-${ts}@example.invalid`;
const user2Email = `test-payments-u2-${ts}@example.invalid`;

let userId1: string;
let userId2: string;

/** Session clients authenticated with the anon key. */
const sessionClient1 = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sessionClient2 = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A real service_id to satisfy the NOT NULL FK on bookings. */
let serviceId: string;

// ─── Fake gateway ─────────────────────────────────────────────────────────────

const FAKE_INTENT_ID = `pi_fake_${ts}`;
const FAKE_SECRET = `pi_fake_${ts}_secret_xyz`;

class FakeGateway implements PaymentGateway {
  async createIntent(): Promise<CreatedIntent> {
    return {
      paymentIntentId: FAKE_INTENT_ID,
      clientSecret: FAKE_SECRET,
    };
  }

  async refund(): Promise<void> {
    // no-op for this suite (refund behavior is exercised in the booking tests)
  }
}

// ─── Global setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create two fixture users.
  const { data: u1, error: e1 } = await serviceClient.auth.admin.createUser({
    email: user1Email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e1 || !u1.user) throw new Error(`Create user1 failed: ${e1?.message}`);
  userId1 = u1.user.id;

  const { data: u2, error: e2 } = await serviceClient.auth.admin.createUser({
    email: user2Email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e2 || !u2.user) throw new Error(`Create user2 failed: ${e2?.message}`);
  userId2 = u2.user.id;

  // Sign in both sessions.
  await sessionClient1.auth.signInWithPassword({
    email: user1Email,
    password: TEST_PASSWORD,
  });
  await sessionClient2.auth.signInWithPassword({
    email: user2Email,
    password: TEST_PASSWORD,
  });

  // Look up a service id to use for test bookings.
  const { data: svc } = await serviceClient
    .from("services")
    .select("id")
    .limit(1)
    .single();
  if (!svc?.id) throw new Error("No services seeded — run migrations first");
  serviceId = svc.id as string;
});

afterAll(async () => {
  await serviceClient.auth.admin.deleteUser(userId1);
  await serviceClient.auth.admin.deleteUser(userId2);
});

// ─── Helper: seed a booking ────────────────────────────────────────────────────

async function seedBooking(
  clientId: string,
  finalCents: number,
  startOffsetDays = 1,
): Promise<string> {
  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: clientId,
      service_id: serviceId,
      starts_at: new Date(
        Date.now() + 86400_000 * startOffsetDays,
      ).toISOString(),
      ends_at: new Date(
        Date.now() + 86400_000 * (startOffsetDays + 1),
      ).toISOString(),
      concurrency: "exclusive",
      final_cents: finalCents,
      status: "confirmed",
    })
    .select("id")
    .single();

  if (error || !data?.id)
    throw new Error(`Seed booking failed: ${error?.message}`);
  return data.id as string;
}

async function seedPayment(
  bookingId: string,
  clientId: string,
  intentId: string,
  amountCents: number,
  status: "requires_payment" | "succeeded" | "refunded" | "failed",
) {
  const { error } = await serviceClient.from("payments").insert({
    booking_id: bookingId,
    client_id: clientId,
    stripe_payment_intent_id: intentId,
    amount_cents: amountCents,
    currency: "usd",
    status,
  });
  if (error) throw new Error(`Seed payment failed: ${error.message}`);
}

// ─── 1. create-intent (integration, fake gateway) ────────────────────────────

describe("runCreatePrepayIntent", () => {
  let bookingId: string;

  beforeAll(async () => {
    bookingId = await seedBooking(userId1, 5000);
  });

  afterAll(async () => {
    await serviceClient.from("payments").delete().eq("booking_id", bookingId);
    await serviceClient.from("bookings").delete().eq("id", bookingId);
  });

  it("creates a payment row and returns clientSecret for owner", async () => {
    const result = await runCreatePrepayIntent(
      {
        sessionClient: sessionClient1,
        serviceClient,
        gateway: new FakeGateway(),
      },
      bookingId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clientSecret).toBe(FAKE_SECRET);

    // Verify payment row was persisted.
    const { data: payment } = await serviceClient
      .from("payments")
      .select("amount_cents, status, stripe_payment_intent_id")
      .eq("booking_id", bookingId)
      .single();

    expect(payment?.amount_cents).toBe(5000);
    expect(payment?.status).toBe("requires_payment");
    expect(payment?.stripe_payment_intent_id).toBe(FAKE_INTENT_ID);
  });

  it("returns ok:false for a booking owned by another user", async () => {
    const result = await runCreatePrepayIntent(
      {
        sessionClient: sessionClient2, // user2 trying to pay user1's booking
        serviceClient,
        gateway: new FakeGateway(),
      },
      bookingId,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);

    // Confirm no extra payment row was inserted.
    const { data: payments } = await serviceClient
      .from("payments")
      .select("id")
      .eq("booking_id", bookingId);

    // The one row from the previous test is fine; no second one.
    expect((payments ?? []).length).toBeLessThanOrEqual(1);
  });

  it("returns ok:false when booking is already fully paid (owed <= 0)", async () => {
    // Mark the existing payment as succeeded so owed drops to 0.
    await serviceClient
      .from("payments")
      .update({ status: "succeeded" })
      .eq("booking_id", bookingId);

    const result = await runCreatePrepayIntent(
      {
        sessionClient: sessionClient1,
        serviceClient,
        gateway: new FakeGateway(),
      },
      bookingId,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already paid/i);
  });
});

// ─── 2. webhook projection (applyStripeEvent) ────────────────────────────────

describe("applyStripeEvent — webhook projection", () => {
  const intentId = `pi_webhook_${ts}`;
  let bookingId: string;

  beforeAll(async () => {
    bookingId = await seedBooking(userId1, 8000);
    await seedPayment(bookingId, userId1, intentId, 8000, "requires_payment");
  });

  afterAll(async () => {
    await serviceClient.from("payments").delete().eq("booking_id", bookingId);
    await serviceClient.from("bookings").delete().eq("id", bookingId);
  });

  it("payment_intent.succeeded → payments.status=succeeded, booking.payment_status=paid", async () => {
    const result = await applyStripeEvent(serviceClient, {
      type: "payment_intent.succeeded",
      data: { object: { id: intentId } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(true);

    const { data: payment } = await serviceClient
      .from("payments")
      .select("status")
      .eq("stripe_payment_intent_id", intentId)
      .single();
    expect(payment?.status).toBe("succeeded");

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("payment_status, status")
      .eq("id", bookingId)
      .single();
    expect(booking?.payment_status).toBe("paid");
    // CRITICAL: bookings.status MUST NOT have changed.
    expect(booking?.status).toBe("confirmed");

    // Amount owed recomputes to 0 once the 8000-cent intent succeeds.
    const { data: txnRows } = await serviceClient
      .from("payments")
      .select("status, amount_cents")
      .eq("booking_id", bookingId);
    const txns = (txnRows ?? []).map((t) => ({
      status: t.status as
        | "requires_payment"
        | "succeeded"
        | "refunded"
        | "failed",
      amountCents: t.amount_cents as number,
    }));
    expect(amountOwedCents(8000, txns)).toBe(0);
  });

  it("re-delivering same event is idempotent (still paid)", async () => {
    const result = await applyStripeEvent(serviceClient, {
      type: "payment_intent.succeeded",
      data: { object: { id: intentId } },
    });
    expect(result.ok).toBe(true);

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();
    expect(booking?.payment_status).toBe("paid");
  });

  it("charge.refunded → payments.status=refunded, booking.payment_status=refunded", async () => {
    const result = await applyStripeEvent(serviceClient, {
      type: "charge.refunded",
      data: { object: { payment_intent: intentId } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(true);

    const { data: payment } = await serviceClient
      .from("payments")
      .select("status")
      .eq("stripe_payment_intent_id", intentId)
      .single();
    expect(payment?.status).toBe("refunded");

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("payment_status, status")
      .eq("id", bookingId)
      .single();
    expect(booking?.payment_status).toBe("refunded");
    // CRITICAL: bookings.status MUST NOT have changed.
    expect(booking?.status).toBe("confirmed");
  });

  it("forward-only: a re-delivered succeeded after refund does NOT flip back to paid", async () => {
    // Row is currently 'refunded' from the previous test.
    const result = await applyStripeEvent(serviceClient, {
      type: "payment_intent.succeeded",
      data: { object: { id: intentId } },
    });
    expect(result.ok).toBe(true);

    const { data: payment } = await serviceClient
      .from("payments")
      .select("status")
      .eq("stripe_payment_intent_id", intentId)
      .single();
    // Refund is terminal — status stays refunded, not succeeded.
    expect(payment?.status).toBe("refunded");

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();
    expect(booking?.payment_status).toBe("refunded");
  });

  it("charge.refunded accepts an expanded payment_intent object", async () => {
    const expandedIntentId = `pi_expanded_${ts}`;
    // Far-future window to avoid the no_same_class_overlap exclusion constraint.
    const expandedBooking = await seedBooking(userId1, 4000, 400);
    await seedPayment(
      expandedBooking,
      userId1,
      expandedIntentId,
      4000,
      "succeeded",
    );

    const result = await applyStripeEvent(serviceClient, {
      type: "charge.refunded",
      data: { object: { payment_intent: { id: expandedIntentId } } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(true);

    const { data: payment } = await serviceClient
      .from("payments")
      .select("status")
      .eq("stripe_payment_intent_id", expandedIntentId)
      .single();
    expect(payment?.status).toBe("refunded");

    await serviceClient
      .from("payments")
      .delete()
      .eq("booking_id", expandedBooking);
    await serviceClient.from("bookings").delete().eq("id", expandedBooking);
  });

  it("unknown intent id → ok:true, handled:false (no crash)", async () => {
    const result = await applyStripeEvent(serviceClient, {
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_unknown_xxxxxxxx" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(false);
  });

  it("unrecognised event type → ok:true, handled:false", async () => {
    const result = await applyStripeEvent(serviceClient, {
      type: "customer.created",
      data: { object: { id: "cus_test" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(false);
  });
});

// ─── 3. Signature verification ────────────────────────────────────────────────

describe("Stripe signature verification", () => {
  // Use a dummy secret key — constructEvent / generateTestHeaderString only
  // need any non-empty string for HMAC; no real API calls are made here.
  const stripe = new Stripe("sk_test_dummy_for_sig_verification", {
    apiVersion: "2026-05-27.dahlia",
  });
  const payload = JSON.stringify({
    id: "evt_test",
    type: "payment_intent.succeeded",
  });

  it("accepts a correctly-signed payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    expect(() =>
      stripe.webhooks.constructEvent(payload, header, webhookSecret),
    ).not.toThrow();
  });

  it("throws on a tampered payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    const tampered = payload.replace("payment_intent", "tampered");
    expect(() =>
      stripe.webhooks.constructEvent(tampered, header, webhookSecret),
    ).toThrow();
  });

  it("throws on a wrong secret", () => {
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    expect(() =>
      stripe.webhooks.constructEvent(payload, header, "whsec_wrong_secret"),
    ).toThrow();
  });
});

// ─── 4. Security: RLS/grant guards ────────────────────────────────────────────

describe("Security: clients cannot write payments or payment_status", () => {
  let bookingId: string;

  beforeAll(async () => {
    bookingId = await seedBooking(userId1, 3000);
  });

  afterAll(async () => {
    await serviceClient.from("payments").delete().eq("booking_id", bookingId);
    await serviceClient.from("bookings").delete().eq("id", bookingId);
  });

  it("authenticated client CANNOT insert into payments table", async () => {
    const { error, data } = await sessionClient1.from("payments").insert({
      booking_id: bookingId,
      client_id: userId1,
      stripe_payment_intent_id: `pi_rls_test_${ts}`,
      amount_cents: 3000,
      currency: "usd",
      status: "requires_payment",
    });

    // Must be rejected: either an error or no rows inserted.
    const rejected = !!error || !data;
    expect(rejected).toBe(true);

    // Confirm via service role that no row was inserted.
    const { data: rows } = await serviceClient
      .from("payments")
      .select("id")
      .eq("booking_id", bookingId);
    expect(rows ?? []).toHaveLength(0);
  });

  it("authenticated client CANNOT update bookings.payment_status", async () => {
    // Confirm initial state via service role.
    const { data: before } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();
    expect(before?.payment_status).toBe("unpaid");

    // Attempt to change payment_status via session client.
    await sessionClient1
      .from("bookings")
      .update({ payment_status: "paid" } as never)
      .eq("id", bookingId);

    // Re-read via service role to confirm no change.
    const { data: after } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();
    expect(after?.payment_status).toBe("unpaid");
  });
});
