/**
 * Shared pricing domain types, plus the predicates that read them.
 *
 * All monetary amounts are integer cents. Pure data shapes — no IO, no Zod
 * schemas here (those live in config-schemas.ts).
 */

/** The pricing types (closed union). meet_greet is the free onboarding visit. */
export type PricingType =
  | "house_sitting"
  | "check_in"
  | "walk"
  | "training"
  | "meet_greet";

/**
 * Whether a service's bookings carry assigned pets.
 *
 * All four paid services do — house-sits and walks price by headcount, check-ins
 * and training assign pets so their per-pet care requirements are satisfiable.
 * The free meet-and-greet is the introduction that comes before any of that, so
 * it is the only pricing type that assigns none. One definition, so no surface
 * can answer this differently from another.
 */
export function isPetAware(pricingType: PricingType): boolean {
  return pricingType !== "meet_greet";
}

// ---------------------------------------------------------------------------
// QuoteInput — now re-exported from modifier-types (flat shape)
// ---------------------------------------------------------------------------

export type { QuoteInput } from "./modifier-types";

// ---------------------------------------------------------------------------
// Quote output (frozen — amountCents/label are load-bearing; do not alter or
// remove existing fields. `description?` is additive, optional, and
// non-breaking, so new optional fields in that spirit are fine.)
// ---------------------------------------------------------------------------

/** One itemized line in a quote breakdown. amountCents may be negative. */
export interface QuoteLine {
  label: string;
  amountCents: number;
  /** Optional plain-language definition, rendered as an info-tooltip. */
  description?: string;
}

/**
 * Fully itemized quote result.
 * finalCents is the arithmetic sum of all line amounts (may include negative
 * discount lines).
 */
export interface QuoteBreakdown {
  lines: QuoteLine[];
  finalCents: number;
}
