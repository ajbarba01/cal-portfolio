import { describe, it, expect, vi } from "vitest";
import { getPublicBusyRangesCore } from "./busy-ranges";
import type { BusyRange, ConcurrencyClass } from "./booking-repository";
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
const fakeSign = async (path: string) => `signed:${path}`;

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
      fakeSign,
      new Date(),
      null,
      origin,
      bufferCfg,
    );
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]).sort()).toEqual(["endsAt", "pets", "startsAt"]);
    // Pet entries expose only species + photoUrl — no id, name, or owner.
    expect(Object.keys(out[0].pets[0]).sort()).toEqual(["photoUrl", "species"]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/client_id|clientName|full_name|bookingId/);
  });

  it("signs pet photo paths and leaves null paths null", async () => {
    const out = await getPublicBusyRangesCore(
      fakeRepo(sample),
      fakeSign,
      new Date(),
      null,
      origin,
      bufferCfg,
    );
    expect(out[0].pets[0].photoUrl).toBe("signed:u1/p1/photo.jpg");
    expect(out[0].pets[1].photoUrl).toBeNull();
  });

  it("passes the concurrency class through to the repo", async () => {
    const spy = vi.fn();
    await getPublicBusyRangesCore(
      fakeRepo([], spy),
      fakeSign,
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
      fakeSign,
      new Date(),
      null,
      origin,
      bufferCfg,
    );

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
      fakeSign,
      new Date(),
      null,
      origin,
      bufferCfg,
    );

    expect(out.startsAt).toBe(residentRange.startsAt.toISOString());
    expect(out.endsAt).toBe(residentRange.endsAt.toISOString());
  });

  it("identity-free invariant: output keys are exactly [startsAt, endsAt, pets]", async () => {
    const ranges: BusyRange[] = [
      {
        startsAt: new Date("2025-06-10T14:00:00Z"),
        endsAt: new Date("2025-06-10T15:00:00Z"),
        concurrency: "resident",
        clientLat: 34.05,
        clientLng: -118.24,
        pets: [],
      },
      {
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
      fakeSign,
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
