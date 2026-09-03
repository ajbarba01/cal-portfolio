/**
 * The Stripe webhook exists only while payments are on. With the kill-switch
 * off the route answers 404 before it reads a single Stripe environment
 * variable — which is what makes the gate provable here: were it missing, the
 * unset STRIPE_SECRET_KEY would throw instead of returning a response.
 *
 * With payments on, the route's job is to refuse anything it cannot attribute
 * to Stripe. Both refusals answer 400 — an unsigned request and one whose
 * signature does not verify — because a 500 would have Stripe retry a request
 * that will never be accepted, and a 200 would let anyone move money in the
 * ledger by posting an event body.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

/** Enough of a webhook secret for the SDK to reach its signature comparison. */
const WEBHOOK_SECRET = "whsec_test_secret";

/**
 * The kill-switch is a build-time constant, so each mode needs its own copy of
 * the route module rather than a value flipped between calls.
 */
async function loadPost(paymentsEnabled: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/payments-enabled", () => ({
    PAYMENTS_ENABLED: paymentsEnabled,
  }));
  const { POST } = await import("./route");
  return POST;
}

function webhookRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.invalid/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: "{}",
  });
}

afterEach(() => {
  vi.doUnmock("@/lib/payments-enabled");
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/stripe", () => {
  it("answers 404 without reading any Stripe configuration when payments are off", async () => {
    const post = await loadPost(false);

    const response = await post(
      webhookRequest({ "stripe-signature": "t=1,v1=irrelevant" }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses an unsigned request when payments are on", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_gate");
    const post = await loadPost(true);

    const response = await post(webhookRequest());

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe(
      "Missing stripe-signature header",
    );
  });

  it("refuses a signature that does not verify against the webhook secret", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_gate");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const post = await loadPost(true);

    const response = await post(
      webhookRequest({ "stripe-signature": "t=1,v1=deadbeef" }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Invalid signature");
  });
});
