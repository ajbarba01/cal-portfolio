import type { PricingType, Constraints } from "@/features/pricing";

/**
 * Permissive fallback used only when a service row's pricing_config can't be
 * parsed — keeps the booking UI functional (dog/cat, 15-min grid, no caps)
 * rather than crashing. Real services always carry their seeded constraints.
 */
export const DEFAULT_CONSTRAINTS: Constraints = {
  intervalMin: 15,
  allowedSpecies: ["dog", "cat"],
};

/**
 * Minimal service descriptor consumed by the booking UI (both the create flow
 * and the edit surface). Lives here so it can be imported by components at any
 * route depth without creating cross-app-dir imports.
 */
export interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  pricingType: PricingType;
  defaultDurationMin: number | null;
  /** The service's booking constraints (parsed from pricing_config). */
  constraints: Constraints;
}
