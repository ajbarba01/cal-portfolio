import type { PetSpecies } from "@/features/pets";

/** Species is a pet-domain concept; the canonical list lives in features/pets. */
export type Species = PetSpecies;

export type Unit = "dog" | "cat" | "other";

/**
 * Id of the manual discount that makes a booking free end to end.
 *
 * Travel is the last quote phase and is never discounted, so even a 100%
 * discount leaves the mileage line standing. The engine therefore drops the
 * travel line outright when this discount is enabled (DECISIONS 4). The id is
 * named here rather than derived from the config because it is the one modifier
 * whose meaning the engine itself has to know.
 */
export const COMPLIMENTARY_MODIFIER_ID = "complimentary";
export type Tier = { from: number; cents?: number; pct?: number };
export type Condition =
  | "always"
  | "noDogs"
  | "catsOnly"
  | "anyDogUnder6mo"
  | "recurringSeries"
  | "nightsOver4"
  | "nightsOver6";

export type Modifier =
  | { kind: "base_per_night"; cents: number }
  | { kind: "base_per_hour"; cents: number }
  | { kind: "flat_per_unit"; unit: Unit; cents: number }
  | { kind: "tiered_per_unit"; unit: Unit; tiers: Tier[] }
  | {
      kind: "flat_per_night_toggle";
      id: string;
      label: string;
      cents: number;
      source:
        | { kind: "condition"; condition: Condition }
        | { kind: "ladder"; input: "needyTier"; maxTier: number };
      manual?: boolean;
    }
  | {
      kind: "per_hour_addon";
      id: string;
      label: string;
      cents: number;
      optIn: true;
    }
  | {
      kind: "allowance_then_per_unit";
      unit: "mile" | "exercise";
      label: string;
      freeUnits: number;
      cents: number;
    }
  | {
      kind: "pct_surcharge";
      id: string;
      label: string;
      pct: number;
      scope: "wholeBooking" | "perPremiumNight";
      condition: "premiumDays";
    }
  | {
      kind: "pct_discount";
      id: string;
      label: string;
      pct: number;
      condition: Condition;
      manual?: boolean;
    }
  | { kind: "min_floor"; cents: number };

export interface Constraints {
  intervalMin: number;
  minDurationMin?: number;
  maxDurationMin?: number;
  maxDogs?: number;
  allowedSpecies: Species[];
  softDistanceWarnMiles?: number;
}

export interface ServicePricingConfig {
  modifiers: Modifier[];
  constraints: Constraints;
}

export interface CustomAdjustment {
  label: string;
  amountCents?: number;
  pct?: number;
}

export interface QuoteInput {
  config: ServicePricingConfig;
  dogs?: number;
  cats?: number;
  others?: number; // every pet that is neither a dog nor a cat
  nights?: number;
  hours?: number;
  premiumNights?: number;
  needyTier?: 0 | 1 | 2 | 3 | 4;
  exerciseMinutesPerDay?: number;
  billableMiles?: number; // road-adjusted miles (engine subtracts freeUnits)
  anyDogUnder6mo?: boolean;
  leashManners?: boolean;
  recurringSeries?: boolean;
  enabledManualIds?: string[];
  customAdjustments?: CustomAdjustment[];
}
