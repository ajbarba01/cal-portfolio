/**
 * Pure pricing display helpers — no IO, no side effects.
 *
 * formatCents: integer cents → formatted dollar string (whole dollars if even).
 * headlineRate: short "from" label per service type for marketing cards.
 */

import type {
  PricingType,
  HouseSittingConfig,
  CheckInConfig,
  WalkConfig,
  TrainingConfig,
} from "./types";

type ConfigForType<T extends PricingType> = T extends "house_sitting"
  ? HouseSittingConfig
  : T extends "check_in"
    ? CheckInConfig
    : T extends "walk"
      ? WalkConfig
      : T extends "training"
        ? TrainingConfig
        : never;

/**
 * Formats integer cents as a dollar string.
 * Whole dollar amounts drop the decimal (e.g. 5000 → "$50").
 * Fractional amounts show two decimals (e.g. 5050 → "$50.50").
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/**
 * Returns a short headline rate label for a service marketing card.
 * Dispatches exhaustively on pricingType — TypeScript will error if a new
 * type is added without a corresponding case.
 */
export function headlineRate<T extends PricingType>(
  pricingType: T,
  pricingConfig: ConfigForType<T>,
): string {
  switch (pricingType) {
    case "house_sitting": {
      const cfg = pricingConfig as HouseSittingConfig;
      return `from ${formatCents(cfg.base_dog_cents_per_night)} / night`;
    }
    case "check_in": {
      const cfg = pricingConfig as CheckInConfig;
      return `${formatCents(cfg.rate_cents_per_hour)} / hour`;
    }
    case "walk": {
      const cfg = pricingConfig as WalkConfig;
      return `${formatCents(cfg.rate_cents_per_hour)} / hour`;
    }
    case "training": {
      const cfg = pricingConfig as TrainingConfig;
      return `${formatCents(cfg.rate_cents_per_hour)} / hour`;
    }
    default: {
      // Exhaustiveness check.
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}
