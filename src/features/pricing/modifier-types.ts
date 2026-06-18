export type Species =
  | "dog"
  | "cat"
  | "bird"
  | "rodent"
  | "reptile"
  | "fish"
  | "other";
export type Unit = "dog" | "cat" | "other";
export type Tier = { from: number; cents?: number; pct?: number };
export type Condition =
  | "always"
  | "noDogs"
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
      perScale?: "perDogPerDay";
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
  others?: number; // others EXCLUDES fish
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
