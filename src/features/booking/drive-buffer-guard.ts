/**
 * Drive-time spacing guard — shared by every mutation that places a booking on
 * the calendar.
 *
 * Model A (see `drive-buffer.ts`): a round-trip visit reserves travel time on
 * both sides of its window. A candidate slot is therefore checked padded by its
 * own buffer against existing bookings padded by theirs, and must still fit an
 * open availability window once padded.
 *
 * Pure — no IO, no clock reads (ENGINEERING #5). Callers load the busy ranges,
 * windows and settings and pass them in.
 *
 * Not for resident stays: house sitting is a stay, not a round trip, so it
 * neither reserves travel time nor sits inside an intraday window. Callers skip
 * the guard for that pricing type rather than passing a zero buffer.
 */

import type { ConcurrencyClass } from "./booking-repository";
import { fitsWindow, type TimeRange } from "./availability";
import { overlapsHalfOpen } from "./calendar-model";
import {
  driveBufferMinutes,
  driveBufferMinutesFromMiles,
  type DriveBufferConfig,
} from "./drive-buffer";

/** The busy-range fields the guard reads — a structural subset of `BusyRange`. */
export interface DriveBufferBusyRange {
  /**
   * Booking id, read only to honour `excludeBookingId`. Optional because the
   * public busy-range projection does not select it yet.
   */
  id?: string;
  startsAt: Date;
  endsAt: Date;
  concurrency: ConcurrencyClass;
  clientLat: number | null;
  clientLng: number | null;
}

/** The `settings` columns the guard reads — a structural subset of the row. */
export interface DriveBufferSettings {
  origin_lat: number;
  origin_lng: number;
  road_factor: number;
  avg_speed_mph: number;
  drive_buffer_pct: number;
}

export interface DriveBufferGuardInput {
  /** Candidate occurrences, already resolved to concrete instants. */
  candidates: TimeRange[];
  /** Straight-line miles to the candidate's client; null when unknown. */
  candidateDistanceMiles: number | null;
  existing: DriveBufferBusyRange[];
  openWindows: TimeRange[];
  settings: DriveBufferSettings;
  /** Booking being edited — its own range must not block its own move. */
  excludeBookingId?: string;
}

/**
 * Returns the candidates that violate drive-time spacing, in the order given.
 * Empty means every candidate is clear.
 *
 * An unknown client location yields a zero candidate buffer rather than a
 * refusal (the booking routes to manual approval instead), but the guard still
 * runs: an existing booking's own buffer can reach into an unpadded slot.
 */
export function findDriveBufferConflicts({
  candidates,
  candidateDistanceMiles,
  existing,
  openWindows,
  settings,
  excludeBookingId,
}: DriveBufferGuardInput): TimeRange[] {
  const config: DriveBufferConfig = {
    roadFactor: settings.road_factor,
    avgSpeedMph: settings.avg_speed_mph,
    pct: settings.drive_buffer_pct,
  };
  const origin = { lat: settings.origin_lat, lng: settings.origin_lng };

  const others =
    excludeBookingId === undefined
      ? existing
      : existing.filter((e) => e.id !== excludeBookingId);

  const widened = others.map((e) => {
    const bufferMs =
      (e.concurrency === "resident"
        ? 0
        : driveBufferMinutes(
            origin,
            { lat: e.clientLat, lng: e.clientLng },
            config,
          )) * 60_000;
    return {
      startsAt: new Date(e.startsAt.getTime() - bufferMs),
      endsAt: new Date(e.endsAt.getTime() + bufferMs),
    };
  });

  const candidateMs =
    driveBufferMinutesFromMiles(candidateDistanceMiles, config) * 60_000;

  return candidates.filter((candidate) => {
    const padded = {
      startsAt: new Date(candidate.startsAt.getTime() - candidateMs),
      endsAt: new Date(candidate.endsAt.getTime() + candidateMs),
    };
    return (
      !fitsWindow(padded, openWindows) ||
      widened.some((w) => overlapsHalfOpen(padded, w))
    );
  });
}
