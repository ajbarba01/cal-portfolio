/**
 * Production adapter for Stripe. Every call into the Stripe SDK the server makes
 * goes through this module, so the app depends on `PaymentGateway` and on the
 * types in `./types`, never on the vendor's own.
 *
 * IDEMPOTENCY CONTRACT (why there is no `stripe_events` ledger table):
 * Stripe re-delivers an event until it gets a 2xx and makes no ordering
 * promise, so the same event can arrive twice and a later one can arrive first.
 * Instead of claiming each event id in a ledger, every write in `webhook-core`
 * converges: a payment status is set from the event rather than incremented, a
 * refund total moves by `Math.max` so an older amount cannot lower it, a
 * `refunded` row refuses to be walked back to `succeeded`, and the booking's
 * `payment_status` is re-derived from all of its payment rows after each write.
 * Replaying the whole event history in any order therefore lands on the same
 * state. The one non-converging call — the overpay refund — is keyed instead
 * (Stripe's own idempotency key) so a replay reuses the original refund. Adding
 * a ledger would be an owner decision; it is not what makes this safe today.
 */

import "server-only";

import Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import type {
  PaymentGateway,
  CreateIntentArgs,
  CreatedIntent,
  RetrievedIntent,
  StripeEventInput,
  WebhookVerification,
} from "./types";

/** Production adapter: delegates to Stripe PaymentIntents API. */
export class StripeGateway implements PaymentGateway {
  private client: Stripe | null = null;

  /**
   * Lazily build the Stripe client. Constructing a StripeGateway is always safe;
   * the missing-key error is deferred until an actual API call is made. This lets
   * code paths that pass the gateway but never charge/refund (e.g. cancelling an
   * unpaid booking, or any flow in a dev env without Stripe configured) run fine.
   */
  private get stripe(): Stripe {
    if (this.client) return this.client;
    this.client = new Stripe(
      requireEnv("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
      { apiVersion: "2026-05-27.dahlia" },
    );
    return this.client;
  }

  /**
   * Checks a webhook delivery's `stripe-signature` against the endpoint secret
   * and hands back the event in the app's own shape — the route never sees a
   * `Stripe.Event`. `rawBody` must be the untouched request text; parsing it
   * first changes the bytes the signature covers.
   *
   * An unsigned or badly signed delivery is a normal outcome (anyone can POST
   * here), so it comes back as a value. An unset endpoint secret is not: that is
   * a misconfigured server, and it throws rather than answering "bad signature"
   * to a delivery that was in fact genuine.
   *
   * Verification is signature maths over the endpoint secret and calls no API,
   * so it goes through Stripe's static `webhooks` rather than `this.stripe`.
   * Reaching for the instance would make a missing STRIPE_SECRET_KEY throw
   * inside the catch below and come back out as "bad signature" — the exact
   * misdiagnosis this method exists to avoid.
   */
  verifyWebhook(
    rawBody: string,
    signature: string | null,
  ): WebhookVerification {
    if (!signature) return { ok: false, reason: "missing_signature" };

    const secret = requireEnv(
      "STRIPE_WEBHOOK_SECRET",
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    let event: StripeEventInput;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true, event };
  }

  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: args.amountCents,
        currency: args.currency,
        metadata: { bookingId: args.bookingId, clientId: args.clientId },
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
    );

    if (!pi.client_secret) {
      throw new Error(
        `Stripe PaymentIntent ${pi.id} returned no client_secret`,
      );
    }

    return {
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
    };
  }

  async refund(
    paymentIntentId: string,
    amountCents: number,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: amountCents },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    // payment_status is re-projected by the charge.refunded webhook — never here.
  }

  async retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return { status: pi.status, clientSecret: pi.client_secret };
  }

  async cancelIntent(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);
    // payment_status is re-projected by the payment_intent.canceled webhook — never here.
  }
}
