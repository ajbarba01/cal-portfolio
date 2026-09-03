import { describe, it, expect } from "vitest";
import { parsePricingConfig } from "./config-schemas";
import { SPECIES_VALUES } from "@/features/pets";
import {
  SEEDED_PRICING_CONFIGS,
  SEEDED_PRICING_CONFIGS_RAW,
} from "@/test-stubs/seed-fixture";

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
    expect(cfg.modifiers[0]?.kind).toBe("base_per_hour");
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
    expect(cfg.modifiers[0]?.kind).toBe("base_per_night");
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
    expect(cfg.modifiers[0]?.kind).toBe("tiered_per_unit");
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
    expect(cfg.modifiers[0]?.kind).toBe("per_hour_addon");
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
    expect(cfg.modifiers[0]?.kind).toBe("allowance_then_per_unit");
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
    expect(cfg.modifiers[0]?.kind).toBe("pct_surcharge");
  });

  it("min_floor", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "min_floor", cents: 2000 }],
      constraints: VALID_CONSTRAINTS,
    });
    expect(cfg.modifiers[0]?.kind).toBe("min_floor");
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
    expect(cfg.modifiers[0]?.kind).toBe("flat_per_night_toggle");
  });
});

// ---------------------------------------------------------------------------
// Canonical species integration
// ---------------------------------------------------------------------------

describe("allowedSpecies accepts the full taxonomy", () => {
  it("accepts every canonical species", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "base_per_night", cents: 5000 }],
      constraints: { intervalMin: 1440, allowedSpecies: [...SPECIES_VALUES] },
    });
    expect(cfg.constraints.allowedSpecies).toEqual([...SPECIES_VALUES]);
  });
});

// ---------------------------------------------------------------------------
// Seed round-trips — every config the migrations seed must survive the parser,
// which is what stands between a rate edit and a service that cannot be quoted.
// ---------------------------------------------------------------------------

describe("parsePricingConfig — seeded configs round-trip", () => {
  it("house_sitting: 15 modifiers, base_per_night first, every species allowed", () => {
    const cfg = parsePricingConfig(SEEDED_PRICING_CONFIGS_RAW.house_sitting);
    expect(cfg.modifiers.length).toBe(15);
    expect(cfg.modifiers[0]?.kind).toBe("base_per_night");
    expect(cfg.constraints.intervalMin).toBe(15);
    expect(cfg.constraints.softDistanceWarnMiles).toBe(15);
    expect(cfg.constraints.allowedSpecies).toEqual([...SPECIES_VALUES]);
  });

  it("check_in: 7 modifiers, base_per_hour first, dogs and cats allowed", () => {
    const cfg = parsePricingConfig(SEEDED_PRICING_CONFIGS_RAW.check_in);
    expect(cfg.modifiers.length).toBe(7);
    expect(cfg.modifiers[0]?.kind).toBe("base_per_hour");
    expect(cfg.constraints.minDurationMin).toBe(15);
    expect(cfg.constraints.maxDurationMin).toBe(60);
    expect(cfg.constraints.allowedSpecies).toEqual(["dog", "cat"]);
  });

  it("walk: 12 modifiers, base_per_hour first", () => {
    const cfg = parsePricingConfig(SEEDED_PRICING_CONFIGS_RAW.walk);
    expect(cfg.modifiers.length).toBe(12);
    expect(cfg.modifiers[0]?.kind).toBe("base_per_hour");
    expect(cfg.constraints.maxDogs).toBe(2);
    expect(cfg.constraints.minDurationMin).toBe(30);
  });

  it("training: 8 modifiers, base_per_hour first", () => {
    const cfg = parsePricingConfig(SEEDED_PRICING_CONFIGS_RAW.training);
    expect(cfg.modifiers.length).toBe(8);
    expect(cfg.modifiers[0]?.kind).toBe("base_per_hour");
    expect(cfg.constraints.maxDogs).toBe(1);
  });

  it("meet_greet: no modifiers at all", () => {
    const cfg = parsePricingConfig(SEEDED_PRICING_CONFIGS_RAW.meet_greet);
    expect(cfg.modifiers.length).toBe(0);
    expect(cfg.constraints.intervalMin).toBe(15);
    expect(cfg.constraints.allowedSpecies).toContain("cat");
  });

  it("every paid service offers the two Cal-toggled manual discounts", () => {
    const paid = ["house_sitting", "check_in", "walk", "training"] as const;
    for (const type of paid) {
      const ids = SEEDED_PRICING_CONFIGS[type].modifiers.flatMap((mod) =>
        "id" in mod ? [mod.id] : [],
      );
      expect(ids).toContain("friends_family");
      expect(ids).toContain("complimentary");
    }
    const freeIds = SEEDED_PRICING_CONFIGS.meet_greet.modifiers;
    expect(freeIds).toEqual([]);
  });
});
