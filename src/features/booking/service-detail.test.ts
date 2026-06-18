import { describe, it, expect } from "vitest";
import { DEFAULT_CONSTRAINTS } from "./service-detail";

describe("DEFAULT_CONSTRAINTS", () => {
  it("is a permissive dog/cat fallback used when a service has no parseable config", () => {
    expect(DEFAULT_CONSTRAINTS.intervalMin).toBeGreaterThan(0);
    expect(DEFAULT_CONSTRAINTS.allowedSpecies).toEqual(["dog", "cat"]);
    expect(DEFAULT_CONSTRAINTS.maxDogs).toBeUndefined();
  });
});
