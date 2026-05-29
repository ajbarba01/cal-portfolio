import { describe, it, expect } from "vitest";
import { haversineMiles } from "./haversine";

describe("haversineMiles", () => {
  it("returns ~24 miles from Boulder to Denver", () => {
    // Boulder, CO to Denver, CO — well-known benchmark pair
    const boulder = { lat: 40.015, lng: -105.27 };
    const denver = { lat: 39.739, lng: -104.99 };
    expect(haversineMiles(boulder, denver)).toBeCloseTo(24, 0);
  });

  it("returns 0 for identical points", () => {
    const point = { lat: 40.015, lng: -105.27 };
    expect(haversineMiles(point, point)).toBe(0);
  });
});
