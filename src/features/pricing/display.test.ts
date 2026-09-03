/**
 * Unit tests for pricing display helpers.
 * Pure — no IO, no DB.
 */

import { describe, it, expect, vi } from "vitest";
import {
  formatCents,
  centsToDollars,
  headlineRate,
  pricingBreakdown,
  centsToDollarsNumber,
  dollarsToCents,
} from "./display";
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
// centsToDollars — the two-decimal ledger format
// ---------------------------------------------------------------------------

describe("centsToDollars", () => {
  it("always shows two decimals, unlike formatCents", () => {
    expect(centsToDollars(5000)).toBe("$50.00");
    expect(formatCents(5000)).toBe("$50");
    expect(centsToDollars(5050)).toBe("$50.50");
    expect(centsToDollars(1)).toBe("$0.01");
  });

  it("groups thousands", () => {
    expect(centsToDollars(123456789)).toBe("$1,234,567.89");
  });

  it("puts the minus sign ahead of the currency symbol on a debit", () => {
    // A hand-rolled `$${(cents / 100).toFixed(2)}` renders "$-25.00" here,
    // which is what the debit surfaces used to show.
    expect(centsToDollars(-2500)).toBe("-$25.00");
    expect(centsToDollars(-1)).toBe("-$0.01");
  });

  it("renders zero without a sign", () => {
    expect(centsToDollars(0)).toBe("$0.00");
    // A settled balance can arrive as negative zero from `-(a - b)`.
    expect(centsToDollars(-0)).toBe("$0.00");
  });

  it("builds no Intl formatter per call", () => {
    // Ledger surfaces format a money column per row, and constructing an
    // Intl.NumberFormat costs far more than formatting with it — the formatter
    // belongs at module scope. Date.prototype.toLocaleString is spied alongside
    // the constructor because it allocates a formatter internally without
    // touching the Intl binding, so a regression written that way would
    // otherwise slip past.
    const construct = vi.spyOn(Intl, "NumberFormat");
    const viaNumber = vi.spyOn(Number.prototype, "toLocaleString");
    try {
      centsToDollars(5000);
      centsToDollars(-2500);
      centsToDollars(0);
      expect(construct).not.toHaveBeenCalled();
      expect(viaNumber).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
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

const TRAINING: ServicePricingConfig = {
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

  it("base_per_hour (training 4500) → '$45 / hour'", () => {
    expect(headlineRate(TRAINING)).toBe("$45 / hour");
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

describe("pricingBreakdown — descriptions + small-animal label", () => {
  it("labels non-dog/cat unit rows as small animal and describes cat rows", () => {
    const config: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 5000 },
        { kind: "flat_per_unit", unit: "cat", cents: 800 },
        { kind: "flat_per_unit", unit: "other", cents: 500 },
      ],
      constraints: { intervalMin: 1440, allowedSpecies: ["dog", "cat"] },
    };
    const rows = pricingBreakdown(config);
    const cat = rows.find((r) => r.label === "Each cat");
    expect(cat?.description).toMatch(/including the first/i);
    expect(rows.some((r) => r.label === "Each additional small animal")).toBe(
      true,
    );
    expect(rows.some((r) => r.label === "Each additional animal")).toBe(false);
  });
});

describe("centsToDollarsNumber", () => {
  it("converts integer cents to a dollar number", () => {
    expect(centsToDollarsNumber(1999)).toBe(19.99);
    expect(centsToDollarsNumber(2500)).toBe(25);
    expect(centsToDollarsNumber(0)).toBe(0);
    expect(centsToDollarsNumber(-2500)).toBe(-25);
  });
});

describe("dollarsToCents", () => {
  it("rounds dollar input to exact integer cents", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(25)).toBe(2500);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(dollarsToCents(-25)).toBe(-2500);
    expect(dollarsToCents(0)).toBe(0);
  });
});
