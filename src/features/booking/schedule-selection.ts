// Pure headless scheduling-selection model — Layer 2.
// No React, no IO, no Supabase. All multiselect/range/drag/week math lives here.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleSelectionState {
  selectedDays: Set<string>; // selected dayKeys (month multiselect)
  anchorDay: string | null; // anchor for shift-range
  focusedWeekStart: string; // Sunday dayKey of the focused week (SHARED state)
  gridDraft: Set<string>; // transient when2meet cell ids "dayKey@minute"
  inspectedBookingId: string | null; // booking whose details are shown in the panel
}

export type ScheduleSelectionAction =
  | { type: "toggleDay"; dayKey: string }
  | { type: "setRange"; anchor: string; target: string }
  | { type: "clearDays" }
  | { type: "setFocusedWeek"; weekStart: string }
  | { type: "beginGridDrag"; cellId: string }
  | { type: "clearGridDraft" }
  | { type: "paintDays"; days: string[]; mode: "add" | "remove" }
  | { type: "paintCells"; cellIds: string[]; mode: "add" | "remove" }
  | { type: "inspectBooking"; bookingId: string }
  | { type: "clearInspection" };

// ---------------------------------------------------------------------------
// Date math helpers (DST-free, timezone-free)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Parse a "YYYY-MM-DD" key to a UTC ordinal (ms since epoch). */
function keyToUtc(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map((s) => parseInt(s, 10));
  return Date.UTC(y, m - 1, d);
}

