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
  MeetGreetConfig,
} from "./types";

type ConfigForType<T extends PricingType> = T extends "house_sitting"
  ? HouseSittingConfig
  : T extends "check_in"
    ? CheckInConfig
    : T extends "walk"
      ? WalkConfig
      : T extends "training"
        ? TrainingConfig
        : T extends "meet_greet"
          ? MeetGreetConfig
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

/** One row of a service's marketing pricing breakdown ("how it's priced"). */
export interface PricingBreakdownRow {
  label: string;
  value: string;
}

/**
 * Returns the itemized "how it's priced" rows for a service's marketing
 * receipt — derived from its validated pricing_config, so admin rate edits flow
 * straight through. This is descriptive (rate structure), not a computed quote;
 * the live total is confirmed in the booking flow. Exhaustive on pricingType.
 */
export function pricingBreakdown<T extends PricingType>(
  pricingType: T,
  pricingConfig: ConfigForType<T>,
): PricingBreakdownRow[] {
  switch (pricingType) {
    case "house_sitting": {
      const cfg = pricingConfig as HouseSittingConfig;
      return [
        {
          label: "Base rate (with dog)",
          value: `${formatCents(cfg.base_dog_cents_per_night)} / night`,
        },
        {
          label: "Cat-only home",
          value: `${formatCents(cfg.base_cat_cents_per_night)} / night`,
        },
        {
          label: "Each extra dog",
          value: `+${formatCents(cfg.extra_dog_cents_per_night)} / night`,
        },
        {
          label: "Each cat",
          value: `+${formatCents(cfg.extra_cat_cents_per_night)} / night`,
        },
        {
          label: "Holiday",
          value: `+${formatCents(cfg.holiday_cents_per_day)} / day`,
        },
      ];
    }
    case "check_in": {
      const cfg = pricingConfig as CheckInConfig;
      return [
        {
          label: "Hourly",
          value: `${formatCents(cfg.rate_cents_per_hour)} / hour`,
        },
        { label: "Minimum", value: formatCents(cfg.minimum_cents) },
        { label: "Driving time", value: "Included" },
      ];
    }
    case "walk": {
      const cfg = pricingConfig as WalkConfig;
      return [
        {
          label: "Hourly",
          value: `${formatCents(cfg.rate_cents_per_hour)} / hour`,
        },
        { label: "Each dog", value: `+${formatCents(cfg.per_dog_cents)}` },
      ];
    }
    case "training": {
      const cfg = pricingConfig as TrainingConfig;
      return [
        {
          label: "Hourly",
          value: `${formatCents(cfg.rate_cents_per_hour)} / hour`,
        },
        { label: "Dogs per session", value: "1" },
      ];
    }
    case "meet_greet":
      return [];
    default: {
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
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
    case "meet_greet":
      return "Free";
    default: {
      // Exhaustiveness check.
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}
