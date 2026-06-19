/**
 * Behavioral tests for the public `quote()` surface.
 *
 * These tests exercise quote() end-to-end via the new flat QuoteInput +
 * ServicePricingConfig shape. They cover the seven required behavioral
 * invariants and are distinct from evaluate.test.ts (which tests evaluate()
 * directly with golden numbers).
 *
 * Config constants below mirror the seed values from
 * supabase/migrations/20260529205144_seed.sql as re-expressed in the
 * modifier-engine schema.
 */

import { describe, it, expect } from "vitest";
import { quote } from "./quote";
import type { ServicePricingConfig } from "./modifier-types";

// ---------------------------------------------------------------------------
// Seed-mirroring configs
// ---------------------------------------------------------------------------

/**
 * House-sitting config.
 * Base $60/night (dog) or $45/night (cat-only via −$15 toggle).
 * Dog#1 absorbed into base; dog#2+ at $15/night each via tiered_per_unit.
 * Cat: $8/night per cat via flat_per_unit.
 * Kiche: manual 20% discount.
 * Recurring: auto 10% discount when recurringSeries.
 * Premium: +20% surcharge per premium night (perPremiumNight scope).
 * Exercise allowance: 45 min/day free; extra blocks at $5/block/day.
 * Travel: 5 free miles then $2.50/mi.
 */
const HS_CFG: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home (−$15/night)",
      cents: -1500,
      source: { kind: "condition", condition: "noDogs" },
    },
    {
      kind: "tiered_per_unit",
      unit: "dog",
      tiers: [{ from: 2, cents: 1500 }],
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
    {
      kind: "allowance_then_per_unit",
      unit: "exercise",
      label: "Extra exercise",
      freeUnits: 45,
      cents: 500,
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
      id: "recurring",
      label: "Recurring discount (−10%)",
      pct: 10,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (−20%)",
      pct: 20,
      condition: "always",
      manual: true,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 250,
    },
  ],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

/**
 * Walk config.
 * Base $25/h; dog#2 adds 50% of base per dog via tiered_per_unit pct.
 * Min floor $15.
 * Premium: +20% whole-booking surcharge.
 * Recurring: auto −5%.
 * Kiche: manual −15%.
 * Travel: 5 free miles then $2/mi.
 */
const WALK_CFG: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "tiered_per_unit", unit: "dog", tiers: [{ from: 2, pct: 50 }] },
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
  constraints: { intervalMin: 15, maxDogs: 2, allowedSpecies: ["dog"] },
};

// ---------------------------------------------------------------------------
// Behavior 1: Pet priority — dog#1 absorbed by base; cat#1 base when no dogs
// ---------------------------------------------------------------------------

describe("quote — pet priority", () => {
  it("dog#1 absorbed into base: 1 dog, 1 night → base only (6000)", () => {
    // dog#1 is the base; no extra-dog line
    const r = quote({ config: HS_CFG, dogs: 1, nights: 1 });
    expect(r.finalCents).toBe(6000);
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("additional dog")),
    ).toBe(false);
  });

  it("dog#2 adds a surcharge on top of the base", () => {
    // base 6000 + dog#2 tier 1500 = 7500 for 1 night
    const r = quote({ config: HS_CFG, dogs: 2, nights: 1 });
    expect(r.finalCents).toBe(7500);
  });

  it("cat#1 is base when no dogs: cat-only toggle reduces base by 1500", () => {
    // base 6000 − 1500 (cat-only toggle) = 4500; no cat surcharge for cat#1
    const r = quote({ config: HS_CFG, dogs: 0, cats: 1, nights: 1 });
    expect(r.finalCents).toBe(4500);
    // no extra-cat line since cat#1 is the base
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("extra cat")),
    ).toBe(false);
  });

  it("cat#2 adds a surcharge in cat-only home", () => {
    // base 6000 − 1500 + cat#2 surcharge 800 = 5300 for 1 night
    const r = quote({ config: HS_CFG, dogs: 0, cats: 2, nights: 1 });
    expect(r.finalCents).toBe(5300);
  });
});

// ---------------------------------------------------------------------------
// Behavior 2: Premium surcharge
// ---------------------------------------------------------------------------

