import { describe, it, expect } from "vitest";
import { durationBoundsOf } from "./use-booking-scheduler";
import type { Constraints } from "@/features/pricing";

describe("durationBoundsOf", () => {
  it("converts minute bounds to hours", () => {
    const walk: Constraints = {
      intervalMin: 15,
      minDurationMin: 30,
      maxDurationMin: 180,
      allowedSpecies: ["dog"],
    };
    expect(durationBoundsOf(walk)).toEqual({ minHours: 0.5, maxHours: 3 });
  });
  it("defaults minHours to 0.25 and omits maxHours when unbounded", () => {
    const hs: Constraints = { intervalMin: 15, allowedSpecies: ["dog", "cat"] };
    expect(durationBoundsOf(hs)).toEqual({ minHours: 0.25 });
  });
});
