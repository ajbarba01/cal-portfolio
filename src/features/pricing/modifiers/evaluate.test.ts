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
