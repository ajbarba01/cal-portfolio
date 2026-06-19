/**
 * Shared pricing domain types.
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

// ---------------------------------------------------------------------------
// Validated config shapes (one per PricingType) — DEPRECATED
// These per-type config interfaces are preserved for Task-9-pending booking
// callers that have not yet been migrated to ServicePricingConfig.
// Do NOT delete until Task 9 confirms all callers are migrated.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Validated pricing_config for the meet-and-greet (no priced fields).
 */
export type MeetGreetConfig = Record<never, never>;

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Quantities for a meet-and-greet (none — it is free and unpriced).
 */
export type MeetGreetQuantities = Record<never, never>;

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Validated pricing_config for house_sitting.
 */
export interface HouseSittingConfig {
  base_dog_cents_per_night: number;
  base_cat_cents_per_night: number;
  extra_dog_cents_per_night: number;
  extra_cat_cents_per_night: number;
  extra_walk_15min_cents_per_day: number;
  holiday_cents_per_day: number;
  kiche_discount_pct: number;
}

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Validated pricing_config for check_in.
 */
export interface CheckInConfig {
  rate_cents_per_hour: number;
  minimum_cents: number;
}

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Validated pricing_config for walk.
 */
export interface WalkConfig {
  rate_cents_per_hour: number;
  per_dog_cents: number;
  kiche_discount_pct: number;
}

/**
 * @deprecated Use `ServicePricingConfig` from `./modifier-types` instead.
 * Validated pricing_config for training.
 */
export interface TrainingConfig {
  rate_cents_per_hour: number;
}

// ---------------------------------------------------------------------------
// Deprecated per-type quantity and modifier shapes
// Kept for Task-9-pending callers. Remove after Task 9 migration.
// ---------------------------------------------------------------------------

/**
 * @deprecated Migrate to flat `QuoteInput` from `./modifier-types`.
 * Quantities specific to house_sitting bookings.
 */
export interface HouseSittingQuantities {
  dogs: number;
  cats: number;
  /** May be fractional (partial stay = % of a 24h night). */
  nights: number;
  /**
   * Requested walk minutes per day for this stay.
   * 45 min/day is included at no charge; `quote()` computes extra 15-min blocks
   * above that threshold and prices them accordingly.
   * Absent or ≤ 45 → no walk add-on line.
   */
  walkMinutesPerDay?: number;
  /** Total holiday days falling within the stay. */
  holidayDays?: number;
}

/**
 * @deprecated Migrate to flat `QuoteInput` from `./modifier-types`.
 * Quantities specific to check_in bookings.
 */
export interface CheckInQuantities {
  hours: number;
  /** Number of premium (holiday) days the service falls on (0 or 1 for sub-24h). Server-derived. */
  holidayDays?: number;
  /** Surcharge per premium day in cents. From settings.holiday_surcharge_cents. Server-derived. */
  holidaySurchargeCents?: number;
}

/**
 * @deprecated Migrate to flat `QuoteInput` from `./modifier-types`.
 * Quantities specific to walk bookings.
 */
export interface WalkQuantities {
  hours: number;
  dogs: number;
  /** Number of premium (holiday) days the service falls on (0 or 1 for sub-24h). Server-derived. */
  holidayDays?: number;
  /** Surcharge per premium day in cents. From settings.holiday_surcharge_cents. Server-derived. */
  holidaySurchargeCents?: number;
}

/**
 * @deprecated Migrate to flat `QuoteInput` from `./modifier-types`.
 * Quantities specific to training bookings.
 */
export interface TrainingQuantities {
  hours: number;
  /** Number of premium (holiday) days the service falls on (0 or 1 for sub-24h). Server-derived. */
  holidayDays?: number;
  /** Surcharge per premium day in cents. From settings.holiday_surcharge_cents. Server-derived. */
  holidaySurchargeCents?: number;
}

// ---------------------------------------------------------------------------
// QuoteInput — now re-exported from modifier-types (flat shape)
// ---------------------------------------------------------------------------

export type { QuoteInput } from "./modifier-types";

// ---------------------------------------------------------------------------
// Quote output (frozen — do not alter shape)
// ---------------------------------------------------------------------------

/** One itemized line in a quote breakdown. amountCents may be negative. */
export interface QuoteLine {
  label: string;
  amountCents: number;
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
