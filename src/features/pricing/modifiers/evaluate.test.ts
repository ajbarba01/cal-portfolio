// evaluate.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import type { ServicePricingConfig } from "../modifier-types";

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
    { kind: "flat_per_unit", unit: "other", cents: 500 },
  ],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat", "other"] },
};

describe("evaluate base + per-unit", () => {
  it("1 dog, 1 night → 6000", () => {
    expect(evaluate(HS, { config: HS, dogs: 1, nights: 1 }).finalCents).toBe(
      6000,
    );
  });
  it("2 dogs, 1 night → 7500 (base + 2nd-dog tier 1500)", () => {
    expect(evaluate(HS, { config: HS, dogs: 2, nights: 1 }).finalCents).toBe(
      7500,
    );
  });
  it("3 dogs, 1 night → 8500 (base + 1500 + 1000)", () => {
    expect(evaluate(HS, { config: HS, dogs: 3, nights: 1 }).finalCents).toBe(
      8500,
    );
  });
  it("1 dog + 1 cat, 1 night → 6800 (cat surcharged)", () => {
    expect(
      evaluate(HS, { config: HS, dogs: 1, cats: 1, nights: 1 }).finalCents,
    ).toBe(6800);
  });
  it("cat-only 2 cats, 2 nights → 8600 (6000-2500+800 ×2)", () => {
    expect(
      evaluate(HS, { config: HS, dogs: 0, cats: 2, nights: 2 }).finalCents,
    ).toBe(8600);
  });
  it("others excludes fish: 2 others, 1 night → +1000", () => {
    const r = evaluate(HS, { config: HS, dogs: 1, others: 2, nights: 1 });
    expect(r.finalCents).toBe(7000);
  });
});

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
    maxDurationMin: 180,
    allowedSpecies: ["dog"],
  },
};

describe("evaluate full pipeline (golden)", () => {
  it("walk golden → 5203", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 2,
      leashManners: true,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    expect(r.finalCents).toBe(5203);
    expect(r.lines.find((l) => l.label === "Travel")?.amountCents).toBe(600);
  });
  it("manual hidden when enabledManualIds empty → no kiche line", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 1,
      enabledManualIds: [],
    });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });
  it("travel never discounted: recurring ignores travel", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const travel = r.lines.find((l) => l.label === "Travel")!;
    expect(travel.amountCents).toBe(1000); // (10-5)*200, untouched by -5%
  });
  it("min_floor tops short visit up to 1500", () => {
    const r = evaluate(WALK, { config: WALK, hours: 0.25, dogs: 0 }); // 625 base → floor 1500
    expect(r.finalCents).toBe(1500);
  });
  it("finalCents === sum(lines)", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 2,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    expect(r.finalCents).toBe(r.lines.reduce((a, l) => a + l.amountCents, 0));
  });
  it("housesit golden 5nt 2 dogs(1 puppy) ex60 1premiumNight 8mi → 37800", () => {
    const HS2: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 6000 },
        {
          kind: "flat_per_night_toggle",
          id: "puppy_household",
          label: "Puppy household (−$10/night)",
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
        {
          kind: "allowance_then_per_unit",
          unit: "exercise",
          label: "Extra exercise",
          freeUnits: 45,
          cents: 500,
          perScale: "perDogPerDay",
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
          label: "Long stay (−5%)",
          pct: 5,
          condition: "nightsOver4",
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
    const r = evaluate(HS2, {
      config: HS2,
      dogs: 2,
      nights: 5,
      anyDogUnder6mo: true,
      exerciseMinutesPerDay: 60,
      premiumNights: 1,
      billableMiles: 8,
    });
    expect(r.finalCents).toBe(37800);
  });
});
