// evaluate.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import type {
  Condition,
  QuoteInput,
  ServicePricingConfig,
} from "../modifier-types";

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
  it("2 others alongside a dog, 1 night → +1000", () => {
    const r = evaluate(HS, { config: HS, dogs: 1, others: 2, nights: 1 });
    expect(r.finalCents).toBe(7000);
  });
  it("a stay with only other pets still gets the base night", () => {
    // 6000 base − 2500 no-dog toggle, and the single rabbit is the base pet, so
    // it is not billed a second time as an extra.
    const r = evaluate(HS, {
      config: HS,
      dogs: 0,
      cats: 0,
      others: 1,
      nights: 1,
    });
    expect(r.lines[0]?.label).toBe("House sitting base (1 night)");
    expect(r.finalCents).toBe(3500);
  });
  it("names the other unit rather than leaking its config key", () => {
    const r = evaluate(HS, { config: HS, dogs: 1, others: 2, nights: 1 });
    expect(r.lines.map((l) => l.label)).toContain("Extra small animal (2)");
  });
});

// ---------------------------------------------------------------------------
// Per-night toggles — one table over every condition the vocabulary offers
// ---------------------------------------------------------------------------

/** A config whose only toggle fires on `condition`, at 100 cents per night. */
function toggleConfig(condition: Condition): ServicePricingConfig {
  return {
    modifiers: [
      { kind: "base_per_night", cents: 1000 },
      {
        kind: "flat_per_night_toggle",
        id: "toggle",
        label: "Toggle",
        cents: 100,
        source: { kind: "condition", condition },
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
  };
}

const TOGGLE_CASES: {
  condition: Condition;
  when: string;
  input: Partial<QuoteInput>;
  expected: number;
}[] = [
  { condition: "always", when: "any booking", input: {}, expected: 100 },
  {
    condition: "noDogs",
    when: "the household has no dogs",
    input: { cats: 1 },
    expected: 100,
  },
  {
    condition: "noDogs",
    when: "a dog is staying",
    input: { dogs: 1 },
    expected: 0,
  },
  {
    condition: "catsOnly",
    when: "the household is cats and no dogs",
    input: { cats: 1 },
    expected: 100,
  },
  {
    condition: "catsOnly",
    when: "a dog is staying",
    input: { dogs: 1, cats: 1 },
    expected: 0,
  },
  {
    condition: "catsOnly",
    when: "the stay is for a bird and no cat",
    input: { others: 1 },
    expected: 0,
  },
  {
    condition: "anyDogUnder6mo",
    when: "a dog is under six months",
    input: { dogs: 1, anyDogUnder6mo: true },
    expected: 100,
  },
  {
    condition: "anyDogUnder6mo",
    when: "every dog is grown",
    input: { dogs: 1 },
    expected: 0,
  },
  {
    condition: "recurringSeries",
    when: "the booking repeats",
    input: { dogs: 1, recurringSeries: true },
    expected: 100,
  },
  {
    condition: "recurringSeries",
    when: "the booking is a one-off",
    input: { dogs: 1 },
    expected: 0,
  },
  {
    condition: "nightsOver4",
    when: "the stay runs five nights",
    input: { dogs: 1, nights: 5 },
    expected: 500,
  },
  {
    condition: "nightsOver4",
    when: "the stay runs exactly four nights",
    input: { dogs: 1, nights: 4 },
    expected: 0,
  },
  {
    condition: "nightsOver6",
    when: "the stay runs seven nights",
    input: { dogs: 1, nights: 7 },
    expected: 700,
  },
  {
    condition: "nightsOver6",
    when: "the stay runs exactly six nights",
    input: { dogs: 1, nights: 6 },
    expected: 0,
  },
];

describe("evaluate per-night toggles", () => {
  it.each(TOGGLE_CASES)(
    "$condition: charges $expected when $when",
    ({ condition, input, expected }) => {
      const config = toggleConfig(condition);
      const r = evaluate(config, { config, nights: 1, ...input });
      const line = r.lines.find((l) => l.label === "Toggle");
      expect(line?.amountCents ?? 0).toBe(expected);
    },
  );

  it("a ladder toggle counts its rungs, capped at maxTier", () => {
    const config: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 1000 },
        {
          kind: "flat_per_night_toggle",
          id: "needy",
          label: "Needy pet care",
          cents: 100,
          source: { kind: "ladder", input: "needyTier", maxTier: 2 },
        },
      ],
      constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
    };
    const at = (needyTier: QuoteInput["needyTier"]) =>
      evaluate(config, { config, dogs: 1, nights: 1, needyTier }).lines.find(
        (l) => l.label === "Needy pet care",
      )?.amountCents ?? 0;
    expect(at(0)).toBe(0);
    expect(at(1)).toBe(100);
    expect(at(4)).toBe(200); // capped at maxTier 2
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
  it("travel survives a complimentary id this config does not offer", () => {
    // Dropping the mileage is the tail of the complimentary discount, so it
    // happens only when that discount actually applied. An id left over from
    // another service would otherwise take the travel line away silently, with
    // no discount line on the receipt to explain where it went.
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      enabledManualIds: ["complimentary"],
    });
    expect(r.lines.find((l) => l.label === "Travel")?.amountCents).toBe(1000);
  });
  it("a tiered per-unit line over a part night is still whole cents", () => {
    // Nights are not required to be whole (a stay can be booked to the hour), so
    // a per-night tier rate can land on a fraction of a cent. Every line amount
    // is integer cents, so the line rounds rather than carrying the fraction
    // into the discount phases.
    const config: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 1000 },
        {
          kind: "tiered_per_unit",
          unit: "dog",
          tiers: [{ from: 2, cents: 333 }],
        },
      ],
      constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
    };
    const r = evaluate(config, { config, dogs: 2, nights: 1.5 });
    // 333 × 1.5 = 499.5
    expect(r.lines.find((l) => l.label === "Additional dog")?.amountCents).toBe(
      500,
    );
    expect(Number.isInteger(r.finalCents)).toBe(true);
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
  it("extra exercise is per-night, independent of dog count", () => {
    const CFG: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 6000 },
        {
          kind: "allowance_then_per_unit",
          unit: "exercise",
          label: "Extra exercise",
          freeUnits: 45,
          cents: 500,
        },
      ],
      constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
    };
    // 60 min/day → 1 paid 15-min block over the 45-min allowance; 2 nights.
    // 1 block × $5 × 2 nights = $10, regardless of how many dogs.
    const oneDog = evaluate(CFG, {
      config: CFG,
      dogs: 1,
      nights: 2,
      exerciseMinutesPerDay: 60,
    });
    const threeDogs = evaluate(CFG, {
      config: CFG,
      dogs: 3,
      nights: 2,
      exerciseMinutesPerDay: 60,
    });
    const exLine = (r: typeof oneDog) =>
      r.lines.find((l) => l.label === "Extra exercise")?.amountCents;
    expect(exLine(oneDog)).toBe(1000);
    expect(exLine(threeDogs)).toBe(1000);
  });
  it("housesit golden 5nt 2 dogs(1 puppy) ex60 1premiumNight 8mi → 35330", () => {
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
    expect(r.finalCents).toBe(35330);
  });
});

