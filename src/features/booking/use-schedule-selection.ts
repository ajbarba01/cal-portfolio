"use client";

/**
 * useScheduleSelection — React wrapper around the pure scheduleSelectionReducer.
 *
 * No business logic lives here. All multiselect/range/drag/week math is in
 * schedule-selection.ts. This hook only wires the reducer to React:
 *   - useReducer with lazy initializer (deterministic, no clock reads)
 *   - memoized dispatchers via useCallback
 *   - memoized derived values via useMemo
 *
 * `todayKey` is passed in by the caller so this hook stays deterministic and
 * mirrors the pure model's convention of taking `todayKey` explicitly.
 *
 * WHY NO UNIT TEST FOR THE HOOK
 * -----------------------------
 * All reducer logic lives in the pure model (schedule-selection.test.ts) and
 * the gesture model in the two pure functions below (use-schedule-selection
 * .test.ts). What is left is thin React glue; the pattern follows the
 * useAvailability precedent.
 */

import { useReducer, useCallback, useMemo } from "react";
import {
  scheduleSelectionReducer,
  createInitialSelectionState,
  collapseRuns,
  weekDays,
  sundayWeekStart,
  isPast as isPastPure,
} from "./schedule-selection";
import type {
  ScheduleSelectionState,
  ScheduleSelectionAction,
} from "./schedule-selection";

// ──────────────────────────────────────────────────────────────────────────────
// Day-selection gestures (pure)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * What one gesture on a day does to the selection:
 *   replace — plain click or drag: the run becomes the whole selection
 *   extend  — shift-click or shift-arrow: the run from the anchor becomes it
 *   toggle  — ctrl/cmd-click or Space: the run flips in or out of it
 */
export type DaySelectMode = "replace" | "extend" | "toggle";

/**
 * The day a range gesture measures from. The remembered anchor only survives
 * while it is still selected: after a clear (Escape, "Clear dates") an extend
 * has nothing to extend, so it measures from the day under the cursor instead.
 */
export function resolveAnchor(
  anchorKey: string | null,
  selectedDays: ReadonlySet<string>,
  dayKey: string,
): string {
  return anchorKey !== null && selectedDays.has(anchorKey) ? anchorKey : dayKey;
}

/**
 * Reducer actions for one gesture over `days` — an already-filtered contiguous
 * run of selectable day-keys, in calendar order, holding one entry for a plain
 * click.
 *
 * `replace` and `extend` commit the run as the entire selection, so a gesture
 * that lands on nothing selectable clears rather than leaving a stale range
 * standing. `toggle` paints ONE mode across the whole run, decided by the day
 * the gesture started on, so a ctrl-drag that begins on a selected day erases
 * the run instead of flipping each day against its own state.
 */
