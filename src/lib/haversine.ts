/** Minimal coordinate pair used by haversineMiles. Intentionally generic — no domain terms. */
export type LatLng = { lat: number; lng: number };

/** Mean radius of the Earth in miles — used for great-circle distance. */
const EARTH_RADIUS_MILES = 3958.8;

/**
 * Returns the great-circle distance in miles between two lat/lng points.
 *
 * Pure math — no IO, no domain knowledge. Accurate to within ~0.5 % for
 * distances under 3 000 miles; the haversine formula degrades gracefully
 * near the poles but this app's service area is the continental US.
 */
export function haversineMiles(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}