describe("quote — premium surcharge", () => {
  it("walk: premiumNights:1 adds +20% whole-booking surcharge", () => {
    // 1h, 1 dog = 2500 base; +20% premium = 500; total 3000
    const withPremium = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      premiumNights: 1,
    });
    const withoutPremium = quote({ config: WALK_CFG, hours: 1, dogs: 1 });
    const premiumLine = withPremium.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(withPremium.finalCents).toBe(withoutPremium.finalCents + 500);
  });

  it("no premium line when premiumNights absent or zero", () => {
    const r = quote({ config: WALK_CFG, hours: 1, dogs: 1 });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("premium"))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Behavior 3: Travel appended last and never discounted
// ---------------------------------------------------------------------------

describe("quote — travel appended last, never discounted", () => {
  it("travel line appears even when recurring discount applied", () => {
    // recurring reduces the base but travel is phase-7 (post-discount)
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const travelLine = r.lines.find((l) => l.label === "Travel");
    // (10 − 5 free) × 200 = 1000, untouched by −5% recurring
    expect(travelLine?.amountCents).toBe(1000);
  });

  it("travel is the last line in the array", () => {
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const lastLine = r.lines[r.lines.length - 1];
    expect(lastLine?.label).toBe("Travel");
  });

  it("no travel line when billableMiles within free allowance", () => {
    const r = quote({ config: WALK_CFG, hours: 1, dogs: 1, billableMiles: 3 });
    expect(r.lines.some((l) => l.label === "Travel")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Behavior 4: Recurring auto-discount
// ---------------------------------------------------------------------------

describe("quote — recurring auto-discount", () => {
  it("walk: recurringSeries applies −5% discount automatically", () => {
    // 1h 1 dog = 2500 base; −5% = 125; final 2375
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      recurringSeries: true,
    });
    const discountLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("recurring"),
    );
    expect(discountLine).toBeDefined();
    expect(discountLine!.amountCents).toBe(-125);
    expect(r.finalCents).toBe(2375);
  });

  it("no recurring line when recurringSeries is false/absent", () => {
    const r = quote({ config: WALK_CFG, hours: 1, dogs: 1 });
    expect(
      r.lines.some((l) => l.label.toLowerCase().includes("recurring")),
    ).toBe(false);
  });

  it("house_sitting: recurringSeries applies −10% discount automatically", () => {
    // 1 dog 1 night = 6000; −10% = 600; final 5400
    const r = quote({
      config: HS_CFG,
      dogs: 1,
      nights: 1,
      recurringSeries: true,
    });
    const discountLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("recurring"),
    );
    expect(discountLine?.amountCents).toBe(-600);
    expect(r.finalCents).toBe(5400);
  });
});

// ---------------------------------------------------------------------------
// Behavior 5: Kiche manual discount — only when enabledManualIds includes it
// ---------------------------------------------------------------------------

describe("quote — kiche manual discount", () => {
  it("kiche discount applied only when enabledManualIds includes 'kiche'", () => {
    // walk: 1h 1 dog = 2500 base; kiche −15% = 375; final 2125
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      enabledManualIds: ["kiche"],
    });
    const kicheLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("kiche"),
    );
    expect(kicheLine).toBeDefined();
    expect(kicheLine!.amountCents).toBe(-375);
    expect(r.finalCents).toBe(2125);
  });

  it("kiche discount absent when enabledManualIds is empty", () => {
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 1,
      enabledManualIds: [],
    });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });

  it("kiche discount absent when enabledManualIds is not provided", () => {
    const r = quote({ config: WALK_CFG, hours: 1, dogs: 1 });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });

  it("house_sitting: kiche −20% applied when enabled", () => {
    // 1 dog 1 night = 6000; kiche −20% = 1200; final 4800
    const r = quote({
      config: HS_CFG,
      dogs: 1,
      nights: 1,
      enabledManualIds: ["kiche"],
    });
    const kicheLine = r.lines.find((l) =>
      l.label.toLowerCase().includes("kiche"),
    );
    expect(kicheLine?.amountCents).toBe(-1200);
    expect(r.finalCents).toBe(4800);
  });
});

// ---------------------------------------------------------------------------
// Behavior 6: Sum invariant — finalCents === Σ line amounts
// ---------------------------------------------------------------------------

describe("quote — sum invariant", () => {
  it("house_sitting with all modifiers: finalCents === sum(lines)", () => {
    const r = quote({
      config: HS_CFG,
      dogs: 2,
      cats: 1,
      nights: 3,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
      billableMiles: 10,
    });
    const summed = r.lines.reduce((acc, l) => acc + l.amountCents, 0);
    expect(r.finalCents).toBe(summed);
  });

  it("walk with all modifiers: finalCents === sum(lines)", () => {
    const r = quote({
      config: WALK_CFG,
      hours: 1,
      dogs: 2,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    const summed = r.lines.reduce((acc, l) => acc + l.amountCents, 0);
    expect(r.finalCents).toBe(summed);
  });
});

// ---------------------------------------------------------------------------
// Behavior 7: Meet_greet equivalent — config with modifiers:[] → finalCents 0
// ---------------------------------------------------------------------------

describe("quote — empty modifiers → free service", () => {
  it("config with no modifiers produces finalCents:0 and no lines", () => {
    const FREE_CFG: ServicePricingConfig = {
      modifiers: [],
      constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
    };
    const r = quote({ config: FREE_CFG });
    expect(r.finalCents).toBe(0);
    expect(r.lines).toHaveLength(0);
  });
});
