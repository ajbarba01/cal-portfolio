/**
 * Shared pricing domain types.
 *
 * All monetary amounts are integer cents. Pure data shapes — no IO, no Zod
 * schemas here (those live in config-schemas.ts).
 */

/** The four service pricing types (closed union). */
export type PricingType = "house_sitting" | "check_in" | "walk" | "training";

// ---------------------------------------------------------------------------
// Validated config shapes (one per PricingType)
// ---------------------------------------------------------------------------

/** Validated pricing_config for house_sitting. */
export interface HouseSittingConfig {
  base_dog_cents_per_night: number;
  base_cat_cents_per_night: number;
  extra_dog_cents_per_night: number;
  extra_cat_cents_per_night: number;
  cant_be_left_alone_cents_per_day: number;
  extra_walk_15min_cents_per_day: number;
  holiday_cents_per_day: number;
  kiche_discount_pct: number;
}

/** Validated pricing_config for check_in. */
export interface CheckInConfig {
  rate_cents_per_hour: number;
  minimum_cents: number;
}

/** Validated pricing_config for walk. */
export interface WalkConfig {
  rate_cents_per_hour: number;
  per_dog_cents: number;
  kiche_discount_pct: number;
}

/** Validated pricing_config for training. */
export interface TrainingConfig {
  rate_cents_per_hour: number;
}

// ---------------------------------------------------------------------------
// Quote input (discriminated union — no `any`, no stringly dispatch)
// ---------------------------------------------------------------------------

/** Quantities specific to house_sitting bookings. */
export interface HouseSittingQuantities {
  dogs: number;
  cats: number;
  /** May be fractional (partial stay = % of a 24h night). */
  nights: number;
  /** Total days the dog cannot be left alone (≥6 h). */
  cantBeLeftAloneDays?: number;
  /** Total extra 15-min walk blocks per day beyond the included 45 min. */
  extraWalk15minBlocksPerDay?: number;
  /** Total holiday days falling within the stay. */
  holidayDays?: number;
}

/** Quantities specific to check_in bookings. */
export interface CheckInQuantities {
  hours: number;
}

/** Quantities specific to walk bookings. */
export interface WalkQuantities {
  hours: number;
  dogs: number;
}

/** Quantities specific to training bookings. */
export interface TrainingQuantities {
  hours: number;
}

/** Shared modifier fields present on every QuoteInput variant. */
interface QuoteInputModifiers {
  /**
   * Round-trip estimated driving minutes. Used to compute a travel line for
   * hourly services. Absent (or 0) → no travel charge.
   */
  roundTripDriveMinutes?: number;
  /** True when the booking qualifies for the recurring series discount. */
  recurringDiscountApplies: boolean;
  /** The recurring discount percentage (e.g. 10 for −10%). From settings. */
  recurringDiscountPct: number;
  /**
   * Cal-applied Kiche discount percentage (e.g. 25 for −25%). Absent or 0 →
   * not applied. Applied last, after recurring discount.
   */
  kichePct?: number;
}

export type QuoteInput =
  | ({
      pricingType: "house_sitting";
      pricingConfig: HouseSittingConfig;
    } & HouseSittingQuantities &
      QuoteInputModifiers)
  | ({
      pricingType: "check_in";
      pricingConfig: CheckInConfig;
    } & CheckInQuantities &
      QuoteInputModifiers)
  | ({
      pricingType: "walk";
      pricingConfig: WalkConfig;
    } & WalkQuantities &
      QuoteInputModifiers)
  | ({
      pricingType: "training";
      pricingConfig: TrainingConfig;
    } & TrainingQuantities &
      QuoteInputModifiers);

// ---------------------------------------------------------------------------
// Quote output
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
