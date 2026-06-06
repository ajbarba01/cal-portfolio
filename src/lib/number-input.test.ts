import { describe, it, expect } from "vitest";
import { sanitizeIntInput, clampToStep } from "./number-input";

describe("sanitizeIntInput", () => {
  it("strips non-digits and leading zeros", () => {
    expect(sanitizeIntInput("03")).toBe("3");
    expect(sanitizeIntInput("0")).toBe("0");
    expect(sanitizeIntInput("01a2")).toBe("12");
    expect(sanitizeIntInput("")).toBe("");
  });
});
describe("clampToStep", () => {
  it("clamps to min/max and snaps to step", () => {
    expect(clampToStep(7, { min: 0, max: 10, step: 1 })).toBe(7);
    expect(clampToStep(-3, { min: 0, max: 10, step: 1 })).toBe(0);
    expect(clampToStep(99, { min: 0, max: 10, step: 1 })).toBe(10);
    expect(clampToStep(17, { min: 0, max: 60, step: 15 })).toBe(15);
    expect(clampToStep(23, { min: 0, max: 60, step: 15 })).toBe(30);
  });
  it("supports fractional steps", () => {
    expect(clampToStep(1.3, { min: 0.25, max: 8, step: 0.25 })).toBe(1.25);
  });
});
