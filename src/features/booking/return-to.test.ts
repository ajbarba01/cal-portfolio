import { describe, it, expect } from "vitest";
import { buildReturnTo, safeReturnTo } from "./return-to";

describe("buildReturnTo", () => {
  it("puts the slug in the path and instants + pets in the query", () => {
    const r = buildReturnTo({
      serviceSlug: "dog-walk",
      start: "2026-07-01T16:00:00.000Z",
      end: "2026-07-01T17:00:00.000Z",
      petIds: ["a", "b"],
    });
    expect(r).toBe(
      "/book/dog-walk?start=2026-07-01T16%3A00%3A00.000Z&end=2026-07-01T17%3A00%3A00.000Z&pets=a%2Cb",
    );
  });

  it("omits absent fields", () => {
    expect(buildReturnTo({ serviceSlug: "house-sitting" })).toBe(
      "/book/house-sitting",
    );
  });
});

describe("safeReturnTo (open-redirect guard)", () => {
  it("accepts a relative path under /book/", () => {
    expect(safeReturnTo("/book/dog-walk?start=x")).toBe(
      "/book/dog-walk?start=x",
    );
  });

  it("rejects null / empty", () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo("")).toBeNull();
  });

  it("rejects other in-app paths", () => {
    expect(safeReturnTo("/account")).toBeNull();
    expect(safeReturnTo("/login")).toBeNull();
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeReturnTo("//evil.com")).toBeNull();
    expect(safeReturnTo("https://evil.com")).toBeNull();
    expect(safeReturnTo("/book/\\evil.com")).toBeNull();
  });
});
