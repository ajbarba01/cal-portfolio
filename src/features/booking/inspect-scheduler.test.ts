/**
 * The read-only ("inspect") scheduler data behind the admin Bookings hub.
 *
 * The module's whole promise is that EVERY day in the shown month opens, even an
 * empty one, and that a couple of months of prev/next navigation need no refetch.
 * Both of those are properties of a day-key set and a set of deliberately wide
 * rules, so the classifier the calendar actually runs is exercised here too — a
 * span or a rule that quietly narrows would otherwise only show up as days that
 * stop responding to a click.
 */

import { describe, it, expect } from "vitest";

import { buildInspectSchedulerData, inspectDayKeys } from "./inspect-scheduler";
import { denverMidnight } from "./availability";
import { deriveBookableDays } from "./calendar-model";
import type { BusyBlock } from "./scheduler-context";

/** Every day-key of `year`-`month` (1-based), in calendar order. */
function daysOfMonth(year: number, month: number): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

const JULY_START = "2026-07-01T00:00:00.000Z";

describe("inspectDayKeys", () => {
  it("covers the shown month and two months either side", () => {
    const keys = inspectDayKeys(JULY_START);

    // Two months back and one full month forward is what the hub's prev/next
    // buttons can reach before a fetch: narrowing the span turns those months
    // into un-clickable grids rather than an obvious loading state.
    for (const month of [5, 6, 7, 8]) {
      for (const key of daysOfMonth(2026, month)) {
        expect(keys.has(key)).toBe(true);
      }
    }
  });

  it("starts on the first of the month two back, not on the day given", () => {
    // The caller passes the month's own start, but a mid-month ISO must give the
    // same window — the hub re-derives it whenever the visible month changes.
    expect(inspectDayKeys("2026-07-17T09:30:00.000Z")).toEqual(
      inspectDayKeys(JULY_START),
    );
    expect([...inspectDayKeys(JULY_START)][0]).toBe("2026-05-01");
  });

  it("rolls back into the previous year for a January month", () => {
    const keys = inspectDayKeys("2026-01-01T00:00:00.000Z");

    expect([...keys][0]).toBe("2025-11-01");
    expect(keys.has("2025-12-31")).toBe(true);
    expect(keys.has("2026-01-31")).toBe(true);
  });

  it("emits 150 distinct zero-padded day-keys", () => {
    const keys = inspectDayKeys(JULY_START);

    // Distinct because the arithmetic is UTC: stepping in local time would
    // repeat or skip a day across a DST boundary, and the span crosses one.
    expect(keys.size).toBe(150);
    for (const key of keys) expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildInspectSchedulerData", () => {
  const block = (id: string, day: string): BusyBlock => ({
    id,
    startsAt: new Date(`${day}T18:00:00.000Z`),
    endsAt: new Date(`${day}T22:00:00.000Z`),
  });

  const build = (over: { dimmedDays?: Set<string> } = {}) =>
    buildInspectSchedulerData({
      blocks: [block("booking-1", "2026-07-09")],
      monthStartIso: JULY_START,
      nowIso: "2026-07-08T18:00:00.000Z",
      ...over,
    });

  it("marks every day of the shown month bookable", () => {
    expect(build().overnightNights).toEqual(inspectDayKeys(JULY_START));
  });

  it("classifies the same blocks as both intraday and whole-day busy", () => {
    const data = build();

    // The hub inspects by day, so a booking has to win the whole-day
    // classification as well as the timeline; handing `busyResident` an empty
    // list would leave booked days painted "available".
    expect(data.busy).toEqual(data.busyResident);
    expect(data.busy.map((b) => b.id)).toEqual(["booking-1"]);
  });

  it("opens the rules wide enough that no day is refused for time reasons", () => {
    // The lead time is negative on purpose: the classifier measures it from each
    // day's own Denver midnight, so zero would refuse today for the rest of the
    // day. A day of slack plus the hour a fall-back day gains covers that.
    expect(build().rules).toEqual({
      bookingOpenMinute: 0,
      bookingCloseMinute: 1440,
      minLeadTimeHours: -25,
      hardMaxAdvanceDays: 3650,
    });
  });

  it("carries the dimmed days through, and leaves them unset when absent", () => {
    const dimmed = new Set(["2026-07-09"]);

    expect(build({ dimmedDays: dimmed }).dimmedDays).toBe(dimmed);
    expect(build().dimmedDays).toBeUndefined();
    // No intraday windows: the hub inspects bookings, it does not paint hours.
    expect(build().windows).toEqual([]);
  });

  it("reads `now` from the ISO instant it is given", () => {
    expect(build().now.toISOString()).toBe("2026-07-08T18:00:00.000Z");
  });
});

describe("inspect data run through the calendar classifier", () => {
  /** Midday on the 1st, Denver — a realistic moment to be looking at the hub. */
  const NOW_ISO = "2026-07-01T18:00:00.000Z";

  function classifyJuly(nowIso: string = NOW_ISO) {
    const data = buildInspectSchedulerData({
      blocks: [
        {
          id: "booking-1",
          startsAt: new Date("2026-07-09T18:00:00.000Z"),
          endsAt: new Date("2026-07-09T22:00:00.000Z"),
        },
      ],
      monthStartIso: JULY_START,
      nowIso,
    });

    return deriveBookableDays({
      days: daysOfMonth(2026, 7).map(denverMidnight),
      overnightNights: data.overnightNights,
      busyResident: data.busyResident,
      rules: data.rules,
      now: data.now,
    });
  }

  it("leaves every day after today clickable — booked or empty", () => {
    const classified = classifyJuly();

    // "out-of-window" and "too-far" both render an inert cell. Neither may
    // appear: an empty day has to open its (empty) timeline the same way a
    // booked one opens its bookings.
    const laterDays = classified.filter((d) => d.dayKey > "2026-07-01");
    expect(new Set(laterDays.map((d) => d.state))).toEqual(
      new Set(["available", "busy"]),
    );
    expect(classified.find((d) => d.dayKey === "2026-07-09")?.bookingId).toBe(
      "booking-1",
    );
  });

  it("keeps today clickable after its own midnight has passed", () => {
    // The classifier measures lead time from each day's Denver midnight, and
    // today's has gone by by the time anyone is looking at the hub. Today's
    // bookings are the ones an admin reaches for most, so an inert cell here
    // was the gap the negative inspect lead time closes.
    expect(classifyJuly()[0]).toMatchObject({
      dayKey: "2026-07-01",
      state: "available",
    });
  });

  it("keeps today clickable at the last minute of the Denver day", () => {
    // 23:59 Denver on the 1st — the furthest `now` can get from that day's
    // midnight, and so the moment a too-small slack would fail at first.
    expect(classifyJuly("2026-07-02T05:59:00.000Z")[0]).toMatchObject({
      dayKey: "2026-07-01",
      state: "available",
    });
  });
});
