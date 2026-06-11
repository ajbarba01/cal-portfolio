import "server-only";

import Stripe from "stripe";
import type {
  PaymentGateway,
  CreateIntentArgs,
  CreatedIntent,
  RetrievedIntent,
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
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "Missing STRIPE_SECRET_KEY — set it in .env.local before starting the server.",
      );
    }
    this.client = new Stripe(secretKey, {
      apiVersion: "2026-05-27.dahlia",
    });
    return this.client;
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

  async refund(paymentIntentId: string, amountCents: number): Promise<void> {
    await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
    });
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
