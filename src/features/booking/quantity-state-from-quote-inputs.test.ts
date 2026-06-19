import { describe, it, expect } from "vitest";
import { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";
import { quantitiesToRecord } from "@/features/booking/_components/quantity-forms";

describe("quantityStateFromQuoteInputs", () => {
  it("round-trips house_sitting add-ons (nights and holidayDays ignored — server-derived)", () => {
    // holidayDays is no longer user-supplied; the form state only carries
    // cantBeLeftAloneDays + walkMinutesPerDay + maxHoursAway. The stored record may
    // contain a legacy holidayDays field but quantityStateFromQuoteInputs no longer
    // reads it (the server will recompute from dates on the next re-quote).
    const state = {
      type: "house_sitting" as const,
      qty: { cantBeLeftAloneDays: 2, walkMinutesPerDay: 30, maxHoursAway: 8 },
    };
    const record = quantitiesToRecord(state, 4);
    expect(quantityStateFromQuoteInputs("house_sitting", record)).toEqual(
      state,
    );
  });

  it("defaults missing house_sitting add-ons to 0 / 8", () => {
    expect(
      quantityStateFromQuoteInputs("house_sitting", { nights: 3 }),
    ).toEqual({
      type: "house_sitting",
      qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, maxHoursAway: 8 },
    });
  });

  it("round-trips hours-based services", () => {
    for (const type of ["check_in", "training"] as const) {
      const state = { type, qty: { hours: 2 } };
      const record = quantitiesToRecord(state, null);
      expect(quantityStateFromQuoteInputs(type, record)).toEqual(state);
    }
    // walk includes leashManners
    const walkState = {
      type: "walk" as const,
      qty: { hours: 2, leashManners: false },
    };
    const record = quantitiesToRecord(walkState, null);
    expect(quantityStateFromQuoteInputs("walk", record)).toEqual(walkState);
  });

  it("defaults hours to 1 and leashManners to false when absent", () => {
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
