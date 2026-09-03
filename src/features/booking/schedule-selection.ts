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
  // A key with missing parts parses to NaN, which carries through to an Invalid
  // Date exactly as an unparseable part always has.
  const [y = NaN, m = NaN, d = NaN] = dayKey
    .split("-")
    .map((s) => parseInt(s, 10));
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
  // getUTCMonth is 0–11 for any real date and NaN for an invalid one, which has
  // no month name to print.
  return MONTH_NAMES[new Date(utc).getUTCMonth()] ?? "";
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

  // Build runs: array of [startOrdinal, endOrdinal]. An ordinal one day past the
  // open run extends it; anything else starts a new run.
  const runs: Array<[number, number]> = [];
  for (const ordinal of ordinals) {
    const openRun = runs.at(-1);
    if (openRun && ordinal - openRun[1] === MS_PER_DAY) openRun[1] = ordinal;
    else runs.push([ordinal, ordinal]);
  }

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
  /** Pre-seed the selected day(s) — used to rehydrate a reschedule. */
  selectedDays?: Set<string>;
  /** Pre-seed the time-grid draft cells ("dayKey@minute") — reschedule rehydrate. */
  gridDraft?: Set<string>;
}): ScheduleSelectionState {
  return {
    selectedDays: new Set<string>(args.selectedDays ?? []),
    anchorDay: null,
    focusedWeekStart: args.focusedWeekStart ?? sundayWeekStart(args.todayKey),
    gridDraft: new Set<string>(args.gridDraft ?? []),
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
