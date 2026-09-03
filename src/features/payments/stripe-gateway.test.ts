/**
 * Signature verification is the only thing between the webhook endpoint and an
 * attacker writing payment rows, so these tests sign real payloads with the
 * Stripe SDK's own test helper instead of mocking the SDK away.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import Stripe from "stripe";
import { StripeGateway } from "./stripe-gateway";

const WEBHOOK_SECRET = "whsec_gateway_test";

const PAYLOAD = JSON.stringify({
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_gateway_test" } },
});

function sign(payload: string, secret = WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

/** A gateway with both Stripe variables present, as production has them. */
function configuredGateway(): StripeGateway {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_gateway");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  return new StripeGateway();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("StripeGateway.verifyWebhook", () => {
  it("returns the parsed event for a correctly signed payload", () => {
    const result = configuredGateway().verifyWebhook(PAYLOAD, sign(PAYLOAD));

    expect(result).toEqual({ ok: true, event: JSON.parse(PAYLOAD) });
  });

  it("rejects a payload edited after it was signed", () => {
    const signature = sign(PAYLOAD);
    const tampered = PAYLOAD.replace("pi_gateway_test", "pi_attacker");

    const result = configuredGateway().verifyWebhook(tampered, signature);

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a signature produced with a different secret", () => {
    const result = configuredGateway().verifyWebhook(
      PAYLOAD,
      sign(PAYLOAD, "whsec_someone_elses_endpoint"),
    );

    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("reports a missing signature header before reading any configuration", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const result = new StripeGateway().verifyWebhook(PAYLOAD, null);

    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("verifies a genuine delivery on a server with no Stripe API key", () => {
    // Verification is signature maths over the endpoint secret; it must not
    // touch the API key, or a typo in that key would answer a real delivery
    // with "bad signature" instead of failing loudly.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);

    const result = new StripeGateway().verifyWebhook(PAYLOAD, sign(PAYLOAD));

    expect(result).toEqual({ ok: true, event: JSON.parse(PAYLOAD) });
  });

  it("throws when the endpoint secret is unset rather than blaming the signature", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_gateway");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(() =>
      new StripeGateway().verifyWebhook(PAYLOAD, sign(PAYLOAD)),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
