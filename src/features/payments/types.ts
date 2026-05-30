/**
 * Domain types and the PaymentGateway DI seam for the payments feature.
 * Pure types only — no IO.
 */

// ─── Gateway DI seam ─────────────────────────────────────────────────────────

export interface CreateIntentArgs {
  amountCents: number;
  currency: string;
  bookingId: string;
  clientId: string;
}

export interface CreatedIntent {
  paymentIntentId: string;
  clientSecret: string;
}

/**
 * Thin interface over a payment processor. The app depends on this, not on
 * Stripe directly, so tests can inject a fake gateway without network calls.
 */
export interface PaymentGateway {
  createIntent(args: CreateIntentArgs): Promise<CreatedIntent>;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

/** A single payment transaction — used as input to the projection. */
export interface PaymentTxn {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amountCents: number;
}
