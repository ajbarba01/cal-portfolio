import { describe, it, expect } from "vitest";
import {
  sundayWeekStart,
  weekDays,
  isPast,
  weekOfEarliest,
  collapseRuns,
  createInitialSelectionState,
  scheduleSelectionReducer,
  mergeDraftToRanges,
} from "./schedule-selection";
import type { ScheduleSelectionState } from "./schedule-selection";

// ---------------------------------------------------------------------------
// sundayWeekStart
// ---------------------------------------------------------------------------

describe("sundayWeekStart", () => {
  it("Sunday returns itself", () => {
    // 2026-06-07 is a Sunday
    expect(sundayWeekStart("2026-06-07")).toBe("2026-06-07");
  });

  it("Monday returns previous Sunday", () => {
    // 2026-06-08 is Monday → 2026-06-07
    expect(sundayWeekStart("2026-06-08")).toBe("2026-06-07");
  });

  it("Saturday returns previous Sunday", () => {
    // 2026-06-13 is Saturday → 2026-06-07
    expect(sundayWeekStart("2026-06-13")).toBe("2026-06-07");
  });

  it("week spanning month boundary", () => {
    // 2026-05-31 is Sunday
    expect(sundayWeekStart("2026-05-31")).toBe("2026-05-31");
    // 2026-06-01 is Monday → 2026-05-31
    expect(sundayWeekStart("2026-06-01")).toBe("2026-05-31");
  });

  it("week spanning year boundary", () => {
    // 2026-01-01 is Thursday → Sunday is 2025-12-28
    expect(sundayWeekStart("2026-01-01")).toBe("2025-12-28");
  });
});

// ---------------------------------------------------------------------------
// weekDays
// ---------------------------------------------------------------------------

describe("weekDays", () => {
  it("returns 7 days Sun..Sat", () => {
    const days = weekDays("2026-06-07");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-06-07");
    expect(days[6]).toBe("2026-06-13");
  });

  it("consecutive and correct", () => {
    const days = weekDays("2026-06-07");
    expect(days).toEqual([
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
    ]);
  });

  it("crosses month boundary", () => {
    const days = weekDays("2026-05-31");
    expect(days[0]).toBe("2026-05-31");
    expect(days[1]).toBe("2026-06-01");
    expect(days[6]).toBe("2026-06-06");
  });
});

// ---------------------------------------------------------------------------
// isPast
// ---------------------------------------------------------------------------

