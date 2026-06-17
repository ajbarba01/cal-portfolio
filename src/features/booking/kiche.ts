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

/** Numbers the admin Kiche control needs to render its apply/remove confirm. */
export interface KichePreview {
  /** Current applied state (drives the switch). */
  applied: boolean;
  /** The booking's total as it stands now. */
  currentFinalCents: number;
  /** What the total becomes if the switch is flipped. */
  toggledFinalCents: number;
  /** Refund issued if applying now to an already-paid booking; 0 otherwise. */
  refundIfApplyCents: number;
  /** Amount the client has already paid. */
  paidCents: number;
}

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

/**
 * Builds the admin Kiche control's preview numbers from a booking's STORED
 * quote, or returns null when that quote cannot be re-priced.
 *
 * The stored `quote_inputs` is jsonb (typed `unknown` at the DB edge): seeded
 * or legacy bookings can carry `{}` or otherwise malformed shapes, on which
 * `quote()` throws. Because the admin edit page computes this preview at render,
 * an uncaught throw there crashes the whole page. Returning null lets the page
 * omit the Kiche control instead — there is nothing coherent to re-price, so the
 * apply/remove action would be meaningless anyway. Pure.
 */
export function kichePreview(args: {
  quoteInputs: unknown;
  kicheApplied: boolean;
  currentFinalCents: number;
  paidCents: number;
}): KichePreview | null {
  let toggled: QuoteBreakdown;
  try {
    toggled = requoteWithKiche(
      args.quoteInputs as QuoteInput,
      !args.kicheApplied,
    );
  } catch {
    return null;
  }
  return {
    applied: args.kicheApplied,
    currentFinalCents: args.currentFinalCents,
    toggledFinalCents: toggled.finalCents,
    // Refund only matters when applying (un-applying raises the total).
    refundIfApplyCents: args.kicheApplied
      ? 0
      : kicheOverpayRefundCents(args.paidCents, toggled.finalCents),
    paidCents: args.paidCents,
  };
}
