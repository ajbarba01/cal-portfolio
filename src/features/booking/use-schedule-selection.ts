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
 * WHY NO UNIT TEST
 * ----------------
 * All logic under test lives in the pure model (schedule-selection.test.ts).
 * This hook is thin React glue; the pattern follows useAvailability precedent.
 */

import { useReducer, useCallback, useMemo } from "react";
import {
  scheduleSelectionReducer,
  createInitialSelectionState,
  collapseRuns,
  weekDays,
  isPast as isPastPure,
} from "./schedule-selection";
import type { ScheduleSelectionState } from "./schedule-selection";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface UseScheduleSelectionResult {
  state: ScheduleSelectionState;
  // dispatchers (memoized with useCallback)
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
}): UseScheduleSelectionResult {
  const [state, dispatch] = useReducer(scheduleSelectionReducer, args, (a) =>
    createInitialSelectionState({
      todayKey: a.todayKey,
      focusedWeekStart: a.initialFocusedWeek,
    }),
  );

  // ── dispatchers ────────────────────────────────────────────────────────────
  // dispatch is stable across renders; no other deps needed.

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
