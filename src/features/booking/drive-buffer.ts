/**
 * Blocking-buffer math for drive-time-aware scheduling.
 *
 * Model A (home-based round trips): every time-based booking reserves the
 * one-way drive time from Cal's origin to the client, scaled by a buffer
 * percentage, applied symmetrically before AND after the service window.
 * Pure — no IO, no clock reads (ENGINEERING #5). Coords are ZIP-centroid;
 * the percentage absorbs the coarseness.
 */
import { haversineMiles, type LatLng } from "@/lib/haversine";
import { estimateDrivingMinutes } from "@/features/pricing";

export interface DriveBufferConfig {
  roadFactor: number;
  avgSpeedMph: number;
  /** Percent of one-way drive time to reserve (e.g. 120 = 1.2x). */
  pct: number;
}

/**
 * One-way blocking buffer in WHOLE minutes. Returns 0 when the client has no
 * coordinates (degrade gracefully — the booking routes to manual approval).
 */
export function driveBufferMinutes(
  origin: LatLng,
  client: { lat: number | null; lng: number | null },
  cfg: DriveBufferConfig,
): number {
  if (client.lat === null || client.lng === null) return 0;
  const miles = haversineMiles(origin, { lat: client.lat, lng: client.lng });
  const oneWayMin = estimateDrivingMinutes(miles, {
    roadFactor: cfg.roadFactor,
    avgSpeedMph: cfg.avgSpeedMph,
  });
  return Math.round((oneWayMin * cfg.pct) / 100);
}
