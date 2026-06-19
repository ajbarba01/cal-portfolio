import { describe, it, expect } from "vitest";

import { firstRelated } from "./normalize-related";

describe("firstRelated", () => {
  it("returns a to-one object as-is (the bug case: object has no index 0)", () => {
    const svc = { name: "Dog Walk", slug: "walk" };
    expect(firstRelated(svc)).toEqual(svc);
  });

  it("returns the first element of a to-many array", () => {
    expect(firstRelated([{ name: "A" }, { name: "B" }])).toEqual({ name: "A" });
  });

  it("returns null for null, undefined, or empty array", () => {
    expect(firstRelated(null)).toBeNull();
    expect(firstRelated(undefined)).toBeNull();
    expect(firstRelated([])).toBeNull();
  });
});
