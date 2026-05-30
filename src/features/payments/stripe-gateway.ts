import "server-only";

import Stripe from "stripe";
import type { PaymentGateway, CreateIntentArgs, CreatedIntent } from "./types";

/** Production adapter: delegates to Stripe PaymentIntents API. */
export class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "Missing STRIPE_SECRET_KEY — set it in .env.local before starting the server.",
      );
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2026-05-27.dahlia",
    });
  }

  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    const pi = await this.stripe.paymentIntents.create({
      amount: args.amountCents,
      currency: args.currency,
      metadata: {
        bookingId: args.bookingId,
        clientId: args.clientId,
      },
    });

    return {
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret!,
    };
  }
}