describe("isPast", () => {
  it("yesterday is past", () => {
    expect(isPast("2026-06-02", "2026-06-03")).toBe(true);
  });

  it("today is NOT past", () => {
    expect(isPast("2026-06-03", "2026-06-03")).toBe(false);
  });

  it("tomorrow is NOT past", () => {
    expect(isPast("2026-06-04", "2026-06-03")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// weekOfEarliest
// ---------------------------------------------------------------------------

describe("weekOfEarliest", () => {
  it("returns null for empty set", () => {
    expect(weekOfEarliest(new Set())).toBeNull();
  });

  it("single day → sundayWeekStart of that day", () => {
    // 2026-06-09 is Tuesday → week start 2026-06-07
    expect(weekOfEarliest(new Set(["2026-06-09"]))).toBe("2026-06-07");
  });

  it("multiple days → sundayWeekStart of min", () => {
    const days = new Set(["2026-06-15", "2026-06-09", "2026-06-20"]);
    // min = 2026-06-09 (Tuesday) → 2026-06-07
    expect(weekOfEarliest(days)).toBe("2026-06-07");
  });
});

// ---------------------------------------------------------------------------
// collapseRuns
// ---------------------------------------------------------------------------

describe("collapseRuns", () => {
  it("canonical: multiple runs + singles", () => {
    expect(
      collapseRuns([
        "2026-06-01",
        "2026-06-03",
        "2026-06-04",
        "2026-06-05",
        "2026-06-09",
      ]),
    ).toBe("Jun 1, 3–5, 9");
  });

  it("single day", () => {
    expect(collapseRuns(["2026-06-01"])).toBe("Jun 1");
  });

  it("cross-month run", () => {
    expect(collapseRuns(["2026-05-30", "2026-05-31", "2026-06-01"])).toBe(
      "May 30–Jun 1",
    );
  });

  it("separate days in different months", () => {
    expect(collapseRuns(["2026-05-30", "2026-06-02"])).toBe("May 30, Jun 2");
  });

  it("empty array", () => {
    expect(collapseRuns([])).toBe("");
  });

  it("unsorted input sorted first", () => {
    expect(
      collapseRuns(["2026-06-05", "2026-06-01", "2026-06-03", "2026-06-04"]),
    ).toBe("Jun 1, 3–5");
  });

  it("deduplicates repeated keys", () => {
    expect(collapseRuns(["2026-06-03", "2026-06-03", "2026-06-04"])).toBe(
      "Jun 3–4",
    );
  });

  it("run spanning month boundary mid-year", () => {
    // Jan 30, 31, Feb 1
    expect(collapseRuns(["2026-01-30", "2026-01-31", "2026-02-01"])).toBe(
      "Jan 30–Feb 1",
    );
  });

  it("multiple cross-month runs", () => {
    // Two separate runs, each in different month pairs
    expect(
      collapseRuns(["2026-01-31", "2026-02-01", "2026-03-31", "2026-04-01"]),
    ).toBe("Jan 31–Feb 1, Mar 31–Apr 1");
  });

  it("two days in different months (not adjacent) each printed with month label", () => {
    expect(collapseRuns(["2026-01-15", "2026-03-10"])).toBe("Jan 15, Mar 10");
  });
});

// ---------------------------------------------------------------------------
// createInitialSelectionState
// ---------------------------------------------------------------------------

describe("createInitialSelectionState", () => {
  it("empty selection, null anchor, empty gridDraft", () => {
    const state = createInitialSelectionState({ todayKey: "2026-06-03" });
    expect(state.selectedDays.size).toBe(0);
    expect(state.anchorDay).toBeNull();
    expect(state.gridDraft.size).toBe(0);
  });

  it("focusedWeekStart defaults to sundayWeekStart(todayKey)", () => {
    // 2026-06-03 is Wednesday → Sunday 2026-05-31
    const state = createInitialSelectionState({ todayKey: "2026-06-03" });
    expect(state.focusedWeekStart).toBe("2026-05-31");
  });

  it("accepts explicit focusedWeekStart override", () => {
    const state = createInitialSelectionState({
      todayKey: "2026-06-03",
      focusedWeekStart: "2026-06-14",
    });
    expect(state.focusedWeekStart).toBe("2026-06-14");
  });
});

// ---------------------------------------------------------------------------
// Reducer helpers
// ---------------------------------------------------------------------------

function makeState(
  overrides: Partial<ScheduleSelectionState> = {},
): ScheduleSelectionState {
  return {
    selectedDays: new Set(),
    anchorDay: null,
    focusedWeekStart: "2026-06-07",
    gridDraft: new Set(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reducer: toggleDay
// ---------------------------------------------------------------------------

describe("reducer: toggleDay", () => {
  it("adds day when not selected, sets anchor", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-10",
    });
    expect(s1.selectedDays.has("2026-06-10")).toBe(true);
    expect(s1.anchorDay).toBe("2026-06-10");
  });

  it("removes day when already selected, still sets anchor", () => {
    const s0 = makeState({ selectedDays: new Set(["2026-06-10"]) });
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-10",
    });
    expect(s1.selectedDays.has("2026-06-10")).toBe(false);
    expect(s1.anchorDay).toBe("2026-06-10");
  });

  it("does NOT mutate original state Sets", () => {
    const original = makeState();
    const frozen = new Set(original.selectedDays);
    scheduleSelectionReducer(original, {
      type: "toggleDay",
      dayKey: "2026-06-10",
    });
    expect(original.selectedDays).toEqual(frozen);
  });

  it("sync rule: focusedWeekStart moves to earliest's week on first add", () => {
    // state starts with focusedWeekStart = 2026-06-07 (week of Jun 7)
    // adding 2026-06-01 (Monday) → earliest week = 2026-05-31
    const s0 = makeState({ focusedWeekStart: "2026-06-07" });
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-01",
    });
    expect(s1.focusedWeekStart).toBe("2026-05-31");
  });

  it("sync rule: focusedWeekStart unchanged when toggling non-earliest day", () => {
    // selection has 2026-06-01 (earliest). focusedWeekStart was manually set to 2026-06-14.
    // toggling 2026-06-15 (later) → earliest unchanged → focusedWeekStart stays 2026-06-14
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01"]),
      focusedWeekStart: "2026-06-14",
    });
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-15",
    });
    expect(s1.focusedWeekStart).toBe("2026-06-14");
  });
});

