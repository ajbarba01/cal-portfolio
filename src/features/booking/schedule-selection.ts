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
}

export type ScheduleSelectionAction =
  | { type: "toggleDay"; dayKey: string }
  | { type: "setRange"; anchor: string; target: string }
  | { type: "dragDays"; days: string[] }
  | { type: "clearDays" }
  | { type: "setFocusedWeek"; weekStart: string }
  | { type: "beginGridDrag"; cellId: string }
  | { type: "extendGridDrag"; cellIds: string[] }
  | { type: "clearGridDraft" };

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

    case "dragDays": {
      if (action.days.length === 0) return state;
      const next = new Set(state.selectedDays);
      for (const k of action.days) next.add(k);
      const minDay = [...action.days].sort()[0];
      return {
        ...state,
        selectedDays: next,
        anchorDay: minDay,
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

    case "extendGridDrag": {
      const next = new Set(state.gridDraft);
      for (const id of action.cellIds) next.add(id);
      return {
        ...state,
        gridDraft: next,
      };
    }

    case "clearGridDraft": {
      return {
        ...state,
        gridDraft: new Set<string>(),
      };
    }
  }
}
