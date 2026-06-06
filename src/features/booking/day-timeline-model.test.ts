import { describe, it, expect } from "vitest";
import { startOptions, blockSpan } from "./day-timeline-model";

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
});
describe("blockSpan", () => {
  it("returns start/end minutes for a chosen start + duration", () => {
    expect(blockSpan(540, 75)).toEqual({ startMin: 540, endMin: 615 });
  });
});
