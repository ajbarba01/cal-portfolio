/**
 * The pricing configuration the migrations seed, as one fixture every pricing
 * suite reads.
 *
 * Two suites used to keep their own hand-copied version of these configs and
 * both had drifted from the database — a Kiche discount at the wrong percentage,
 * a cat-only rate the migrations had already replaced, a recurring discount
 * house-sitting never carried. Pinning them here means a rate change shows up as
 * one edit that the suites re-derive from, instead of as a quietly stale golden
 * number.
 *
 * Transcribed from the migration chain in `supabase/migrations`, applied in
 * order:
 *   - `20260618120000_pricing_modifier_config.sql` writes each config whole
 *   - `20260619120000_checkin_allow_all_species.sql` widens check-in's species
 *   - `20260619130000_exercise_per_night.sql` strips the `perScale` key
 *   - `20260620120000_fix_checkin_training_rates.sql` unswaps the two hourly
 *     rates and drops check-in's puppy-training discount
 *   - `20260902140000_manual_discount_modifiers.sql` appends the two
 *     Cal-toggled discounts to every paid service
 *   - `20260903120000_cat_only_catsonly_condition.sql` narrows the cat-only
 *     discount from `noDogs` to `catsOnly`
 *
 * The literals are deliberately left untyped and exported twice. A typed literal
 * is checked by the compiler, which would leave the parser round-trip in
 * `config-schemas.test.ts` asserting something `tsc` had already proved — so the
 * raw export is what that suite parses, and the parsed export is what the rate
 * readers use.
 */

import {
  parsePricingConfig,
  type PricingType,
  type ServicePricingConfig,
} from "@/features/pricing";

const HOUSE_SITTING = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home",
      cents: -2500,
      source: { kind: "condition", condition: "catsOnly" },
    },
    {
      kind: "flat_per_night_toggle",
      id: "puppy_household",
      label: "Puppy household",
      cents: -1000,
      source: { kind: "condition", condition: "anyDogUnder6mo" },
    },
    {
      kind: "tiered_per_unit",
      unit: "dog",
      tiers: [
        { from: 2, cents: 1500 },
        { from: 3, cents: 1000 },
      ],
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
    { kind: "flat_per_unit", unit: "other", cents: 500 },
    {
      kind: "flat_per_night_toggle",
      id: "needy",
      label: "Needy pet care",
      cents: 500,
      source: { kind: "ladder", input: "needyTier", maxTier: 4 },
    },
    {
      kind: "allowance_then_per_unit",
      unit: "exercise",
      label: "Extra exercise",
      freeUnits: 45,
      cents: 500,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 250,
    },
    {
      kind: "pct_surcharge",
      id: "premium",
      label: "Premium night (+20%)",
      pct: 20,
      scope: "perPremiumNight",
      condition: "premiumDays",
    },
    {
      kind: "pct_discount",
      id: "long_a",
      label: "Long stay (-5%)",
      pct: 5,
      condition: "nightsOver4",
    },
    {
      kind: "pct_discount",
      id: "long_b",
      label: "Extended stay (-5%)",
      pct: 5,
      condition: "nightsOver6",
    },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (-15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "friends_family",
      label: "Friends & Family (−50%)",
      pct: 50,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "complimentary",
      label: "Complimentary",
      pct: 100,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 15,
    allowedSpecies: [
      "dog",
      "cat",
      "bird",
      "rodent",
      "reptile",
      "fish",
      "other",
    ],
    softDistanceWarnMiles: 15,
  },
};

const CHECK_IN = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
    {
      kind: "pct_surcharge",
      id: "premium",
      label: "Premium day (+20%)",
      pct: 20,
      scope: "wholeBooking",
      condition: "premiumDays",
    },
    {
      kind: "pct_discount",
      id: "recurring",
      label: "Recurring discount (-5%)",
      pct: 5,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "friends_family",
      label: "Friends & Family (−50%)",
      pct: 50,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "complimentary",
      label: "Complimentary",
      pct: 100,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 5,
    minDurationMin: 15,
    maxDurationMin: 60,
    allowedSpecies: ["dog", "cat"],
  },
};

const WALK = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "tiered_per_unit", unit: "dog", tiers: [{ from: 2, pct: 50 }] },
    {
      kind: "per_hour_addon",
      id: "leash_manners",
      label: "Leash manners (+$10/h)",
      cents: 1000,
      optIn: true,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "pct_surcharge",
      id: "premium",
      label: "Premium day (+20%)",
      pct: 20,
      scope: "wholeBooking",
      condition: "premiumDays",
    },
    {
      kind: "pct_discount",
      id: "recurring",
      label: "Recurring discount (-5%)",
      pct: 5,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (-15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "off_leash",
      label: "Off-leash discount (-15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "vetted_2nd_dog",
      label: "Vetted 2nd dog (-25%)",
      pct: 25,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "friends_family",
      label: "Friends & Family (−50%)",
      pct: 50,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "complimentary",
      label: "Complimentary",
      pct: 100,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const TRAINING = {
  modifiers: [
    { kind: "base_per_hour", cents: 4500 },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 150,
    },
    {
      kind: "pct_surcharge",
      id: "premium",
      label: "Premium day (+20%)",
      pct: 20,
      scope: "wholeBooking",
      condition: "premiumDays",
    },
    {
      kind: "pct_discount",
      id: "recurring",
      label: "Recurring discount (-5%)",
      pct: 5,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "puppy_training",
      label: "Puppy training (-15%)",
      pct: 15,
      condition: "anyDogUnder6mo",
    },
    {
      kind: "pct_discount",
      id: "friends_family",
      label: "Friends & Family (−50%)",
      pct: 50,
      condition: "always",
      manual: true,
    },
    {
      kind: "pct_discount",
      id: "complimentary",
      label: "Complimentary",
      pct: 100,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 5,
    minDurationMin: 30,
    maxDurationMin: 60,
    maxDogs: 1,
    allowedSpecies: ["dog"],
  },
};

/** The free introduction visit: no modifiers, so every quote comes out at 0. */
const MEET_GREET = {
  modifiers: [],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

/**
 * Each seeded config exactly as its migration writes it — unparsed, so
 * `parsePricingConfig` is what has to prove the shape.
 */
export const SEEDED_PRICING_CONFIGS_RAW: Record<PricingType, unknown> = {
  house_sitting: HOUSE_SITTING,
  check_in: CHECK_IN,
  walk: WALK,
  training: TRAINING,
  meet_greet: MEET_GREET,
};

/**
 * The same five configs, parsed once — the rate card the quote suites read. A
 * literal the engine no longer accepts throws here, at import, rather than
 * failing one assertion deep inside a suite.
 */
export const SEEDED_PRICING_CONFIGS: Record<PricingType, ServicePricingConfig> =
  {
    house_sitting: parsePricingConfig(HOUSE_SITTING),
    check_in: parsePricingConfig(CHECK_IN),
    walk: parsePricingConfig(WALK),
    training: parsePricingConfig(TRAINING),
    meet_greet: parsePricingConfig(MEET_GREET),
  };
