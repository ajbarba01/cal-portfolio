import { describe, it, expect } from "vitest";
import { driveBufferMinutes } from "./drive-buffer";

const cfg = { roadFactor: 1.3, avgSpeedMph: 30, pct: 120 };
const origin = { lat: 40.0, lng: -105.0 };

describe("driveBufferMinutes", () => {
  it("returns 0 when client coords are missing", () => {
    expect(driveBufferMinutes(origin, { lat: null, lng: null }, cfg)).toBe(0);
  });

  it("scales one-way drive minutes by the buffer percentage", () => {
    // Same point → 0 miles → 0 minutes → 0 buffer.
    expect(driveBufferMinutes(origin, { lat: 40.0, lng: -105.0 }, cfg)).toBe(0);
  });

  it("is positive and rounded to whole minutes for a distant client", () => {
    const buf = driveBufferMinutes(origin, { lat: 40.2, lng: -105.0 }, cfg);
    expect(buf).toBeGreaterThan(0);
    expect(Number.isInteger(buf)).toBe(true);
  });

  it("a higher percentage yields a larger buffer", () => {
    const a = driveBufferMinutes(
      origin,
      { lat: 40.2, lng: -105.0 },
      { ...cfg, pct: 100 },
    );
    const b = driveBufferMinutes(
      origin,
      { lat: 40.2, lng: -105.0 },
      { ...cfg, pct: 200 },
    );
    expect(b).toBeGreaterThan(a);
  });
});
