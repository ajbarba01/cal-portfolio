/**
 * Unit tests for bookingsInWindowSlice.
 *
 * The cases that matter are the multi-day stays: the predicate this replaced
 * matched on the booking's Denver start day, so a house-sit already under way
 * was invisible to the availability painter's cancel gate while the server
 * refused the same carve-out on plain instant overlap.
 */

import { describe, it, expect } from "vitest";
import { bookingsInWindowSlice } from "./window-slice";
import { denverMidnight } from "@/features/booking/availability";

/** The instant of a Denver wall-clock minute on `dayKey`. */
function at(dayKey: string, minute: number): string {
  return new Date(
    denverMidnight(dayKey).getTime() + minute * 60_000,
  ).toISOString();
}

/** The carve-out slice for [fromMinute, toMinute) of `dayKey`. */
function slice(dayKey: string, fromMinute: number, toMinute: number) {
  return {
    startsAt: new Date(at(dayKey, fromMinute)),
    endsAt: new Date(at(dayKey, toMinute)),
  };
}

const DAY = "2026-07-08";

/** A booking running from one Denver wall-clock minute to another. */
function booking(
  id: string,
  from: [string, number],
  to: [string, number],
): { id: string; startsAt: string; endsAt: string } {
  return { id, startsAt: at(...from), endsAt: at(...to) };
}

describe("bookingsInWindowSlice", () => {
  it("matches a stay that started on an earlier day and ends after the slice", () => {
    const stay = booking("started-before", ["2026-07-06", 600], [DAY, 1020]);
    expect(bookingsInWindowSlice([stay], slice(DAY, 540, 660))).toEqual([stay]);
  });

  it("matches a stay that starts on the day and ends days later", () => {
    const stay = booking("ends-after", [DAY, 480], ["2026-07-11", 600]);
    expect(bookingsInWindowSlice([stay], slice(DAY, 540, 660))).toEqual([stay]);
  });

  it("matches a stay that spans the whole day in both directions", () => {
    const stay = booking("spans-day", ["2026-07-06", 600], ["2026-07-11", 600]);
    expect(bookingsInWindowSlice([stay], slice(DAY, 540, 660))).toEqual([stay]);
  });

  it("matches a same-day walk that overlaps only part of the slice", () => {
    const walk = booking("partial", [DAY, 600], [DAY, 720]);
    expect(bookingsInWindowSlice([walk], slice(DAY, 660, 780))).toEqual([walk]);
  });

  it("excludes a same-day walk that ends exactly when the slice opens", () => {
    const walk = booking("abuts-start", [DAY, 480], [DAY, 540]);
    expect(bookingsInWindowSlice([walk], slice(DAY, 540, 660))).toEqual([]);
  });

  it("excludes a same-day walk that starts exactly when the slice closes", () => {
    const walk = booking("abuts-end", [DAY, 660], [DAY, 720]);
    expect(bookingsInWindowSlice([walk], slice(DAY, 540, 660))).toEqual([]);
  });

  it("excludes a stay that ends before the slice day", () => {
    const stay = booking("earlier", ["2026-07-05", 600], ["2026-07-06", 600]);
    expect(bookingsInWindowSlice([stay], slice(DAY, 540, 660))).toEqual([]);
  });

  it("keeps only the overlapping bookings, in input order", () => {
    const before = booking("before", [DAY, 0], [DAY, 540]);
    const overlapping = booking("overlapping", [DAY, 600], [DAY, 620]);
    const spanning = booking(
      "spanning",
      ["2026-07-07", 600],
      ["2026-07-09", 0],
    );
    const after = booking("after", [DAY, 660], [DAY, 900]);
    expect(
      bookingsInWindowSlice(
        [before, overlapping, spanning, after],
        slice(DAY, 540, 660),
      ),
    ).toEqual([overlapping, spanning]);
  });

  it("returns nothing for an empty busy list", () => {
    expect(bookingsInWindowSlice([], slice(DAY, 540, 660))).toEqual([]);
  });
});
