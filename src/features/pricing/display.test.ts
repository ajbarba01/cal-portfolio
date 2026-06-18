/**
 * Unit tests for pricing display helpers.
 * Pure — no IO, no DB.
 */

import { describe, it, expect } from "vitest";
import { formatCents, headlineRate, pricingBreakdown } from "./display";
import type { ServicePricingConfig } from "./modifier-types";

// ---------------------------------------------------------------------------
// formatCents — unchanged contract
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formats whole dollars without decimal", () => {
    expect(formatCents(5000)).toBe("$50");
    expect(formatCents(100)).toBe("$1");
    expect(formatCents(0)).toBe("$0");
    expect(formatCents(10000)).toBe("$100");
  });

  it("formats fractional amounts with two decimals", () => {
    expect(formatCents(5050)).toBe("$50.50");
    expect(formatCents(1)).toBe("$0.01");
    expect(formatCents(99)).toBe("$0.99");
  });
});

// ---------------------------------------------------------------------------
// Seed configs
// ---------------------------------------------------------------------------

const HS: ServicePricingConfig = {
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
      kind: "tiered_per_unit",
      unit: "dog",
      tiers: [
        { from: 2, cents: 1500 },
        { from: 3, cents: 1000 },
      ],
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (−15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
  ],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

const WALK: ServicePricingConfig = {
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
      label: "Recurring discount (−5%)",
      pct: 5,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (−15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
  ],
  constraints: {
    intervalMin: 15,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const CHECK_IN: ServicePricingConfig = {
  modifiers: [{ kind: "base_per_hour", cents: 4500 }],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

const FREE: ServicePricingConfig = {
  modifiers: [],
  constraints: { intervalMin: 0, allowedSpecies: ["dog"] },
};

// ---------------------------------------------------------------------------
// headlineRate
// ---------------------------------------------------------------------------

describe("headlineRate", () => {
  it("base_per_night → 'from $X / night'", () => {
    expect(headlineRate(HS)).toBe("from $60 / night");
  });

  it("base_per_hour (walk 2500) → '$25 / hour'", () => {
    expect(headlineRate(WALK)).toBe("$25 / hour");
  });

  it("base_per_hour (check_in 4500) → '$45 / hour'", () => {
    expect(headlineRate(CHECK_IN)).toBe("$45 / hour");
  });

  it("empty modifiers → 'Free'", () => {
    expect(headlineRate(FREE)).toBe("Free");
  });
});

// ---------------------------------------------------------------------------
// pricingBreakdown
// ---------------------------------------------------------------------------

describe("pricingBreakdown — empty config", () => {
  it("returns empty array for no modifiers", () => {
    expect(pricingBreakdown(FREE)).toEqual([]);
  });
});

describe("pricingBreakdown — house sitting", () => {
  it("first row is the base rate row", () => {
    const rows = pricingBreakdown(HS);
    expect(rows[0]).toEqual({ label: "Base rate", value: "$60 / night" });
  });

  it("includes cat flat-per-unit row", () => {
    const rows = pricingBreakdown(HS);
    const catRow = rows.find((r) => r.label === "Each cat");
    expect(catRow).toBeDefined();
    expect(catRow?.value).toBe("+$8");
  });

  it("includes non-manual flat_per_night_toggle row", () => {
    const rows = pricingBreakdown(HS);
    const catOnly = rows.find((r) => r.label === "Cat-only home");
    expect(catOnly).toBeDefined();
  });

  it("excludes manual:true discount (kiche) from rows", () => {
    const rows = pricingBreakdown(HS);
    const kiche = rows.find((r) => r.label.toLowerCase().includes("kiche"));
    expect(kiche).toBeUndefined();
  });

  it("includes tiered_per_unit dog row", () => {
    const rows = pricingBreakdown(HS);
    const dogRow = rows.find((r) => r.label === "Each additional dog");
    expect(dogRow).toBeDefined();
  });
});

describe("pricingBreakdown — walk", () => {
  it("first row is base rate row (per-hour)", () => {
    const rows = pricingBreakdown(WALK);
    expect(rows[0]).toEqual({ label: "Base rate", value: "$25 / hour" });
  });

  it("includes per_hour_addon row (leash manners)", () => {
    const rows = pricingBreakdown(WALK);
    const addon = rows.find((r) => r.label === "Leash manners (+$10/h)");
    expect(addon).toBeDefined();
    expect(addon?.value).toBe("+$10 / hour");
  });

  it("includes min_floor row", () => {
    const rows = pricingBreakdown(WALK);
    const floor = rows.find((r) => r.label === "Minimum");
    expect(floor).toBeDefined();
    expect(floor?.value).toBe("$15");
  });

  it("includes pct_surcharge row", () => {
    const rows = pricingBreakdown(WALK);
    const surcharge = rows.find((r) => r.label === "Premium day (+20%)");
    expect(surcharge).toBeDefined();
    expect(surcharge?.value).toBe("+20%");
  });

  it("includes non-manual pct_discount row (recurring)", () => {
    const rows = pricingBreakdown(WALK);
    const discount = rows.find((r) => r.label === "Recurring discount (−5%)");
    expect(discount).toBeDefined();
    expect(discount?.value).toBe("−5%");
  });

  it("excludes manual:true pct_discount (kiche)", () => {
    const rows = pricingBreakdown(WALK);
    const kiche = rows.find((r) => r.label.toLowerCase().includes("kiche"));
    expect(kiche).toBeUndefined();
  });

  it("includes allowance_then_per_unit row (travel)", () => {
    const rows = pricingBreakdown(WALK);
    const travel = rows.find((r) => r.label === "Travel");
    expect(travel).toBeDefined();
    expect(travel?.value).toBe("+$2 / mile (5 free)");
  });

  it("includes tiered_per_unit row for dog", () => {
    const rows = pricingBreakdown(WALK);
    const dogTier = rows.find((r) => r.label === "Each additional dog");
    expect(dogTier).toBeDefined();
  });
});
