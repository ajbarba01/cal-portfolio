import { describe, it, expect } from "vitest";
import {
  startOptions,
  blockSpan,
  clampRangesToDayMinutes,
} from "./day-timeline-model";

const DAY = Date.UTC(2026, 6, 10, 0, 0, 0); // 2026-07-10 00:00 UTC
const at = (min: number) => new Date(DAY + min * 60_000);

// windows: minute-since-midnight ranges [openMinute, closeMinute)
describe("startOptions", () => {
  it("lists granularity-aligned starts whose duration fits inside a window", () => {
    // 9:00–11:00 (540–660), 60-min block, 30-min grid
    expect(
      startOptions({
        windows: [[540, 660]],
        durationMin: 60,
        granularityMin: 30,
      }),
    ).toEqual([540, 570, 600]); // 9:00, 9:30, 10:00 (10:00+60=11:00 fits)
  });
  it("includes a start whose block ends exactly at the window close", () => {
    // 9:00–10:15 (540–615), 60-min block, 15-min grid → 9:00 and 9:15 (ends 10:15)
    expect(
      startOptions({
        windows: [[540, 615]],
        durationMin: 60,
        granularityMin: 15,
      }),
    ).toEqual([540, 555]);
  });
  it("handles multiple windows, sorted", () => {
    expect(
      startOptions({
        windows: [
          [540, 600],
          [720, 780],
        ],
        durationMin: 30,
        granularityMin: 30,
      }),
    ).toEqual([540, 570, 720, 750]);
  });
  it("returns empty when nothing fits", () => {
    expect(
      startOptions({
        windows: [[540, 560]],
        durationMin: 60,
        granularityMin: 15,
      }),
    ).toEqual([]);
  });
  it("buffer shrinks the window on both ends", () => {
    // Window 9:00–11:00 (540–660), 60-min duration, 15-min granularity.
    // No buffer: starts 540,555,570,585,600.
    expect(
      startOptions({
        windows: [[540, 660]],
        durationMin: 60,
        granularityMin: 15,
      }),
    ).toEqual([540, 555, 570, 585, 600]);
    // 30-min buffer: earliest start 570 (540+30), latest end ≤ 660−30=630 → last start 570.
    expect(
      startOptions({
        windows: [[540, 660]],
        durationMin: 60,
        granularityMin: 15,
        bufferMin: 30,
      }),
    ).toEqual([570]);
  });
});
describe("blockSpan", () => {
  it("returns start/end minutes for a chosen start + duration", () => {
    expect(blockSpan(540, 75)).toEqual({ startMin: 540, endMin: 615 });
  });
});

describe("clampRangesToDayMinutes", () => {
  it("converts a range fully inside the day to [startMin, endMin]", () => {
    expect(
      clampRangesToDayMinutes([{ startsAt: at(540), endsAt: at(600) }], DAY),
    ).toEqual([[540, 600]]);
  });
  it("clamps a range that starts before the day to 0", () => {
    expect(
      clampRangesToDayMinutes([{ startsAt: at(-120), endsAt: at(60) }], DAY),
    ).toEqual([[0, 60]]);
  });
  it("clamps a range that ends after the day to 1440", () => {
    expect(
      clampRangesToDayMinutes([{ startsAt: at(1380), endsAt: at(1560) }], DAY),
    ).toEqual([[1380, 1440]]);
  });
  it("drops a range that does not intersect the day", () => {
    expect(
      clampRangesToDayMinutes([{ startsAt: at(1500), endsAt: at(1560) }], DAY),
    ).toEqual([]);
    // A range ending exactly at day start is half-open non-overlapping.
    expect(
      clampRangesToDayMinutes([{ startsAt: at(-60), endsAt: at(0) }], DAY),
    ).toEqual([]);
  });
  it("maps multiple ranges and preserves order", () => {
    expect(
      clampRangesToDayMinutes(
        [
          { startsAt: at(540), endsAt: at(600) },
          { startsAt: at(720), endsAt: at(780) },
        ],
        DAY,
      ),
    ).toEqual([
      [540, 600],
      [720, 780],
    ]);
  });
});
