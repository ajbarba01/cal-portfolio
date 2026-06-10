import { describe, it, expect } from "vitest";
import { TZDate } from "@date-fns/tz";
import { SEED_TZ, weekAnchor, slot, statusFor } from "./dates";

// weekAnchor returns a TZDate (Denver context, so `slot` can read Denver
// Y/M/D). TZDate.toISOString() emits offset notation, so assert on the
// underlying UTC instant via `new Date(...getTime())`.
describe("weekAnchor", () => {
  it("returns Monday 00:00 Denver of the containing week", () => {
    // Wed 2026-06-10 12:00 Denver → Mon 2026-06-08 00:00 Denver (06:00Z, MDT)
    const wed = new TZDate(2026, 5, 10, 12, 0, 0, SEED_TZ);
    expect(
      new Date(weekAnchor(new Date(wed.getTime())).getTime()).toISOString(),
    ).toBe("2026-06-08T06:00:00.000Z");
  });

  it("maps a Monday to itself", () => {
    const mon = new TZDate(2026, 5, 8, 9, 30, 0, SEED_TZ);
    expect(
      new Date(weekAnchor(new Date(mon.getTime())).getTime()).toISOString(),
    ).toBe("2026-06-08T06:00:00.000Z");
  });
});

describe("slot", () => {
  it("builds Denver wall-clock instants across DST", () => {
    const jan = new Date(Date.UTC(2026, 0, 5, 12)); // week of Mon Jan 5 (MST, UTC-7)
    expect(slot(weekAnchor(jan), 0, 9, 0).toISOString()).toBe(
      "2026-01-05T16:00:00.000Z",
    );
    const jul = new Date(Date.UTC(2026, 6, 8, 12)); // week of Mon Jul 6 (MDT, UTC-6)
    expect(slot(weekAnchor(jul), 0, 9, 0).toISOString()).toBe(
      "2026-07-06T15:00:00.000Z",
    );
  });

  it("offsets days and minutes", () => {
    const jun = new Date(Date.UTC(2026, 5, 10, 12));
    expect(slot(weekAnchor(jun), 4, 18, 30).toISOString()).toBe(
      "2026-06-13T00:30:00.000Z", // Fri 18:30 Denver = Sat 00:30Z
    );
  });
});

describe("statusFor", () => {
  const now = new Date("2026-06-10T18:00:00.000Z");
  it("past slots are completed", () => {
    expect(statusFor(new Date("2026-06-10T15:00:00.000Z"), now)).toBe(
      "completed",
    );
  });
  it("future slots are confirmed", () => {
    expect(statusFor(new Date("2026-06-10T19:00:00.000Z"), now)).toBe(
      "confirmed",
    );
  });
});
