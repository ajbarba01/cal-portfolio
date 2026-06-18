import { describe, it, expect } from "vitest";
import { parsePricingConfig } from "./config-schemas";

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
