/**
 * Offline ZIP-centroid geocoder backed by a bundled JSON dataset.
 *
 * Dataset: Colorado-region subset covering the service area (Boulder, Denver,
 * Colorado Springs corridor, plus surrounding Front Range and mountain ZIPs).
 * Coordinates derived from US Census ZCTA geographic centroids (public domain).
 *
 * Swap strategy: replace zip-centroids.json with a full national dataset in the
 * same schema — `{ "<zip>": { "lat": number, "lng": number } }` — and zero code
 * changes are required. The constructor accepts a map directly (dependency
 * injection) so tests can pass a small fixture without touching the file.
 *
 * Why a bundled dataset: zero ongoing cost, zero API latency, no rate limits,
 * no vendor lock-in. Geocoding accuracy is centroid-level (~1 km typical error
 * for residential ZIPs), sufficient for the haversine distance gate. Upgrade
 * path: swap ZipCentroidGeocoder for a MapboxGeocoder adapter (same Geocoder
 * interface, ENGINEERING #4) if drive-time precision is needed later.
 */

import type { Geocoder, LatLng } from "./geocoder";
import bundledData from "./zip-centroids.json";

/** The shape of each entry in the ZIP centroid JSON (excludes the _comment key). */
type CentroidMap = Record<string, LatLng>;

/** Strips the non-data _comment key from the JSON so the map stays clean. */
function loadBundledMap(): CentroidMap {
  const { _comment, ...entries } = bundledData as Record<string, unknown>;
  return entries as CentroidMap;
}

/**
 * Geocodes a US ZIP code to its centroid lat/lng using a bundled offline dataset.
 *
 * Input is normalized: leading/trailing whitespace is stripped, and the ZIP+4
 * suffix (e.g. "80301-1234") is reduced to the 5-digit base before lookup.
 * Returns null for any ZIP not present in the map — a far or unknown ZIP should
 * not block onboarding; the distance gate handles refusals at booking time.
 */
export class ZipCentroidGeocoder implements Geocoder {
  private readonly map: CentroidMap;

  /** @param map - ZIP→centroid map; defaults to the bundled Colorado dataset. */
  constructor(map: CentroidMap = loadBundledMap()) {
    this.map = map;
  }

  async geocode(zip: string): Promise<LatLng | null> {
    const normalized = zip.trim().slice(0, 5);
    if (normalized.length < 5) return null;
    return this.map[normalized] ?? null;
  }
}

/** Default instance backed by the bundled Colorado-region dataset. */
export const defaultGeocoder = new ZipCentroidGeocoder();
