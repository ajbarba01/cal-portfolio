/**
 * Unit tests for `buildQuoteInput` — the adapter that maps validated booking
 * quantities + server-derived travel/premium inputs onto the flat modifier
 * `QuoteInput`. Pure: no DB, no clock.
 */

import { describe, it, expect } from "vitest";
import { buildQuoteInput } from "./booking-service-shared";
import type { ServicePricingConfig } from "@/features/pricing";

const HS_CONFIG: ServicePricingConfig = {
  modifiers: [{ kind: "base_per_night", cents: 6000 }],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

const WALK_CONFIG: ServicePricingConfig = {
  modifiers: [{ kind: "base_per_hour", cents: 2500 }],
  constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
};

describe("buildQuoteInput", () => {
  it("house_sitting: maps quantities, walk minutes → exerciseMinutesPerDay, and carries travel/premium", () => {
    const qi = buildQuoteInput({
      config: HS_CONFIG,
      quantities: {
        pricingType: "house_sitting",
        data: { dogs: 2, cats: 1, nights: 3, walkMinutesPerDay: 60 },
      },
      billableMiles: 6.5, // already road-adjusted by the caller
      premiumNights: 2,
      recurringSeries: true,
      applyKiche: false,
      anyDogUnder6mo: false,
    });

    expect(qi.config).toBe(HS_CONFIG);
    expect(qi.dogs).toBe(2);
    expect(qi.cats).toBe(1);
    expect(qi.nights).toBe(3);
    expect(qi.exerciseMinutesPerDay).toBe(60);
    expect(qi.billableMiles).toBe(6.5);
    expect(qi.premiumNights).toBe(2);
    expect(qi.recurringSeries).toBe(true);
    // No nights/hours leakage of obsolete fields.
    expect(qi.hours).toBeUndefined();
  });

  it("walk: maps hours/dogs and sets enabledManualIds=['kiche'] when applyKiche", () => {
    const qi = buildQuoteInput({
      config: WALK_CONFIG,
      quantities: {
        pricingType: "walk",
        data: { hours: 1, dogs: 1 },
      },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: true,
      anyDogUnder6mo: false,
    });

    expect(qi.hours).toBe(1);
    expect(qi.dogs).toBe(1);
    expect(qi.enabledManualIds).toEqual(["kiche"]);
  });

  it("enabledManualIds is empty when applyKiche is false (preview/create path)", () => {
    const qi = buildQuoteInput({
      config: WALK_CONFIG,
      quantities: {
        pricingType: "check_in",
        data: { hours: 2 },
      },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: false,
      anyDogUnder6mo: false,
    });

    expect(qi.hours).toBe(2);
    expect(qi.enabledManualIds).toEqual([]);
  });

  it("meet_greet: carries only config + travel/premium scaffolding (no quantities)", () => {
    const qi = buildQuoteInput({
      config: {
        modifiers: [],
        constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
      },
      quantities: { pricingType: "meet_greet", data: {} },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: false,
      anyDogUnder6mo: false,
    });

    expect(qi.dogs).toBeUndefined();
    expect(qi.hours).toBeUndefined();
    expect(qi.nights).toBeUndefined();
    expect(qi.enabledManualIds).toEqual([]);
  });

  it("house_sitting: derives needyTier from maxHoursAway and carries anyDogUnder6mo", () => {
    const qi = buildQuoteInput({
      config: HS_CONFIG,
      quantities: {
        pricingType: "house_sitting",
        data: { dogs: 1, cats: 0, nights: 2, maxHoursAway: 3 },
      },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: false,
      anyDogUnder6mo: true,
    });
    expect(qi.needyTier).toBe(3); // [2,4) → tier 3
    expect(qi.anyDogUnder6mo).toBe(true);
  });

  it("house_sitting: needyTier defaults to 0 when maxHoursAway is absent or >= 8", () => {
    const qi = buildQuoteInput({
      config: HS_CONFIG,
      quantities: {
        pricingType: "house_sitting",
        data: { dogs: 1, cats: 0, nights: 2 },
      },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: false,
      anyDogUnder6mo: false,
    });
    expect(qi.needyTier).toBe(0);
    expect(qi.anyDogUnder6mo).toBe(false);
  });

  it("walk: carries leashManners opt-in", () => {
    const qi = buildQuoteInput({
      config: WALK_CONFIG,
      quantities: {
        pricingType: "walk",
        data: { hours: 1, dogs: 1, leashManners: true },
      },
      billableMiles: 0,
      premiumNights: 0,
      recurringSeries: false,
      applyKiche: false,
      anyDogUnder6mo: false,
    });
    expect(qi.leashManners).toBe(true);
  });
});
