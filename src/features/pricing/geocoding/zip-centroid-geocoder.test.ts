import { describe, it, expect } from "vitest";
import { ZipCentroidGeocoder } from "./zip-centroid-geocoder";
import type { LatLng } from "./geocoder";

/** Small fixture map — isolates unit tests from the real bundled dataset. */
const fixture: Record<string, LatLng> = {
  "80301": { lat: 40.0481, lng: -105.2527 }, // Boulder, CO
  "80202": { lat: 39.7532, lng: -104.9978 }, // Denver, CO
  "80903": { lat: 38.8338, lng: -104.8214 }, // Colorado Springs, CO
};

describe("ZipCentroidGeocoder", () => {
  const geocoder = new ZipCentroidGeocoder(fixture);

  it("returns centroid for a known ZIP", async () => {
    const result = await geocoder.geocode("80301");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(40.0481, 2);
    expect(result!.lng).toBeCloseTo(-105.2527, 2);
  });

  it("returns null for an unknown ZIP", async () => {
    expect(await geocoder.geocode("00000")).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await geocoder.geocode("not-a-zip")).toBeNull();
  });

  it("normalizes leading/trailing whitespace", async () => {
    const result = await geocoder.geocode("  80202  ");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(39.7532, 2);
  });

  it("normalizes ZIP+4 suffix to 5-digit base", async () => {
    const result = await geocoder.geocode("80301-1234");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(40.0481, 2);
  });

  it("returns null for an empty string", async () => {
    expect(await geocoder.geocode("")).toBeNull();
  });
});
