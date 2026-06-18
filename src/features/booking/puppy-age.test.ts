import { describe, it, expect } from "vitest";
import { isUnderSixMonths } from "./puppy-age";

describe("isUnderSixMonths", () => {
  const asOf = new Date("2026-06-18T12:00:00Z");

  it("is false for missing / unparseable birthdates", () => {
    expect(isUnderSixMonths(null, asOf)).toBe(false);
    expect(isUnderSixMonths(undefined, asOf)).toBe(false);
    expect(isUnderSixMonths("", asOf)).toBe(false);
    expect(isUnderSixMonths("not-a-date", asOf)).toBe(false);
  });

  it("is true for a dog born under 6 months before asOf", () => {
    expect(isUnderSixMonths("2026-02-01", asOf)).toBe(true); // ~4.5 months
  });

  it("is false for a dog 6+ months old", () => {
    expect(isUnderSixMonths("2025-12-18", asOf)).toBe(false); // exactly 6 months → no longer under
    expect(isUnderSixMonths("2025-06-18", asOf)).toBe(false); // 1 year
  });

  it("is true the day before the 6-month mark and false on it", () => {
    expect(isUnderSixMonths("2025-12-19", asOf)).toBe(true); // mark is 2026-06-19 > asOf
    expect(isUnderSixMonths("2025-12-18", asOf)).toBe(false); // mark is 2026-06-18, not < asOf
  });
});
