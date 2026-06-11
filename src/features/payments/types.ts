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
  /** Booking-scoped key so repeat clicks don't mint duplicate intents (Stripe idempotency). */
  idempotencyKey?: string;
}

/** Status + secret needed to decide whether an existing intent can be reused. */
export interface RetrievedIntent {
  status: string; // Stripe PaymentIntent.status
  clientSecret: string | null;
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

  /**
   * Initiate a refund of `amountCents` against a PaymentIntent. The resulting
   * `charge.refunded` webhook re-projects `payment_status` (the webhook stays
   * the sole writer of that column) — this call NEVER writes payment_status.
   */
  refund(paymentIntentId: string, amountCents: number): Promise<void>;

  /** Read an intent's current status (to decide reuse vs recreate). */
  retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent>;

  /** Cancel a stale/abandoned intent before minting a fresh one. */
  cancelIntent(paymentIntentId: string): Promise<void>;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

/** A single payment transaction — used as input to the projection. */
export interface PaymentTxn {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amountCents: number;
  /** Cumulative cents refunded against this txn (Stripe charge.amount_refunded). */
  refundedCents: number;
}
