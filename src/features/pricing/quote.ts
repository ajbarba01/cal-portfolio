/**
 * Pure pricing quote delegator.
 *
 * Thin wrapper over `evaluate()` from the modifier engine. Accepts a flat
 * `QuoteInput` (carrying the `ServicePricingConfig` and all booking quantities)
 * and returns a fully itemized `QuoteBreakdown`.
 *
 * No IO, no clock reads, no side-effects — pure function (#5 ENGINEERING).
 */

import type { QuoteBreakdown } from "./types";
import type { QuoteInput } from "./modifier-types";
import { evaluate } from "./modifiers/evaluate";

export function quote(input: QuoteInput): QuoteBreakdown {
  return evaluate(input.config, input);
}
