/**
 * Zod schemas for the modifier-list `pricing_config` shape.
 *
 * Each `Modifier` variant from `modifier-types.ts` gets its own discriminated
 * schema. `parsePricingConfig(raw)` validates the `{ modifiers, constraints }`
 * envelope and returns a typed `ServicePricingConfig`, throwing `ZodError` on
 * any violation.
 */

import { z } from "zod";
import type { ServicePricingConfig } from "./modifier-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Non-negative integer cents (rates, bases, floors — must be ≥ 0). */
const rateCentsSchema = z.number().int().nonnegative();

/** Integer cents allowing negative values (discount toggles). */
const discountCentsSchema = z.number().int();

/** Percentage in [0, 100] inclusive. */
const pctSchema = z.number().min(0).max(100);

/** Positive integer (interval minutes etc.). */
const positiveIntSchema = z.number().int().positive();

/** Non-negative number (optional soft limits). */
const nonNegSchema = z.number().nonnegative();

// ---------------------------------------------------------------------------
// Species / Unit / Condition / Tier
// ---------------------------------------------------------------------------

const speciesSchema = z.enum([
  "dog",
  "cat",
  "bird",
  "rodent",
  "reptile",
  "fish",
  "other",
]);

const unitSchema = z.enum(["dog", "cat", "other"]);

const conditionSchema = z.enum([
  "always",
  "noDogs",
  "anyDogUnder6mo",
  "recurringSeries",
  "nightsOver4",
  "nightsOver6",
]);

const tierSchema = z.object({
  from: z.number(),
  cents: rateCentsSchema.optional(),
  pct: pctSchema.optional(),
});

// ---------------------------------------------------------------------------
// Source sub-schemas for flat_per_night_toggle
// ---------------------------------------------------------------------------

const conditionSourceSchema = z.object({
  kind: z.literal("condition"),
  condition: conditionSchema,
});

const ladderSourceSchema = z.object({
  kind: z.literal("ladder"),
  input: z.literal("needyTier"),
  maxTier: z.number(),
});

const toggleSourceSchema = z.discriminatedUnion("kind", [
  conditionSourceSchema,
  ladderSourceSchema,
]);

// ---------------------------------------------------------------------------
// Modifier variant schemas
// ---------------------------------------------------------------------------

const basePerNightSchema = z.object({
  kind: z.literal("base_per_night"),
  cents: rateCentsSchema,
});

const basePerHourSchema = z.object({
  kind: z.literal("base_per_hour"),
  cents: rateCentsSchema,
});

/** flat_per_unit: discount cents allowed (e.g. cat_only −2500). */
const flatPerUnitSchema = z.object({
  kind: z.literal("flat_per_unit"),
  unit: unitSchema,
  cents: discountCentsSchema,
});

const tieredPerUnitSchema = z.object({
  kind: z.literal("tiered_per_unit"),
  unit: unitSchema,
  tiers: z.array(tierSchema),
});

/** flat_per_night_toggle: discount cents allowed (negative for reductions). */
const flatPerNightToggleSchema = z.object({
  kind: z.literal("flat_per_night_toggle"),
  id: z.string(),
  label: z.string(),
  cents: discountCentsSchema,
  source: toggleSourceSchema,
  manual: z.boolean().optional(),
});

const perHourAddonSchema = z.object({
  kind: z.literal("per_hour_addon"),
  id: z.string(),
  label: z.string(),
  cents: rateCentsSchema,
  optIn: z.literal(true),
});

const allowanceThenPerUnitSchema = z.object({
  kind: z.literal("allowance_then_per_unit"),
  unit: z.enum(["mile", "exercise"]),
  label: z.string(),
  freeUnits: z.number(),
  cents: rateCentsSchema,
  perScale: z.literal("perDogPerDay").optional(),
});

const pctSurchargeSchema = z.object({
  kind: z.literal("pct_surcharge"),
  id: z.string(),
  label: z.string(),
  pct: pctSchema,
  scope: z.enum(["wholeBooking", "perPremiumNight"]),
  condition: z.literal("premiumDays"),
});

const pctDiscountSchema = z.object({
  kind: z.literal("pct_discount"),
  id: z.string(),
  label: z.string(),
  pct: pctSchema,
  condition: conditionSchema,
  manual: z.boolean().optional(),
});

const minFloorSchema = z.object({
  kind: z.literal("min_floor"),
  cents: rateCentsSchema,
});

// ---------------------------------------------------------------------------
// Modifier discriminated union
// ---------------------------------------------------------------------------

const modifierSchema = z.discriminatedUnion("kind", [
  basePerNightSchema,
  basePerHourSchema,
  flatPerUnitSchema,
  tieredPerUnitSchema,
  flatPerNightToggleSchema,
  perHourAddonSchema,
  allowanceThenPerUnitSchema,
  pctSurchargeSchema,
  pctDiscountSchema,
  minFloorSchema,
]);

// ---------------------------------------------------------------------------
// Constraints schema
// ---------------------------------------------------------------------------

const constraintsSchema = z
  .object({
    intervalMin: positiveIntSchema,
    minDurationMin: nonNegSchema.optional(),
    maxDurationMin: nonNegSchema.optional(),
    maxDogs: nonNegSchema.optional(),
    allowedSpecies: z.array(speciesSchema).nonempty(),
    softDistanceWarnMiles: nonNegSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (
      c.minDurationMin !== undefined &&
      c.maxDurationMin !== undefined &&
      c.minDurationMin > c.maxDurationMin
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDurationMin"],
        message:
          "maxDurationMin must be greater than or equal to minDurationMin",
      });
    }
    if (c.maxDogs !== undefined && c.maxDogs < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDogs"],
        message: "maxDogs must be at least 1",
      });
    }
  });

// ---------------------------------------------------------------------------
// Top-level ServicePricingConfig schema
// ---------------------------------------------------------------------------

const servicePricingConfigSchema = z.object({
  modifiers: z.array(modifierSchema),
  constraints: constraintsSchema,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses and validates a raw `pricing_config` JSON object.
 * Returns a typed `ServicePricingConfig` or throws a `ZodError` on failure.
 *
 * @param raw - The raw JSON from the database (unknown shape).
 */
export function parsePricingConfig(raw: unknown): ServicePricingConfig {
  return servicePricingConfigSchema.parse(raw) as ServicePricingConfig;
}
