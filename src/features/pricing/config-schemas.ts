/**
 * Per-type Zod schemas for pricing_config (validated at the DB/admin boundary).
 *
 * Each schema matches the exact keys seeded in
 * supabase/migrations/20260529205144_seed.sql. Any Cal-edited config from the
 * database must pass through `parsePricingConfig` before entering quote().
 */

import { z } from "zod";
import type {
  PricingType,
  HouseSittingConfig,
  CheckInConfig,
  WalkConfig,
  TrainingConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A non-negative integer cents value (≥ 0). */
const centsSchema = z.number().int().nonnegative();

/** A non-negative percentage (0–100 inclusive). */
const pctSchema = z.number().nonnegative().max(100);

// ---------------------------------------------------------------------------
// Per-type schemas
// ---------------------------------------------------------------------------

const houseSittingConfigSchema = z.object({
  base_dog_cents_per_night: centsSchema,
  base_cat_cents_per_night: centsSchema,
  extra_dog_cents_per_night: centsSchema,
  extra_cat_cents_per_night: centsSchema,
  cant_be_left_alone_cents_per_day: centsSchema,
  extra_walk_15min_cents_per_day: centsSchema,
  holiday_cents_per_day: centsSchema,
  kiche_discount_pct: pctSchema,
});

const checkInConfigSchema = z.object({
  rate_cents_per_hour: centsSchema,
  minimum_cents: centsSchema,
});

const walkConfigSchema = z.object({
  rate_cents_per_hour: centsSchema,
  per_dog_cents: centsSchema,
  kiche_discount_pct: pctSchema,
});

const trainingConfigSchema = z.object({
  rate_cents_per_hour: centsSchema,
});

// ---------------------------------------------------------------------------
// Discriminated dispatcher
// ---------------------------------------------------------------------------

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
 * Parses and validates a raw `pricing_config` JSON object for the given
 * `pricingType`. Returns the typed config or throws a `ZodError` if
 * validation fails.
 *
 * @param pricingType - The service's pricing type (closed union).
 * @param raw         - The raw JSON from the database (unknown shape).
 */
export function parsePricingConfig<T extends PricingType>(
  pricingType: T,
  raw: unknown,
): ConfigForType<T> {
  switch (pricingType) {
    case "house_sitting":
      return houseSittingConfigSchema.parse(raw) as ConfigForType<T>;
    case "check_in":
      return checkInConfigSchema.parse(raw) as ConfigForType<T>;
    case "walk":
      return walkConfigSchema.parse(raw) as ConfigForType<T>;
    case "training":
      return trainingConfigSchema.parse(raw) as ConfigForType<T>;
    default: {
      // Exhaustiveness check — TypeScript will error here if a new
      // PricingType is added without a corresponding case.
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}