export function daySelectionActions(args: {
  mode: DaySelectMode;
  days: string[];
  /** The day the gesture started on — decides a toggle run's direction. */
  originKey: string;
  selectedDays: ReadonlySet<string>;
}): ScheduleSelectionAction[] {
  const { mode, days, originKey, selectedDays } = args;

  if (mode === "toggle") {
    if (days.length === 0) return [];
    return [
      {
        type: "paintDays",
        days,
        mode: selectedDays.has(originKey) ? "remove" : "add",
      },
    ];
  }

  const clear: ScheduleSelectionAction = { type: "clearDays" };
  return days.length === 0
    ? [clear]
    : [clear, { type: "paintDays", days, mode: "add" }];
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface UseScheduleSelectionResult {
  state: ScheduleSelectionState;
  // dispatchers (memoized with useCallback)
  /** Apply one day-selection gesture (see daySelectionActions). */
  selectDays: (args: {
    mode: DaySelectMode;
    days: string[];
    originKey: string;
  }) => void;
  toggleDay: (dayKey: string) => void;
  setRange: (anchor: string, target: string) => void;
  clearDays: () => void;
  setFocusedWeek: (weekStart: string) => void;
  beginGridDrag: (cellId: string) => void;
  clearGridDraft: () => void;
  paintDays: (days: string[], mode: "add" | "remove") => void;
  paintCells: (cellIds: string[], mode: "add" | "remove") => void;
  inspectBooking: (bookingId: string) => void;
  clearInspection: () => void;
  // derived (memoized with useMemo)
  summaryLabel: string;
  focusedWeekDays: string[];
  isPast: (dayKey: string) => boolean;
  todayKey: string;
  inspectedBookingId: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useScheduleSelection(args: {
  todayKey: string;
  initialFocusedWeek?: string;
  /** Pre-select an existing time slot (e.g. rescheduling): seeds the day, the
   *  grid cell, and the focused week so the slot renders selected on mount. */
  initialSlot?: { dayKey: string; minute: number };
}): UseScheduleSelectionResult {
  const [state, dispatch] = useReducer(scheduleSelectionReducer, args, (a) =>
    createInitialSelectionState({
      todayKey: a.todayKey,
      focusedWeekStart:
        a.initialFocusedWeek ??
        (a.initialSlot ? sundayWeekStart(a.initialSlot.dayKey) : undefined),
      selectedDays: a.initialSlot ? new Set([a.initialSlot.dayKey]) : undefined,
      gridDraft: a.initialSlot
        ? new Set([`${a.initialSlot.dayKey}@${a.initialSlot.minute}`])
        : undefined,
    }),
  );

  // ── dispatchers ────────────────────────────────────────────────────────────
  // dispatch is stable across renders; no other deps needed.

  // Reads the live selection to decide a toggle's direction, so unlike the raw
  // dispatchers this one changes identity whenever the selection does.
  const selectDays = useCallback(
    (args: { mode: DaySelectMode; days: string[]; originKey: string }) => {
      for (const action of daySelectionActions({
        ...args,
        selectedDays: state.selectedDays,
      })) {
        dispatch(action);
      }
    },
    [state.selectedDays],
  );

  const toggleDay = useCallback(
    (dayKey: string) => dispatch({ type: "toggleDay", dayKey }),
    [],
  );

  const setRange = useCallback(
    (anchor: string, target: string) =>
      dispatch({ type: "setRange", anchor, target }),
    [],
  );

  const clearDays = useCallback(() => dispatch({ type: "clearDays" }), []);

  const setFocusedWeek = useCallback(
    (weekStart: string) => dispatch({ type: "setFocusedWeek", weekStart }),
    [],
  );

  const beginGridDrag = useCallback(
    (cellId: string) => dispatch({ type: "beginGridDrag", cellId }),
    [],
  );

  const clearGridDraft = useCallback(
    () => dispatch({ type: "clearGridDraft" }),
    [],
  );

  const paintDays = useCallback(
    (days: string[], mode: "add" | "remove") =>
      dispatch({ type: "paintDays", days, mode }),
    [],
  );

  const paintCells = useCallback(
    (cellIds: string[], mode: "add" | "remove") =>
      dispatch({ type: "paintCells", cellIds, mode }),
    [],
  );

  const inspectBooking = useCallback(
    (bookingId: string) => dispatch({ type: "inspectBooking", bookingId }),
    [],
  );

  const clearInspection = useCallback(
    () => dispatch({ type: "clearInspection" }),
    [],
  );

  // ── derived ────────────────────────────────────────────────────────────────

  const summaryLabel = useMemo(
    () => collapseRuns([...state.selectedDays]),
    [state.selectedDays],
  );

  const focusedWeekDays = useMemo(
    () => weekDays(state.focusedWeekStart),
    [state.focusedWeekStart],
  );

  const isPast = useMemo(
    () => (dayKey: string) => isPastPure(dayKey, args.todayKey),
    [args.todayKey],
  );

  return useMemo(
    () => ({
      state,
      selectDays,
      toggleDay,
      setRange,
      clearDays,
      setFocusedWeek,
      beginGridDrag,
      clearGridDraft,
      paintDays,
      paintCells,
      inspectBooking,
      clearInspection,
      summaryLabel,
      focusedWeekDays,
      isPast,
      todayKey: args.todayKey,
      inspectedBookingId: state.inspectedBookingId,
    }),
    [
      state,
      selectDays,
      toggleDay,
      setRange,
      clearDays,
      setFocusedWeek,
      beginGridDrag,
      clearGridDraft,
      paintDays,
      paintCells,
      inspectBooking,
      clearInspection,
      summaryLabel,
      focusedWeekDays,
      isPast,
      args.todayKey,
    ],
  );
}
