/**
 * Pure Kiche-discount helpers.
 *
 * Kiche is Cal's own dog. Two separate booking flags drive this (see
 * 20260616120000_booking_kiche_flags.sql): `kiche_welcome` (client consent) and
 * `kiche_applied` (Cal's decision that Kiche is coming, which applies the
 * discount). These helpers are the pure core behind the admin apply action:
 * re-quoting with the discount toggled and computing any refund owed when a
 * now-lower total drops below what the client already paid.
 *
 * No IO, no clock reads (ENGINEERING #5).
 */

import { quote } from "@/features/pricing";
import type { QuoteInput, QuoteBreakdown } from "@/features/pricing";

/**
 * Service pricing types that carry a Kiche discount rate. Per Cal: house-sitting
 * and walks only. The pricing core already enforces this (only those two configs
 * hold `kiche_discount_pct`); this constant lets the apply action reject a no-op
 * toggle on an unsupported service rather than silently changing nothing.
 */
export const KICHE_SUPPORTED_PRICING_TYPES = ["house_sitting", "walk"] as const;

export function serviceSupportsKiche(pricingType: string): boolean {
  return (KICHE_SUPPORTED_PRICING_TYPES as readonly string[]).includes(
    pricingType,
  );
}

/**
 * Re-runs a booking's STORED quote with `applyKiche` flipped. The stored
 * QuoteInput is the frozen, server-written quote — re-quoting it changes only
 * the Kiche line (no travel/holiday/settings re-derivation), so the price delta
 * is exactly the discount Cal is applying or removing. Pure.
 */
export function requoteWithKiche(
  storedQuoteInput: QuoteInput,
  applyKiche: boolean,
): QuoteBreakdown {
  return quote({ ...storedQuoteInput, applyKiche } as QuoteInput);
}

/**
 * Cents to refund when a new (lower) total drops below what the client already
 * paid — the overpayment created by applying the discount post-payment. Clamps
 * to 0 (un-applying Kiche raises the total → no refund; an underpayment is
 * surfaced by the owing system, never auto-charged here).
 */
export function kicheOverpayRefundCents(
  paidCents: number,
  newFinalCents: number,
): number {
  return Math.max(0, paidCents - newFinalCents);
}
