import { describe, expect, it } from "vitest";
import { manualDiscountRows } from "../../src/features/booking";
import { parsePricingConfig } from "../../src/features/pricing";
import { seedQuote } from "./quotes";

/**
 * The walk service as the migrations leave it, trimmed to what these tests
 * assert on: the hourly base, the travel allowance, and the manual discounts
 * every paid service carries. Run through the real schema, so a config shape
 * the app would reject cannot pass here either.
 */
const walkConfig = parsePricingConfig({
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
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
      id: "friends_family",
      label: "Friends & Family (−50%)",
      pct: 50,
      condition: "always",
      manual: true,
    },
  ],
  constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
});

/** The admin edit page's discount panel, fed a booking's stored quote. */
function discountRows(quoteInputs: unknown, currentFinalCents: number) {
  return manualDiscountRows({
    modifiers: walkConfig.modifiers,
    quoteInputs,
    kicheApplied: false,
    kicheWelcome: true,
    currentFinalCents,
    paidCents: 0,
  });
}

describe("seedQuote", () => {
  it("prices a booking from the service's own config", () => {
    const { breakdown } = seedQuote(walkConfig, { hours: 1, dogs: 1 });
    // Base hour only: the seeded distance is inside the free travel allowance.
    expect(breakdown.finalCents).toBe(2500);
  });

  it("writes a quote input the admin discount panel can re-price", () => {
    const { input, breakdown } = seedQuote(walkConfig, { hours: 1, dogs: 1 });

    const rows = discountRows(input, breakdown.finalCents);

    expect(rows.map((row) => row.id)).toContain("friends_family");
    expect(rows.find((row) => row.id === "friends_family")).toMatchObject({
      applied: false,
      currentFinalCents: 2500,
      toggledFinalCents: 1250,
    });
  });

  it("offers no discount at all on the empty quote input it replaces", () => {
    expect(discountRows({}, 2500)).toEqual([]);
  });
});
