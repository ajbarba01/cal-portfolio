import { describe, it, expect } from "vitest";
import { stepIndex } from "./lightbox-nav";

describe("stepIndex", () => {
  it("advances within range", () => {
    expect(stepIndex(2, 1, 5)).toBe(3);
  });
  it("wraps forward past the end to the start", () => {
    expect(stepIndex(4, 1, 5)).toBe(0);
  });
  it("wraps backward past the start to the end", () => {
    expect(stepIndex(0, -1, 5)).toBe(4);
  });
  it("returns 0 for an empty set", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