// ---------------------------------------------------------------------------
// Reducer: setRange
// ---------------------------------------------------------------------------

describe("reducer: setRange", () => {
  it("inclusive range forward", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "setRange",
      anchor: "2026-06-03",
      target: "2026-06-05",
    });
    expect([...s1.selectedDays].sort()).toEqual([
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    expect(s1.anchorDay).toBe("2026-06-03");
  });

  it("inclusive range backward (target < anchor)", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "setRange",
      anchor: "2026-06-05",
      target: "2026-06-03",
    });
    expect([...s1.selectedDays].sort()).toEqual([
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
    expect(s1.anchorDay).toBe("2026-06-05");
  });

  it("additive — does not clear existing selection", () => {
    const s0 = makeState({ selectedDays: new Set(["2026-06-01"]) });
    const s1 = scheduleSelectionReducer(s0, {
      type: "setRange",
      anchor: "2026-06-03",
      target: "2026-06-04",
    });
    expect(s1.selectedDays.has("2026-06-01")).toBe(true);
    expect(s1.selectedDays.has("2026-06-03")).toBe(true);
    expect(s1.selectedDays.has("2026-06-04")).toBe(true);
  });

  it("cross-month range adds all days", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "setRange",
      anchor: "2026-05-30",
      target: "2026-06-02",
    });
    expect([...s1.selectedDays].sort()).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
    ]);
  });

  it("single-day range (anchor === target)", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "setRange",
      anchor: "2026-06-10",
      target: "2026-06-10",
    });
    expect([...s1.selectedDays]).toEqual(["2026-06-10"]);
  });
});

// ---------------------------------------------------------------------------
// Reducer: dragDays
// ---------------------------------------------------------------------------

describe("reducer: dragDays", () => {
  it("adds all days to selection", () => {
    const s0 = makeState({ selectedDays: new Set(["2026-06-01"]) });
    const s1 = scheduleSelectionReducer(s0, {
      type: "dragDays",
      days: ["2026-06-10", "2026-06-11"],
    });
    expect(s1.selectedDays.has("2026-06-01")).toBe(true);
    expect(s1.selectedDays.has("2026-06-10")).toBe(true);
    expect(s1.selectedDays.has("2026-06-11")).toBe(true);
  });

  it("sets anchorDay to lexically-min of dragged days", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "dragDays",
      days: ["2026-06-11", "2026-06-09", "2026-06-10"],
    });
    expect(s1.anchorDay).toBe("2026-06-09");
  });

  it("empty days array: no change to selection or anchor", () => {
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01"]),
      anchorDay: "2026-06-01",
    });
    const s1 = scheduleSelectionReducer(s0, { type: "dragDays", days: [] });
    expect([...s1.selectedDays]).toEqual(["2026-06-01"]);
    expect(s1.anchorDay).toBe("2026-06-01");
  });
});

// ---------------------------------------------------------------------------
// Reducer: clearDays
// ---------------------------------------------------------------------------

describe("reducer: clearDays", () => {
  it("empties selectedDays + anchorDay", () => {
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01", "2026-06-02"]),
      anchorDay: "2026-06-01",
    });
    const s1 = scheduleSelectionReducer(s0, { type: "clearDays" });
    expect(s1.selectedDays.size).toBe(0);
    expect(s1.anchorDay).toBeNull();
  });

  it("leaves focusedWeekStart unchanged", () => {
    const s0 = makeState({
      focusedWeekStart: "2026-06-14",
      selectedDays: new Set(["2026-06-15"]),
    });
    const s1 = scheduleSelectionReducer(s0, { type: "clearDays" });
    expect(s1.focusedWeekStart).toBe("2026-06-14");
  });
});

// ---------------------------------------------------------------------------
// Reducer: setFocusedWeek
// ---------------------------------------------------------------------------

