import { describe, it, expect, vi } from "vitest";
import { getPublicBusyRangesCore } from "./busy-ranges";
import type { BusyRange, ConcurrencyClass } from "./booking-repository";

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

describe("getPublicBusyRangesCore", () => {
  const sample: BusyRange[] = [
    {
      startsAt: new Date("2025-06-10T15:00:00Z"),
      endsAt: new Date("2025-06-10T16:00:00Z"),
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
    );
    expect(spy).toHaveBeenCalledWith("resident");
  });
});
