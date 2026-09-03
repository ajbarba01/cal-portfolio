import { describe, it, expect } from "vitest";
import {
  findDriveBufferConflicts,
  type DriveBufferBusyRange,
  type DriveBufferGuardInput,
  type DriveBufferSettings,
} from "./drive-buffer-guard";

/**
 * Characterizes the guard exactly as booking creation has always applied it:
 * the candidate is padded by its own drive buffer, every existing exclusive
 * booking is padded by its own, and a candidate conflicts when the padded range
 * escapes its open window or touches a padded booking.
 */

const ORIGIN = { lat: 40.015, lng: -105.27 };
/** ~5 miles north of the origin — 26 minutes of buffer at 200 %. */
const NEARBY = { lat: 40.087, lng: -105.27 };
const CANDIDATE_MILES = 5;

const settings: DriveBufferSettings = {
  origin_lat: ORIGIN.lat,
  origin_lng: ORIGIN.lng,
  road_factor: 1.3,
  avg_speed_mph: 30,
  drive_buffer_pct: 200,
};

const candidate = {
  startsAt: new Date("2026-06-20T17:00:00Z"),
  endsAt: new Date("2026-06-20T18:00:00Z"),
};

const wholeDay = [
  {
    startsAt: new Date("2026-06-20T00:00:00Z"),
    endsAt: new Date("2026-06-21T00:00:00Z"),
  },
];

/** An exclusive booking ending five minutes before the candidate starts. */
const justBefore: DriveBufferBusyRange = {
  startsAt: new Date("2026-06-20T16:00:00Z"),
  endsAt: new Date("2026-06-20T16:55:00Z"),
  concurrency: "exclusive",
  clientLat: NEARBY.lat,
  clientLng: NEARBY.lng,
};

function conflictsFor(overrides: Partial<DriveBufferGuardInput> = {}) {
  return findDriveBufferConflicts({
    candidates: [candidate],
    candidateDistanceMiles: CANDIDATE_MILES,
    existing: [],
    openWindows: wholeDay,
    settings,
    ...overrides,
  });
}

describe("findDriveBufferConflicts", () => {
  it("refuses a slot that sits inside another booking's drive buffer", () => {
    expect(conflictsFor({ existing: [justBefore] })).toEqual([candidate]);
  });

  it("accepts a slot with enough travel time around it", () => {
    const earlier: DriveBufferBusyRange = {
      ...justBefore,
      startsAt: new Date("2026-06-20T12:00:00Z"),
      endsAt: new Date("2026-06-20T13:00:00Z"),
    };
    expect(conflictsFor({ existing: [earlier] })).toEqual([]);
  });

  it("drops the candidate's own buffer when its location is unknown", () => {
    const noCoords: DriveBufferBusyRange = {
      ...justBefore,
      clientLat: null,
      clientLng: null,
    };
    expect(
      conflictsFor({ candidateDistanceMiles: null, existing: [noCoords] }),
    ).toEqual([]);
  });

  it("still applies an existing booking's buffer to a candidate with no location", () => {
    expect(
      conflictsFor({ candidateDistanceMiles: null, existing: [justBefore] }),
    ).toEqual([candidate]);
  });

  it("gives a resident stay no buffer of its own", () => {
    const resident: DriveBufferBusyRange = {
      ...justBefore,
      concurrency: "resident",
    };
    expect(
      conflictsFor({ candidateDistanceMiles: null, existing: [resident] }),
    ).toEqual([]);
  });

  it("refuses a slot whose buffer no longer fits an open window", () => {
    expect(conflictsFor({ openWindows: [candidate] })).toEqual([candidate]);
  });

  it("ignores the excluded booking and no other", () => {
    const identified: DriveBufferBusyRange = { ...justBefore, id: "booking-1" };
    expect(
      conflictsFor({ existing: [identified], excludeBookingId: "booking-1" }),
    ).toEqual([]);
    expect(
      conflictsFor({ existing: [identified], excludeBookingId: "booking-2" }),
    ).toEqual([candidate]);
  });

  it("returns only the conflicting candidates, in the order given", () => {
    const morning = {
      startsAt: new Date("2026-06-20T08:00:00Z"),
      endsAt: new Date("2026-06-20T09:00:00Z"),
    };
    expect(
      conflictsFor({
        candidates: [morning, candidate],
        existing: [justBefore],
      }),
    ).toEqual([candidate]);
  });
});
