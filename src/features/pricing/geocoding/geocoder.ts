/**
 * Canonical coordinate pair used throughout the pricing pipeline.
 * Defined here — the canonical location — so feature code and lib/haversine
 * each own their own minimal LatLng shape (lib stays dependency-free per
 * ENGINEERING #2; feature code uses this type at higher layers).
 */
export type LatLng = { lat: number; lng: number };

/**
 * Vendor-agnostic geocoding interface (ENGINEERING #4).
 * App code depends on this contract, not on any specific geocoding provider.
 * Swap the underlying impl (ZIP centroids → Mapbox, etc.) with zero caller changes.
 */
export interface Geocoder {
  /**
   * Resolves a ZIP code to its geographic centroid.
   * @returns The lat/lng centroid, or null if the ZIP is unknown / unsupported.
   */
  geocode(zip: string): Promise<LatLng | null>;
}
