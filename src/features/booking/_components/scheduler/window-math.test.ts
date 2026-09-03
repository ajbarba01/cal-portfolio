/**
 * The two window predicates the multi-day availability editor rests on.
 *
 * `intersectWindows` is what the painter draws when several days are selected —
 * the hours open on EVERY one of them, so the green bands never claim a day
 * that is not actually free. `coversSpan` is the batch-create guard: the create
 * action inserts a row per day without checking, so a day that already covers
 * the requested span has to be dropped before dispatch or Cal collects a
 * duplicate row every time she re-applies the same hours.
 */

import { describe, it, expect } from "vitest";
import {
  intersectWindows,
  coversSpan,
  boundsEdits,
  daysMissingWindow,
} from "./window-math";

describe("intersectWindows", () => {
  it("keeps the overlap of two spans", () => {
    expect(intersectWindows([[540, 1020]], [[600, 1080]])).toEqual([
      [600, 1020],
    ]);
  });

  it("returns nothing when the spans only touch", () => {
    // Adjacent is not open: [540,600) and [600,660) share no minute.
    expect(intersectWindows([[540, 600]], [[600, 660]])).toEqual([]);
  });

  it("splits an overlap across several windows on the other side", () => {
    expect(
      intersectWindows(
        [[540, 1020]],
        [
          [600, 660],
          [780, 900],
        ],
      ),
    ).toEqual([
      [600, 660],
      [780, 900],
    ]);
  });

  it("is empty when either side is empty", () => {
    expect(intersectWindows([], [[540, 600]])).toEqual([]);
    expect(intersectWindows([[540, 600]], [])).toEqual([]);
  });
});

describe("coversSpan", () => {
  it("accepts a span held by one window", () => {
    expect(
      coversSpan(
        [
          [480, 720],
          [780, 1080],
        ],
        540,
        660,
      ),
    ).toBe(true);
  });

  it("accepts a span equal to its window", () => {
    expect(coversSpan([[540, 1020]], 540, 1020)).toBe(true);
  });

  it("rejects a span that runs past the window it starts in", () => {
    expect(coversSpan([[540, 1020]], 900, 1080)).toBe(false);
  });

  it("rejects a span that two adjacent windows cover only together", () => {
    // The painter merges touching rows before calling this, so an unmerged pair
    // reaching here means the day genuinely has a gap the create should fill.
    expect(
      coversSpan(
        [
          [540, 720],
          [720, 1020],
        ],
        600,
        900,
      ),
    ).toBe(false);
  });

  it("rejects every span when the day has no windows", () => {
    expect(coversSpan([], 540, 600)).toBe(false);
  });
});

describe("boundsEdits", () => {
  it("turns a start dragged earlier into one create", () => {
    expect(boundsEdits(540, 1020, 480, 1020)).toEqual({
      creates: [[480, 540]],
      removes: [],
    });
  });

  it("turns a start dragged later into one remove", () => {
    expect(boundsEdits(540, 1020, 600, 1020)).toEqual({
      creates: [],
      removes: [[540, 600]],
    });
  });

  it("turns an end dragged later into one create", () => {
    expect(boundsEdits(540, 1020, 540, 1080)).toEqual({
      creates: [[1020, 1080]],
      removes: [],
    });
  });

  it("turns an end dragged earlier into one remove", () => {
    expect(boundsEdits(540, 1020, 540, 960)).toEqual({
      creates: [],
      removes: [[960, 1020]],
    });
  });

  it("splits a slide into the vacated remove and the entered create", () => {
    // Moving 9:00–17:00 an hour later frees 9–10 and claims 17–18.
    expect(boundsEdits(540, 1020, 600, 1080)).toEqual({
      creates: [[1020, 1080]],
      removes: [[540, 600]],
    });
  });

  it("has nothing to do when the bounds did not move", () => {
    expect(boundsEdits(540, 1020, 540, 1020)).toEqual({
      creates: [],
      removes: [],
    });
  });

  it("swaps the whole window when a block moves clear of where it was", () => {
    // 9–10 dragged to 15–16. Two edge deltas would remove 9–15 and create
    // 10–16, leaving 10–15 open — hours Cal never painted.
    expect(boundsEdits(540, 600, 900, 960)).toEqual({
      creates: [[900, 960]],
      removes: [[540, 600]],
    });
  });

  it("swaps the whole window when a block moves clear of it backwards", () => {
    expect(boundsEdits(900, 960, 540, 600)).toEqual({
      creates: [[540, 600]],
      removes: [[900, 960]],
    });
  });

  it("swaps the whole window when the new bounds only touch the old", () => {
    // Abutting is still disjoint: [540,600) and [600,660) share no minute.
    expect(boundsEdits(540, 600, 600, 660)).toEqual({
      creates: [[600, 660]],
      removes: [[540, 600]],
    });
  });
});

describe("daysMissingWindow", () => {
  // UTC midnights keep the minute arithmetic trivial; the real caller passes
  // Denver ones, which the functions under test never assume anything about.
  const midnightOf = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

  /** An availability row covering [openMinute, closeMinute) on `dayKey`. */
  function row(dayKey: string, openMinute: number, closeMinute: number) {
    const midnight = midnightOf(dayKey);
    return {
      startsAt: new Date(midnight + openMinute * 60_000),
      endsAt: new Date(midnight + closeMinute * 60_000),
    };
  }

  const dayKeys = ["2026-06-01", "2026-06-02"];

  it("keeps only the days that do not already hold the span", () => {
    expect(
      daysMissingWindow({
        windows: [row("2026-06-01", 480, 1080)],
        dayKeys,
        midnightOf,
        openMinute: 540,
        closeMinute: 1020,
      }),
    ).toEqual(["2026-06-02"]);
  });

  it("counts a span two touching rows cover together as already held", () => {
    // Rows are merged before the check, matching what the timeline draws.
    expect(
      daysMissingWindow({
        windows: [row("2026-06-01", 540, 720), row("2026-06-01", 720, 1020)],
        dayKeys: ["2026-06-01"],
        midnightOf,
        openMinute: 600,
        closeMinute: 900,
      }),
    ).toEqual([]);
  });

  it("keeps every day when none of them holds the span", () => {
    expect(
      daysMissingWindow({
        windows: [],
        dayKeys,
        midnightOf,
        openMinute: 540,
        closeMinute: 1020,
      }),
    ).toEqual(dayKeys);
  });
});
