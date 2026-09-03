import { assert, describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { getPublicBusyRangesCore, type CachedPhotoUrl } from "./busy-ranges";
import {
  createSupabaseBookingRepository,
  type BusyRange,
  type ConcurrencyClass,
} from "./booking-repository";
import type { DriveBufferConfig } from "./drive-buffer";
import type { LatLng } from "@/lib/haversine";

function fakeRepo(
  ranges: BusyRange[],
  spy?: (c: ConcurrencyClass | null) => void,
) {
  return {
    async getActiveBusyRanges(
      _now: Date,
      concurrency: ConcurrencyClass | null,
    ) {
      spy?.(concurrency);
      return ranges;
    },
  };
}

// Sign by echoing a marker so we can assert the path was signed, not leaked raw.
const fakeSignPhotos = async (paths: string[]) =>
  new Map(paths.map((path) => [path, `signed:${path}`]));

/** A cache no earlier call has warmed, so everything is minted. */
const coldCache = () => new Map<string, CachedPhotoUrl>();

// Cal's origin (somewhere near Philadelphia for test purposes).
const origin: LatLng = { lat: 39.95, lng: -75.16 };

// Default buffer config — real values, will produce non-zero minutes for distant coords.
const bufferCfg: DriveBufferConfig = {
  roadFactor: 1.3,
  avgSpeedMph: 25,
  pct: 120,
};

describe("getPublicBusyRangesCore", () => {
  const sample: BusyRange[] = [
    {
      id: "busy-1",
      startsAt: new Date("2025-06-10T15:00:00Z"),
      endsAt: new Date("2025-06-10T16:00:00Z"),
      concurrency: "exclusive",
      clientLat: 39.95,
      clientLng: -75.16,
      pets: [
        { species: "dog", photoPath: "u1/p1/photo.jpg" },
        { species: "cat", photoPath: null },
      ],
    },
  ];

  it("LEAK REGRESSION: result rows carry only startsAt/endsAt/pets — no identity", async () => {
    const out = await getPublicBusyRangesCore(
      fakeRepo(sample),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      null,
      origin,
      bufferCfg,
    );
    expect(out).toHaveLength(1);
    const [range] = out;
    assert(range, "expected one busy range");
    const [pet] = range.pets;
    assert(pet, "expected the range to carry a pet");
    expect(Object.keys(range).sort()).toEqual(["endsAt", "pets", "startsAt"]);
    // Pet entries expose only species + photoUrl — no id, name, or owner.
    expect(Object.keys(pet).sort()).toEqual(["photoUrl", "species"]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/client_id|clientName|full_name|bookingId/);
  });

  it("signs pet photo paths and leaves null paths null", async () => {
    const out = await getPublicBusyRangesCore(
      fakeRepo(sample),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      null,
      origin,
      bufferCfg,
    );
    expect(out[0]?.pets[0]?.photoUrl).toBe("signed:u1/p1/photo.jpg");
    expect(out[0]?.pets[1]?.photoUrl).toBeNull();
  });

  // ── Signed-URL batching + caching ──────────────────────────────────────────

  /** A signer that remembers the batches it was handed. */
  function recordingSigner() {
    const batches: string[][] = [];
    return {
      batches,
      sign: async (paths: string[]) => {
        batches.push([...paths]);
        return new Map(paths.map((path) => [path, `signed:${path}`]));
      },
    };
  }

  /** Two bookings for the same owner, so one photo path appears twice. */
  const sharedPetRanges: BusyRange[] = [
    {
      id: "busy-1",
      startsAt: new Date("2025-06-10T15:00:00Z"),
      endsAt: new Date("2025-06-10T16:00:00Z"),
      concurrency: "resident",
      clientLat: 39.95,
      clientLng: -75.16,
      pets: [{ species: "dog", photoPath: "u1/p1/photo.jpg" }],
    },
    {
      id: "busy-2",
      startsAt: new Date("2025-06-11T15:00:00Z"),
      endsAt: new Date("2025-06-11T16:00:00Z"),
      concurrency: "resident",
      clientLat: 39.95,
      clientLng: -75.16,
      pets: [
        { species: "dog", photoPath: "u1/p1/photo.jpg" },
        { species: "cat", photoPath: "u1/p2/photo.jpg" },
      ],
    },
  ];

  it("signs every distinct path in one batch, not once per pet", async () => {
    const signer = recordingSigner();

    const out = await getPublicBusyRangesCore(
      fakeRepo(sharedPetRanges),
      signer.sign,
      coldCache(),
      new Date("2025-06-01T00:00:00Z"),
      null,
      origin,
      bufferCfg,
    );

    expect(signer.batches).toEqual([["u1/p1/photo.jpg", "u1/p2/photo.jpg"]]);
    expect(out[1]?.pets.map((p) => p.photoUrl)).toEqual([
      "signed:u1/p1/photo.jpg",
      "signed:u1/p2/photo.jpg",
    ]);
  });

  it("reuses cached URLs on the next call instead of re-signing", async () => {
    const signer = recordingSigner();
    const cache = coldCache();
    const call = (now: Date) =>
      getPublicBusyRangesCore(
        fakeRepo(sharedPetRanges),
        signer.sign,
        cache,
        now,
        null,
        origin,
        bufferCfg,
      );

    await call(new Date("2025-06-01T00:00:00Z"));
    // A poll a minute later: the URLs minted above are still good for an hour.
    const [, second] = await call(new Date("2025-06-01T00:01:00Z"));

    expect(signer.batches).toHaveLength(1);
    expect(second?.pets[0]?.photoUrl).toBe("signed:u1/p1/photo.jpg");
  });

  it("re-signs once a cached URL is spent", async () => {
    const signer = recordingSigner();
    const cache = coldCache();
    const call = (now: Date) =>
      getPublicBusyRangesCore(
        fakeRepo(sharedPetRanges),
        signer.sign,
        cache,
        now,
        null,
        origin,
        bufferCfg,
      );

    await call(new Date("2025-06-01T00:00:00Z"));
    await call(new Date("2025-06-01T02:00:00Z"));

    expect(signer.batches).toHaveLength(2);
    expect(signer.batches[1]).toEqual(["u1/p1/photo.jpg", "u1/p2/photo.jpg"]);
  });

  it("passes the concurrency class through to the repo", async () => {
    const spy = vi.fn();
    await getPublicBusyRangesCore(
      fakeRepo([], spy),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      "resident",
      origin,
      bufferCfg,
    );
    expect(spy).toHaveBeenCalledWith("resident");
  });

  // ── Drive-buffer widening tests ──────────────────────────────────────────────

  it("widens an exclusive booking by drive-time buffer on both sides", async () => {
    // Client is ~10 miles away (roughly 30 min drive at 25 mph × 1.3 road factor).
    // Exact buffer math: haversine + estimateDrivingMinutes, so we only assert direction.
    const exclusiveRange: BusyRange = {
      id: "busy-exclusive",
      startsAt: new Date("2025-06-10T14:00:00Z"),
      endsAt: new Date("2025-06-10T15:00:00Z"),
      concurrency: "exclusive",
      // ~10 miles north of origin
      clientLat: 39.95 + 0.15,
      clientLng: -75.16,
      pets: [],
    };

    const [out] = await getPublicBusyRangesCore(
      fakeRepo([exclusiveRange]),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      null,
      origin,
      bufferCfg,
    );

    assert(out, "expected one busy range");
    const rawStart = exclusiveRange.startsAt.getTime();
    const rawEnd = exclusiveRange.endsAt.getTime();

    // Widened start should be EARLIER (negative offset)
    expect(new Date(out.startsAt).getTime()).toBeLessThan(rawStart);
    // Widened end should be LATER (positive offset)
    expect(new Date(out.endsAt).getTime()).toBeGreaterThan(rawEnd);
    // Buffer must be symmetric: same number of ms subtracted from start as added to end
    const bufStart = rawStart - new Date(out.startsAt).getTime();
    const bufEnd = new Date(out.endsAt).getTime() - rawEnd;
    expect(bufStart).toBe(bufEnd);
    expect(bufStart).toBeGreaterThan(0);
  });

  it("does NOT widen a resident booking (house-sitting, Cal is on-site)", async () => {
    const residentRange: BusyRange = {
      id: "busy-resident",
      startsAt: new Date("2025-06-11T10:00:00Z"),
      endsAt: new Date("2025-06-11T18:00:00Z"),
      concurrency: "resident",
      // Distant coords — would produce a buffer for exclusive, but must be ignored here.
      clientLat: 34.05,
      clientLng: -118.24,
      pets: [],
    };

    const [out] = await getPublicBusyRangesCore(
      fakeRepo([residentRange]),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      null,
      origin,
      bufferCfg,
    );

    expect(out?.startsAt).toBe(residentRange.startsAt.toISOString());
    expect(out?.endsAt).toBe(residentRange.endsAt.toISOString());
  });

  it("identity-free invariant: output keys are exactly [startsAt, endsAt, pets]", async () => {
    const ranges: BusyRange[] = [
      {
        id: "busy-a",
        startsAt: new Date("2025-06-10T14:00:00Z"),
        endsAt: new Date("2025-06-10T15:00:00Z"),
        concurrency: "resident",
        clientLat: 34.05,
        clientLng: -118.24,
        pets: [],
      },
      {
        id: "busy-b",
        startsAt: new Date("2025-06-10T16:00:00Z"),
        endsAt: new Date("2025-06-10T17:00:00Z"),
        concurrency: "exclusive",
        clientLat: 34.05,
        clientLng: -118.24,
        pets: [],
      },
    ];

    const out = await getPublicBusyRangesCore(
      fakeRepo(ranges),
      fakeSignPhotos,
      coldCache(),
      new Date(),
      null,
      origin,
      bufferCfg,
    );

    expect(out).toHaveLength(2);
    // Both output objects must have exactly these three keys — no lat/lng/concurrency leaked.
    for (const row of out) {
      expect(Object.keys(row)).toEqual(["startsAt", "endsAt", "pets"]);
    }
  });
});

// ── Repository row parsing ───────────────────────────────────────────────────
// The busy-range row schemas live in booking-repository, but the calendars that
// crash when a row fails to parse are this module and its admin twin, so the
// species contract is pinned here alongside them.

/** A Supabase double whose one `bookings` read returns `rows`. */
const bookingsReturning = (rows: unknown[]) =>
  createFakeSupabase({ tables: { bookings: { data: rows, error: null } } });

const publicRow = (species: string) => ({
  id: "b1",
  starts_at: "2025-06-10T15:00:00Z",
  ends_at: "2025-06-10T16:00:00Z",
  concurrency: "exclusive",
  profiles: { lat: 39.95, lng: -75.16 },
  booking_pets: [{ pets: { species, photo_url: null } }],
});

const adminRow = (species: string) => ({
  id: "b1",
  starts_at: "2025-06-10T15:00:00Z",
  ends_at: "2025-06-10T16:00:00Z",
  status: "confirmed",
  client_id: "c1",
  final_cents: 5000,
  profiles: { full_name: "Client One" },
  booking_pets: [
    { pets: { id: "p1", name: "Tweety", species, photo_url: null } },
  ],
});

describe("busy-range row parsing", () => {
  it("accepts a species outside dog/cat on the public calendar", async () => {
    const repo = createSupabaseBookingRepository(
      bookingsReturning([publicRow("bird")]),
    );
    const [range] = await repo.getActiveBusyRanges(new Date(), null);
    expect(range?.pets).toEqual([{ species: "bird", photoPath: null }]);
  });

  it("accepts a species outside dog/cat on the admin calendar", async () => {
    const repo = createSupabaseBookingRepository(
      bookingsReturning([adminRow("reptile")]),
    );
    const [range] = await repo.getActiveBusyRangesEnriched(new Date());
    expect(range?.pets[0]?.species).toBe("reptile");
  });

  it("still rejects a species the app does not know", async () => {
    const repo = createSupabaseBookingRepository(
      bookingsReturning([publicRow("dragon")]),
    );
    await expect(repo.getActiveBusyRanges(new Date(), null)).rejects.toThrow(
      /unexpected DB shape/,
    );
  });
});
