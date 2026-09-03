import { describe, it, expect } from "vitest";
import { safeReturnTo } from "@/lib/return-to";
import { buildReturnTo } from "./return-to";

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

  // Round-trip: buildReturnTo emits ISO timestamps whose colons must survive
  // safeReturnTo — the deferred-auth booking flow depends on this.
  it("emits a path the open-redirect guard passes through verbatim", () => {
    const built = buildReturnTo({
      serviceSlug: "walk",
      start: "2026-07-01T16:00:00.000Z",
      end: "2026-07-01T17:00:00.000Z",
      petIds: ["a", "b"],
    });
    // Sanity-check the shape (URLSearchParams %-encodes colons in values)
    expect(built).toMatch(/^\/book\/walk\?/);
    expect(safeReturnTo(built)).toBe(built);
  });
});
