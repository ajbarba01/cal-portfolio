import { describe, it, expect } from "vitest";
import { parseAdjustAmountCents } from "./adjust-amount";

describe("parseAdjustAmountCents", () => {
  it("accepts a positive integer", () => {
    expect(parseAdjustAmountCents(2000)).toBe(2000);
  });
  it("rejects zero (a full clear is a waive, not an adjust)", () => {
    expect(parseAdjustAmountCents(0)).toBeNull();
  });
  it("rejects negatives, non-integers, and non-numbers", () => {
    expect(parseAdjustAmountCents(-5)).toBeNull();
    expect(parseAdjustAmountCents(12.5)).toBeNull();
    expect(parseAdjustAmountCents("2000")).toBeNull();
    expect(parseAdjustAmountCents(null)).toBeNull();
  });
});