describe("reducer: setFocusedWeek", () => {
  it("sets focusedWeekStart to normalized sunday", () => {
    // passing a Thursday, should normalize to its Sunday
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "setFocusedWeek",
      weekStart: "2026-06-11", // Thursday → Sunday 2026-06-07
    });
    expect(s1.focusedWeekStart).toBe("2026-06-07");
  });

  it("does not touch selectedDays", () => {
    const s0 = makeState({ selectedDays: new Set(["2026-06-01"]) });
    const s1 = scheduleSelectionReducer(s0, {
      type: "setFocusedWeek",
      weekStart: "2026-06-14",
    });
    expect(s1.selectedDays.has("2026-06-01")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reducer: sync rule — setFocusedWeek survives later toggle of non-earliest
// ---------------------------------------------------------------------------

describe("reducer: sync rule advanced", () => {
  it("explicit setFocusedWeek survives a later toggle of a non-earliest day", () => {
    // 1. Start: selectedDays = {Jun 1}, focusedWeekStart = May 31 (auto-synced)
    // 2. setFocusedWeek to Jun 14
    // 3. toggle Jun 15 (later than Jun 1 → earliest unchanged → no sync)
    // 4. focusedWeekStart should still be Jun 14
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01"]),
      focusedWeekStart: "2026-05-31",
    });
    const s1 = scheduleSelectionReducer(s0, {
      type: "setFocusedWeek",
      weekStart: "2026-06-14",
    });
    const s2 = scheduleSelectionReducer(s1, {
      type: "toggleDay",
      dayKey: "2026-06-15",
    });
    expect(s2.focusedWeekStart).toBe("2026-06-14");
  });

  it("sync rule fires when a new earlier day is added", () => {
    // selection has Jun 10, focusedWeekStart manually set to Jun 21
    // toggle Jun 1 (earlier) → earliest changes → sync fires
    const s0 = makeState({
      selectedDays: new Set(["2026-06-10"]),
      focusedWeekStart: "2026-06-21",
    });
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-01",
    });
    // Jun 1 (Monday) → week start May 31
    expect(s1.focusedWeekStart).toBe("2026-05-31");
  });

  it("sync rule does NOT fire on clearDays", () => {
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01"]),
      focusedWeekStart: "2026-06-14",
    });
    const s1 = scheduleSelectionReducer(s0, { type: "clearDays" });
    expect(s1.focusedWeekStart).toBe("2026-06-14");
  });
});

// ---------------------------------------------------------------------------
// Reducer: gridDraft
// ---------------------------------------------------------------------------

describe("reducer: gridDraft", () => {
  it("beginGridDrag resets gridDraft to single cellId", () => {
    const s0 = makeState({
      gridDraft: new Set(["2026-06-01@480", "2026-06-01@510"]),
    });
    const s1 = scheduleSelectionReducer(s0, {
      type: "beginGridDrag",
      cellId: "2026-06-02@540",
    });
    expect(s1.gridDraft.size).toBe(1);
    expect(s1.gridDraft.has("2026-06-02@540")).toBe(true);
  });

  it("extendGridDrag adds cellIds to existing gridDraft", () => {
    const s0 = makeState({ gridDraft: new Set(["2026-06-01@480"]) });
    const s1 = scheduleSelectionReducer(s0, {
      type: "extendGridDrag",
      cellIds: ["2026-06-01@510", "2026-06-01@540"],
    });
    expect(s1.gridDraft.size).toBe(3);
    expect(s1.gridDraft.has("2026-06-01@480")).toBe(true);
    expect(s1.gridDraft.has("2026-06-01@510")).toBe(true);
    expect(s1.gridDraft.has("2026-06-01@540")).toBe(true);
  });

  it("clearGridDraft empties gridDraft", () => {
    const s0 = makeState({ gridDraft: new Set(["2026-06-01@480"]) });
    const s1 = scheduleSelectionReducer(s0, { type: "clearGridDraft" });
    expect(s1.gridDraft.size).toBe(0);
  });

  it("gridDraft ops do not touch selectedDays or anchorDay", () => {
    const s0 = makeState({
      selectedDays: new Set(["2026-06-01"]),
      anchorDay: "2026-06-01",
    });
    const s1 = scheduleSelectionReducer(s0, {
      type: "beginGridDrag",
      cellId: "2026-06-01@480",
    });
    expect(s1.selectedDays.has("2026-06-01")).toBe(true);
    expect(s1.anchorDay).toBe("2026-06-01");
  });
});

// ---------------------------------------------------------------------------
// mergeDraftToRanges
// ---------------------------------------------------------------------------

