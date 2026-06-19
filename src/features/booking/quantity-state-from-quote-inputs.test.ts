import { describe, it, expect } from "vitest";
import { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";
import { quantitiesToRecord } from "@/features/booking/_components/quantity-forms";

describe("quantityStateFromQuoteInputs", () => {
  it("round-trips house_sitting add-ons including maxHoursAway", () => {
    const state = {
      type: "house_sitting" as const,
      qty: { walkMinutesPerDay: 30, maxHoursAway: 5 },
    };
    const record = quantitiesToRecord(state, 4);
    expect(quantityStateFromQuoteInputs("house_sitting", record)).toEqual(
      state,
    );
  });

  it("reconstructs maxHoursAway from a stored needyTier (price-exact bucket)", () => {
    // Stored QuoteInput shape: carries needyTier, not the raw hours.
    expect(
      quantityStateFromQuoteInputs("house_sitting", {
        nights: 3,
        needyTier: 3,
      }),
    ).toEqual({
      type: "house_sitting",
      qty: { walkMinutesPerDay: 0, maxHoursAway: 3 },
    });
  });

  it("defaults missing house_sitting add-ons (maxHoursAway → 8 = no surcharge)", () => {
    expect(
      quantityStateFromQuoteInputs("house_sitting", { nights: 3 }),
    ).toEqual({
      type: "house_sitting",
      qty: { walkMinutesPerDay: 0, maxHoursAway: 8 },
    });
  });

  it("round-trips walk leashManners", () => {
    const state = {
      type: "walk" as const,
      qty: { hours: 2, leashManners: true },
    };
    const record = quantitiesToRecord(state, null);
    expect(quantityStateFromQuoteInputs("walk", record)).toEqual(state);
  });

  it("round-trips check_in / training hours", () => {
    for (const type of ["check_in", "training"] as const) {
      const state = { type, qty: { hours: 2 } };
      const record = quantitiesToRecord(state, null);
      expect(quantityStateFromQuoteInputs(type, record)).toEqual(state);
    }
  });

  it("defaults walk hours to 1 and leashManners to false when absent", () => {
    expect(quantityStateFromQuoteInputs("walk", {})).toEqual({
      type: "walk",
      qty: { hours: 1, leashManners: false },
    });
  });

  it("maps meet_greet to the empty quantity state", () => {
    expect(quantityStateFromQuoteInputs("meet_greet", {})).toEqual({
      type: "meet_greet",
      qty: {},
    });
  });
});
