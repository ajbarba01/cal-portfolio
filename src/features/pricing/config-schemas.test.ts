import { describe, it, expect } from "vitest";
import { parsePricingConfig } from "./config-schemas";
import type { ServicePricingConfig } from "./modifier-types";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VALID_CONSTRAINTS = {
  intervalMin: 5,
  allowedSpecies: ["dog"] as const,
};

// ---------------------------------------------------------------------------
// Core cases from task brief (verbatim semantics)
// ---------------------------------------------------------------------------

describe("parsePricingConfig", () => {
  it("accepts a valid modifier list", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "base_per_hour", cents: 2500 }],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("base_per_hour");
  });

  it("rejects unknown kind", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [{ kind: "nope" }],
        constraints: VALID_CONSTRAINTS,
      }),
    ).toThrow();
  });

  it("rejects pct > 100", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [
          {
            kind: "pct_discount",
            id: "x",
            label: "x",
            pct: 150,
            condition: "always",
          },
        ],
        constraints: VALID_CONSTRAINTS,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cents polarity
// ---------------------------------------------------------------------------

describe("parsePricingConfig — cents polarity", () => {
  it("rejects negative cents on base_per_night (rate field)", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [{ kind: "base_per_night", cents: -100 }],
        constraints: VALID_CONSTRAINTS,
      }),
    ).toThrow();
  });

  it("accepts negative cents on flat_per_unit (discount allowed)", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [{ kind: "flat_per_unit", unit: "cat", cents: -2500 }],
        constraints: VALID_CONSTRAINTS,
      }),
    ).not.toThrow();
  });

  it("accepts negative cents on flat_per_night_toggle (discount allowed)", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [
          {
            kind: "flat_per_night_toggle",
            id: "cat_only",
            label: "Cat only",
            cents: -2500,
            source: { kind: "condition", condition: "noDogs" },
          },
        ],
        constraints: VALID_CONSTRAINTS,
      }),
    ).not.toThrow();
  });

  it("rejects negative cents on min_floor (rate field)", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [{ kind: "min_floor", cents: -50 }],
        constraints: VALID_CONSTRAINTS,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Constraints validation
// ---------------------------------------------------------------------------

describe("parsePricingConfig — constraints", () => {
  it("rejects intervalMin = 0 (must be positive)", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: { intervalMin: 0, allowedSpecies: ["dog"] },
      }),
    ).toThrow();
  });

  it("rejects empty allowedSpecies array", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: { intervalMin: 5, allowedSpecies: [] },
      }),
    ).toThrow();
  });

  it("rejects unknown species", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: { intervalMin: 5, allowedSpecies: ["unicorn"] },
      }),
    ).toThrow();
  });

  it("accepts optional constraint fields", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: {
          intervalMin: 15,
          allowedSpecies: ["dog", "cat"],
          maxDogs: 3,
          softDistanceWarnMiles: 5,
        },
      }),
    ).not.toThrow();
  });

  it("rejects minDurationMin greater than maxDurationMin", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: {
          intervalMin: 15,
          minDurationMin: 180,
          maxDurationMin: 30,
          allowedSpecies: ["dog"],
        },
      }),
    ).toThrow();
  });

  it("rejects maxDogs = 0", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: {
          intervalMin: 15,
          maxDogs: 0,
          allowedSpecies: ["dog"],
        },
      }),
    ).toThrow();
  });

  it("accepts minDurationMin equal to maxDurationMin", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [],
        constraints: {
          intervalMin: 15,
          minDurationMin: 60,
          maxDurationMin: 60,
          allowedSpecies: ["dog"],
        },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Each modifier variant round-trips
// ---------------------------------------------------------------------------

describe("parsePricingConfig — modifier variants", () => {
  it("base_per_night", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "base_per_night", cents: 5000 }],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("base_per_night");
  });

  it("tiered_per_unit", () => {
    const cfg = parsePricingConfig({
      modifiers: [
        {
          kind: "tiered_per_unit",
          unit: "dog",
          tiers: [
            { from: 1, cents: 5000 },
            { from: 2, cents: 4500 },
          ],
        },
      ],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("tiered_per_unit");
  });

  it("per_hour_addon", () => {
    const cfg = parsePricingConfig({
      modifiers: [
        {
          kind: "per_hour_addon",
          id: "extra_walk",
          label: "Extra walk",
          cents: 1500,
          optIn: true,
        },
      ],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("per_hour_addon");
  });

  it("allowance_then_per_unit", () => {
    const cfg = parsePricingConfig({
      modifiers: [
        {
          kind: "allowance_then_per_unit",
          unit: "mile",
          label: "Mileage",
          freeUnits: 5,
          cents: 100,
        },
      ],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("allowance_then_per_unit");
  });

  it("pct_surcharge", () => {
    const cfg = parsePricingConfig({
      modifiers: [
        {
          kind: "pct_surcharge",
          id: "holiday",
          label: "Holiday",
          pct: 20,
          scope: "perPremiumNight",
          condition: "premiumDays",
        },
      ],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("pct_surcharge");
  });

  it("min_floor", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "min_floor", cents: 2000 }],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("min_floor");
  });

  it("flat_per_night_toggle with ladder source", () => {
    const cfg = parsePricingConfig({
      modifiers: [
        {
          kind: "flat_per_night_toggle",
          id: "needy",
          label: "Needy pet",
          cents: 1000,
          source: { kind: "ladder", input: "needyTier", maxTier: 4 },
          manual: false,
        },
      ],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0].kind).toBe("flat_per_night_toggle");
  });
});

// ---------------------------------------------------------------------------
// Seed round-trip tests — each seeded JSON literal must parse without throwing
// and must have the expected modifier count / key fields.
// These are the primary gate for Task 8 (migrate pricing_config to modifier lists).
// ---------------------------------------------------------------------------

const HOUSE_SITTING_SEED: unknown = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home",
      cents: -2500,
      source: { kind: "condition", condition: "noDogs" },
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

const CHECK_IN_SEED: unknown = {
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
  ],
  constraints: {
    intervalMin: 5,
    minDurationMin: 15,
    maxDurationMin: 60,
    allowedSpecies: ["dog"],
  },
};

const WALK_SEED: unknown = {
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
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const TRAINING_SEED: unknown = {
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
  ],
  constraints: {
    intervalMin: 5,
    minDurationMin: 30,
    maxDurationMin: 60,
    maxDogs: 1,
    allowedSpecies: ["dog"],
  },
};

const MEET_GREET_SEED: unknown = {
  modifiers: [],
  constraints: {
    intervalMin: 15,
    allowedSpecies: ["dog", "cat"],
  },
};

describe("parsePricingConfig — seeded JSON round-trips", () => {
  it("house_sitting: parses without throw, 13 modifiers, base_per_night first", () => {
    const cfg = parsePricingConfig(HOUSE_SITTING_SEED) as ServicePricingConfig;
    expect(cfg.modifiers.length).toBe(13);
    expect(cfg.modifiers[0].kind).toBe("base_per_night");
    expect(cfg.constraints.intervalMin).toBe(15);
    expect(cfg.constraints.softDistanceWarnMiles).toBe(15);
    expect(cfg.constraints.allowedSpecies).toContain("bird");
  });

  it("check_in: parses without throw, 5 modifiers, base_per_hour first", () => {
    const cfg = parsePricingConfig(CHECK_IN_SEED) as ServicePricingConfig;
    expect(cfg.modifiers.length).toBe(5);
    expect(cfg.modifiers[0].kind).toBe("base_per_hour");
    expect(cfg.constraints.minDurationMin).toBe(15);
    expect(cfg.constraints.maxDurationMin).toBe(60);
  });

  it("walk: parses without throw, 10 modifiers, base_per_hour first", () => {
    const cfg = parsePricingConfig(WALK_SEED) as ServicePricingConfig;
    expect(cfg.modifiers.length).toBe(10);
    expect(cfg.modifiers[0].kind).toBe("base_per_hour");
    expect(cfg.constraints.maxDogs).toBe(2);
    expect(cfg.constraints.minDurationMin).toBe(30);
  });

  it("training: parses without throw, 6 modifiers, base_per_hour first", () => {
    const cfg = parsePricingConfig(TRAINING_SEED) as ServicePricingConfig;
    expect(cfg.modifiers.length).toBe(6);
    expect(cfg.modifiers[0].kind).toBe("base_per_hour");
    expect(cfg.constraints.maxDogs).toBe(1);
  });

  it("meet_greet: parses without throw, 0 modifiers", () => {
    const cfg = parsePricingConfig(MEET_GREET_SEED) as ServicePricingConfig;
    expect(cfg.modifiers.length).toBe(0);
    expect(cfg.constraints.intervalMin).toBe(15);
    expect(cfg.constraints.allowedSpecies).toContain("cat");
  });
});