/** Format a UTC ordinal back to "YYYY-MM-DD". */
function utcToKey(utc: number): string {
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The Sunday day-key of the week containing dayKey (week = Sun..Sat).
 */
export function sundayWeekStart(dayKey: string): string {
  const utc = keyToUtc(dayKey);
  const dow = new Date(utc).getUTCDay(); // 0=Sun..6=Sat
  return utcToKey(utc - dow * MS_PER_DAY);
}

/**
 * The 7 day-keys Sun..Sat starting at weekStart.
 */
export function weekDays(weekStart: string): string[] {
  const utc = keyToUtc(weekStart);
  return Array.from({ length: 7 }, (_, i) => utcToKey(utc + i * MS_PER_DAY));
}

/**
 * True when dayKey is strictly before todayKey (ISO lexical compare).
 */
export function isPast(dayKey: string, todayKey: string): boolean {
  return dayKey < todayKey;
}

/**
 * sundayWeekStart of the lexically-min selected day, or null if empty.
 */
export function weekOfEarliest(selectedDays: Set<string>): string | null {
  if (selectedDays.size === 0) return null;
  let min: string | null = null;
  for (const k of selectedDays) {
    if (min === null || k < min) min = k;
  }
  return sundayWeekStart(min!);
}

// ---------------------------------------------------------------------------
// collapseRuns
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function monthName(utc: number): string {
  return MONTH_NAMES[new Date(utc).getUTCMonth()];
}

function dayOfMonth(utc: number): number {
  return new Date(utc).getUTCDate();
}

/**
 * Print-style summary collapsing consecutive calendar days into runs.
 * Canonical examples:
 *   ["2026-06-01","2026-06-03","2026-06-04","2026-06-05","2026-06-09"] → "Jun 1, 3–5, 9"
 *   ["2026-06-01"] → "Jun 1"
 *   ["2026-05-30","2026-05-31","2026-06-01"] → "May 30–Jun 1"
 *   ["2026-05-30","2026-06-02"] → "May 30, Jun 2"
 *   [] → ""
 *   unsorted ["2026-06-05","2026-06-01","2026-06-03","2026-06-04"] → "Jun 1, 3–5"
 */
export function collapseRuns(dayKeys: string[]): string {
  if (dayKeys.length === 0) return "";

  // Sort + dedupe
  const sorted = [...new Set(dayKeys)].sort();

  // Convert to ordinals
  const ordinals = sorted.map(keyToUtc);

  // Build runs: array of [startOrdinal, endOrdinal]
  const runs: Array<[number, number]> = [];
  let runStart = ordinals[0];
  let runEnd = ordinals[0];

  for (let i = 1; i < ordinals.length; i++) {
    if (ordinals[i] - runEnd === MS_PER_DAY) {
      runEnd = ordinals[i];
    } else {
      runs.push([runStart, runEnd]);
      runStart = ordinals[i];
      runEnd = ordinals[i];
    }
  }
  runs.push([runStart, runEnd]);

  // Format runs
  const parts: string[] = [];
  let lastPrintedMonth: string | null = null;

  for (const [start, end] of runs) {
    const startMonth = monthName(start);
    const endMonth = monthName(end);
    const startDay = dayOfMonth(start);
    const endDay = dayOfMonth(end);

    if (start === end) {
      // Single day
      const printMonth = startMonth !== lastPrintedMonth;
      parts.push(printMonth ? `${startMonth} ${startDay}` : `${startDay}`);
      lastPrintedMonth = startMonth;
    } else if (startMonth === endMonth) {
      // Multi-day, same month
      const printMonth = startMonth !== lastPrintedMonth;
      parts.push(
        printMonth
          ? `${startMonth} ${startDay}–${endDay}`
          : `${startDay}–${endDay}`,
      );
      lastPrintedMonth = endMonth;
    } else {
      // Cross-month run: always print both month labels
      parts.push(`${startMonth} ${startDay}–${endMonth} ${endDay}`);
      lastPrintedMonth = endMonth;
    }
  }

  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// mergeDraftToRanges
// ---------------------------------------------------------------------------

export interface DraftRange {
  dayKey: string;
  fromMinute: number;
  toMinute: number;
}

/**
 * Collapse a gridDraft Set<"dayKey@minute"> into contiguous time ranges per day.
 *
 * Each cell id represents the interval [minute, minute+intervalMinutes).
 * Adjacent slots (next minute === previous minute + intervalMinutes) are merged
 * into a single DraftRange. A gap starts a new range.
 *
 * Returns ranges sorted by dayKey then fromMinute. Malformed ids are ignored.
 * Empty set → [].
 */
export function mergeDraftToRanges(
  gridDraft: Set<string>,
  intervalMinutes: number,
): DraftRange[] {
  // Group minutes by dayKey, ignoring malformed ids.
  const byDay = new Map<string, number[]>();
  for (const cellId of gridDraft) {
    const atIdx = cellId.indexOf("@");
    if (atIdx === -1) continue; // malformed — no "@"
    const dayKey = cellId.slice(0, atIdx);
    const minuteStr = cellId.slice(atIdx + 1);
    const minute = parseInt(minuteStr, 10);
    if (isNaN(minute) || dayKey.length === 0) continue; // malformed minute

    let minutes = byDay.get(dayKey);
    if (minutes === undefined) {
      minutes = [];
      byDay.set(dayKey, minutes);
    }
    minutes.push(minute);
  }

  const ranges: DraftRange[] = [];

  // Sort day keys, then merge within each day.
  const sortedDayKeys = [...byDay.keys()].sort();
  for (const dayKey of sortedDayKeys) {
    const minutes = byDay
      .get(dayKey)!
      .slice()
      .sort((a, b) => a - b);

    let fromMinute = minutes[0];
    let prevMinute = minutes[0];

    for (let i = 1; i < minutes.length; i++) {
      const curr = minutes[i];
      if (curr === prevMinute + intervalMinutes) {
        // Contiguous — extend the current run.
        prevMinute = curr;
      } else {
        // Gap — close current range and start a new one.
        ranges.push({
          dayKey,
          fromMinute,
          toMinute: prevMinute + intervalMinutes,
        });
        fromMinute = curr;
        prevMinute = curr;
      }
    }
    // Close the final range for this day.
    ranges.push({ dayKey, fromMinute, toMinute: prevMinute + intervalMinutes });
  }

  return ranges;
}

// ---------------------------------------------------------------------------
// createInitialSelectionState
// ---------------------------------------------------------------------------

export function createInitialSelectionState(args: {
  todayKey: string;
  focusedWeekStart?: string;
}): ScheduleSelectionState {
  return {
    selectedDays: new Set<string>(),
    anchorDay: null,
    focusedWeekStart: args.focusedWeekStart ?? sundayWeekStart(args.todayKey),
    gridDraft: new Set<string>(),
    inspectedBookingId: null,
  };
}

// ---------------------------------------------------------------------------
// Reducer helpers
// ---------------------------------------------------------------------------

/** Compute all day-keys in the inclusive range [a, b] (lexical order). */
function daysInRange(a: string, b: string): string[] {
  const minUtc = Math.min(keyToUtc(a), keyToUtc(b));
  const maxUtc = Math.max(keyToUtc(a), keyToUtc(b));
  const keys: string[] = [];
  for (let utc = minUtc; utc <= maxUtc; utc += MS_PER_DAY) {
    keys.push(utcToKey(utc));
  }
  return keys;
}

/**
 * Apply bidirectional week-sync rule after mutating selectedDays:
 * if the earliest selected day changed, move focusedWeekStart to that week.
 */
function applySyncRule(
  nextSelectedDays: Set<string>,
  prevSelectedDays: Set<string>,
  prevFocusedWeekStart: string,
): string {
  const newEarliest = weekOfEarliest(nextSelectedDays);
  if (newEarliest === null) return prevFocusedWeekStart;

  const prevEarliest = weekOfEarliest(prevSelectedDays);
  // Only sync when the earliest day actually changed
  if (newEarliest === prevEarliest) return prevFocusedWeekStart;

  return sundayWeekStart(newEarliest);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function scheduleSelectionReducer(
  state: ScheduleSelectionState,
  action: ScheduleSelectionAction,
): ScheduleSelectionState {
  switch (action.type) {
    case "toggleDay": {
      const next = new Set(state.selectedDays);
      if (next.has(action.dayKey)) {
        next.delete(action.dayKey);
      } else {
        next.add(action.dayKey);
      }
      return {
        ...state,
        selectedDays: next,
        anchorDay: action.dayKey,
        focusedWeekStart: applySyncRule(
          next,
          state.selectedDays,
          state.focusedWeekStart,
        ),
      };
    }

    case "setRange": {
      const rangeKeys = daysInRange(action.anchor, action.target);
      const next = new Set(state.selectedDays);
      for (const k of rangeKeys) next.add(k);
      return {
        ...state,
        selectedDays: next,
        anchorDay: action.anchor,
        focusedWeekStart: applySyncRule(
          next,
          state.selectedDays,
          state.focusedWeekStart,
        ),
      };
    }

    case "clearDays": {
      return {
        ...state,
        selectedDays: new Set<string>(),
        anchorDay: null,
        // focusedWeekStart intentionally unchanged
      };
    }

    case "setFocusedWeek": {
      return {
        ...state,
        focusedWeekStart: sundayWeekStart(action.weekStart),
      };
    }

    case "beginGridDrag": {
      return {
        ...state,
        gridDraft: new Set([action.cellId]),
      };
    }

    case "clearGridDraft": {
      return {
        ...state,
        gridDraft: new Set<string>(),
      };
    }

    case "paintDays": {
      if (action.days.length === 0) return state;
      const next = new Set(state.selectedDays);
      if (action.mode === "add") {
        for (const k of action.days) next.add(k);
      } else {
        for (const k of action.days) next.delete(k);
      }
      const anchorDay =
        action.mode === "add"
          ? ([...action.days].sort()[0] ?? null)
          : ([...next].sort()[0] ?? null);
      return {
        ...state,
        selectedDays: next,
        anchorDay,
        focusedWeekStart: applySyncRule(
          next,
          state.selectedDays,
          state.focusedWeekStart,
        ),
      };
    }

    case "paintCells": {
      if (action.cellIds.length === 0) return state;
      const next = new Set(state.gridDraft);
      if (action.mode === "add") {
        for (const id of action.cellIds) next.add(id);
      } else {
        for (const id of action.cellIds) next.delete(id);
      }
      return {
        ...state,
        gridDraft: next,
      };
    }

    case "inspectBooking": {
      return {
        ...state,
        inspectedBookingId: action.bookingId,
      };
    }

    case "clearInspection": {
      return {
        ...state,
        inspectedBookingId: null,
      };
    }
  }
}
