import type { PricingType } from "@/features/pricing";

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
}
