/**
 * Pure helpers for converting a typed pricing_config into ordered UI fields
 * and back again. No IO, no React — safe to import in tests and server code.
 */

import type {
  PricingType,
  WalkConfig,
  HouseSittingConfig,
  CheckInConfig,
  TrainingConfig,
  MeetGreetConfig,
} from "@/features/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Discriminates how a numeric config value should be presented in the UI. */
export type FieldKind = "cents" | "pct" | "int";

/** One editable field derived from a pricing config. */
export interface PricingField {
  key: string;
  label: string;
  kind: FieldKind;
  value: number;
}

// ---------------------------------------------------------------------------
// Internal — per-type ordered field specs
// ---------------------------------------------------------------------------

interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
}

const WALK_FIELDS: FieldSpec[] = [
  { key: "rate_cents_per_hour", label: "Rate per hour", kind: "cents" },
  { key: "per_dog_cents", label: "Each additional dog", kind: "cents" },
  { key: "kiche_discount_pct", label: "Kiche discount", kind: "pct" },
];

const HOUSE_SITTING_FIELDS: FieldSpec[] = [
  {
    key: "base_dog_cents_per_night",
    label: "Base rate — dog (per night)",
    kind: "cents",
  },
  {
    key: "base_cat_cents_per_night",
    label: "Base rate — cat (per night)",
    kind: "cents",
  },
  {
    key: "extra_dog_cents_per_night",
    label: "Extra dog (per night)",
    kind: "cents",
  },
  {
    key: "extra_cat_cents_per_night",
    label: "Extra cat (per night)",
    kind: "cents",
  },
  {
    key: "cant_be_left_alone_cents_per_day",
    label: "Can't-be-left-alone add-on (per day)",
    kind: "cents",
  },
  {
    key: "extra_walk_15min_cents_per_day",
    label: "Extra walk — 15 min block (per day)",
    kind: "cents",
  },
  {
    key: "holiday_cents_per_day",
    label: "Premium-day add-on (per day)",
    kind: "cents",
  },
  { key: "kiche_discount_pct", label: "Kiche discount", kind: "pct" },
];

const CHECK_IN_FIELDS: FieldSpec[] = [
  { key: "rate_cents_per_hour", label: "Rate per hour", kind: "cents" },
  { key: "minimum_cents", label: "Minimum charge", kind: "cents" },
];

const TRAINING_FIELDS: FieldSpec[] = [
  { key: "rate_cents_per_hour", label: "Rate per hour", kind: "cents" },
];

/** Lookup of known field specs by pricing type. */
const FIELD_SPECS: Record<PricingType, FieldSpec[]> = {
  walk: WALK_FIELDS,
  house_sitting: HOUSE_SITTING_FIELDS,
  check_in: CHECK_IN_FIELDS,
  training: TRAINING_FIELDS,
  meet_greet: [],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type AnyConfig =
  | WalkConfig
  | HouseSittingConfig
  | CheckInConfig
  | TrainingConfig
  | MeetGreetConfig;

/**
 * Derives an ordered list of editable UI fields from a pricing config.
 * `meet_greet` returns an empty array (no priced fields).
 */
export function pricingFields(
  pricingType: PricingType,
  config: AnyConfig,
): PricingField[] {
  const specs = FIELD_SPECS[pricingType];
  const raw = config as Record<string, unknown>;

  return specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    value: typeof raw[spec.key] === "number" ? (raw[spec.key] as number) : 0,
  }));
}

/**
 * Rebuilds a pricing config object from edited fields.
 *
 * Unknown keys present in `originalConfig` (outside the per-type schema) are
 * passed through untouched so unexpected future keys are never dropped.
 */
export function fieldsToConfig(
  pricingType: PricingType,
  fields: PricingField[],
  originalConfig: AnyConfig,
): AnyConfig {
  // Start from the original so unknown keys pass through.
  const result: Record<string, unknown> = {
    ...(originalConfig as Record<string, unknown>),
  };

  // Overwrite with the edited field values (all numeric; cents/int stay as
  // integer, pct is already an integer in the field).
  for (const field of fields) {
    result[field.key] = Math.round(field.value);
  }

  return result as AnyConfig;
}
