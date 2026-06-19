import { describe, it, expect } from "vitest";
import {
  needyTierFromHoursAway,
  representativeHoursFromNeedyTier,
} from "./needy-tier";

describe("needyTierFromHoursAway", () => {
  it("maps hours to tier at the bucket boundaries", () => {
    expect(needyTierFromHoursAway(undefined)).toBe(0);
    expect(needyTierFromHoursAway(8)).toBe(0);
    expect(needyTierFromHoursAway(10)).toBe(0);
    expect(needyTierFromHoursAway(7.99)).toBe(1);
    expect(needyTierFromHoursAway(6)).toBe(1);
    expect(needyTierFromHoursAway(5.99)).toBe(2);
    expect(needyTierFromHoursAway(4)).toBe(2);
    expect(needyTierFromHoursAway(3.99)).toBe(3);
    expect(needyTierFromHoursAway(2)).toBe(3);
    expect(needyTierFromHoursAway(1.99)).toBe(4);
    expect(needyTierFromHoursAway(0)).toBe(4);
  });
});

describe("representativeHoursFromNeedyTier", () => {
  it("returns a value inside each tier's bucket (price-exact round-trip)", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      const hours = representativeHoursFromNeedyTier(tier);
      expect(needyTierFromHoursAway(hours)).toBe(tier);
    }
  });

  it("treats unknown tiers as no surcharge (tier 0)", () => {
    expect(representativeHoursFromNeedyTier(99)).toBe(8);
    expect(needyTierFromHoursAway(representativeHoursFromNeedyTier(99))).toBe(
      0,
    );
  });
});