describe("evaluate quote line descriptions", () => {
  it("attaches a description to the premium-surcharge line", () => {
    const config: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 5000 },
        {
          kind: "pct_surcharge",
          id: "prem",
          label: "Premium night",
          pct: 25,
          scope: "perPremiumNight",
          condition: "premiumDays",
        },
      ],
      constraints: { intervalMin: 1440, allowedSpecies: ["dog"] },
    };
    const r = evaluate(config, {
      config,
      dogs: 1,
      nights: 2,
      premiumNights: 1,
    });
    const premiumLine = r.lines.find((l) => l.label === "Premium night");
    expect(premiumLine?.description).toMatch(/holiday/i);
  });

  it("attaches a description to the long-stay auto-discount line", () => {
    const config: ServicePricingConfig = {
      modifiers: [
        { kind: "base_per_night", cents: 5000 },
        {
          kind: "pct_discount",
          id: "long_a",
          label: "Long stay (-5%)",
          pct: 5,
          condition: "nightsOver4",
        },
      ],
      constraints: { intervalMin: 1440, allowedSpecies: ["dog"] },
    };
    const r = evaluate(config, { config, dogs: 1, nights: 5 });
    const discountLine = r.lines.find((l) => l.label === "Long stay (-5%)");
    expect(discountLine?.amountCents).toBeLessThan(0);
    expect(discountLine?.description).toMatch(/long stay/i);
  });
});