describe("mergeDraftToRanges", () => {
  const INTERVAL = 30;

  it("empty set returns []", () => {
    expect(mergeDraftToRanges(new Set(), INTERVAL)).toEqual([]);
  });

  it("single slot → single range [minute, minute+interval)", () => {
    expect(mergeDraftToRanges(new Set(["2026-06-01@540"]), INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 570 },
    ]);
  });

  it("three contiguous slots merge into one range (9:00–10:30)", () => {
    const draft = new Set([
      "2026-06-01@540",
      "2026-06-01@570",
      "2026-06-01@600",
    ]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 630 },
    ]);
  });

  it("gap in the middle → two separate ranges", () => {
    // 540 and 600 with 570 missing — 30-min interval means 540→570 is contiguous
    // but 570 is absent so 540 and 600 are NOT contiguous
    const draft = new Set(["2026-06-01@540", "2026-06-01@600"]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 570 },
      { dayKey: "2026-06-01", fromMinute: 600, toMinute: 630 },
    ]);
  });

  it("out-of-order input still merges correctly", () => {
    const draft = new Set([
      "2026-06-01@600",
      "2026-06-01@540",
      "2026-06-01@570",
    ]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 630 },
    ]);
  });

  it("multiple days: grouped separately, sorted by dayKey", () => {
    const draft = new Set([
      "2026-06-02@480",
      "2026-06-01@540",
      "2026-06-02@510",
      "2026-06-01@570",
    ]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 600 },
      { dayKey: "2026-06-02", fromMinute: 480, toMinute: 540 },
    ]);
  });

  it("two non-adjacent runs on the same day", () => {
    const draft = new Set([
      "2026-06-01@540",
      "2026-06-01@570",
      "2026-06-01@660",
      "2026-06-01@690",
    ]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 600 },
      { dayKey: "2026-06-01", fromMinute: 660, toMinute: 720 },
    ]);
  });

  it("malformed id without '@' is ignored — no throw", () => {
    const draft = new Set(["garbage", "2026-06-01@540"]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 570 },
    ]);
  });

  it("malformed id with '@' but non-numeric minute is ignored", () => {
    const draft = new Set(["2026-06-01@abc", "2026-06-01@540"]);
    expect(mergeDraftToRanges(draft, INTERVAL)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 540, toMinute: 570 },
    ]);
  });

  it("all malformed ids → []", () => {
    expect(
      mergeDraftToRanges(new Set(["bad", "@540", "2026-06-01@xyz"]), INTERVAL),
    ).toEqual([]);
  });

  it("different interval (15 min): contiguous means +15", () => {
    const draft = new Set([
      "2026-06-01@480",
      "2026-06-01@495",
      "2026-06-01@510",
    ]);
    expect(mergeDraftToRanges(draft, 15)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 480, toMinute: 525 },
    ]);
  });

  it("different interval (15 min): +30 gap splits into two ranges", () => {
    const draft = new Set(["2026-06-01@480", "2026-06-01@510"]);
    expect(mergeDraftToRanges(draft, 15)).toEqual([
      { dayKey: "2026-06-01", fromMinute: 480, toMinute: 495 },
      { dayKey: "2026-06-01", fromMinute: 510, toMinute: 525 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("immutability", () => {
  it("reducer returns new state object reference", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-10",
    });
    expect(s1).not.toBe(s0);
  });

  it("reducer returns new Set for selectedDays", () => {
    const s0 = makeState();
    const s1 = scheduleSelectionReducer(s0, {
      type: "toggleDay",
      dayKey: "2026-06-10",
    });
    expect(s1.selectedDays).not.toBe(s0.selectedDays);
  });

  it("original selectedDays Set not mutated after toggleDay", () => {
    const s0 = makeState();
    const originalSize = s0.selectedDays.size;
    scheduleSelectionReducer(s0, { type: "toggleDay", dayKey: "2026-06-10" });
    expect(s0.selectedDays.size).toBe(originalSize);
  });

  it("original gridDraft Set not mutated after beginGridDrag", () => {
    const s0 = makeState({ gridDraft: new Set(["old@480"]) });
    const originalSize = s0.gridDraft.size;
    scheduleSelectionReducer(s0, {
      type: "beginGridDrag",
      cellId: "new@480",
    });
    expect(s0.gridDraft.size).toBe(originalSize);
    expect(s0.gridDraft.has("old@480")).toBe(true);
  });
});
