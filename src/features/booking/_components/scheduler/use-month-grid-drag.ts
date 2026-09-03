"use client";

/**
 * useMonthGridDrag — the month calendar's input layer.
 *
 * Owns every way a day enters or leaves the selection (pointer press, drag,
 * click, keyboard extend) plus the transient hover/preview state those gestures
 * paint with. Split out of MonthGrid so that file is classification, visuals and
 * markup while the gesture state machine — drag refs, the one-shot global
 * pointerup, the click the drag has to swallow — lives here. Which reducer
 * actions a gesture becomes is pure and lives in use-schedule-selection
 * (`daySelectionActions`, `resolveAnchor`).
 *
 * SELECTION MODEL by `capabilities.daySelection`:
 *
 * - multi (admin availability): plain press-and-release selects ONLY that day;
 *     dragging selects the contiguous run it sweeps; shift extends the run from
 *     the anchor; ctrl/cmd toggles a day (or paints one mode across a dragged
 *     run, decided by the day it started on). Space/Enter toggles the focused
 *     day, Shift+Arrow extends to the day focus moves onto, Escape clears.
 *     Every run is filtered to selectable cells, so booked/past/no-data days it
 *     flows over are skipped the way a text selection skips an unselectable span.
 * - range (house sitting): two-click boundary model, either end first, with a
 *     dotted preview between the armed boundary and the cursor.
 * - single / none: one click, one day.
 *
 * The ANCHOR is remembered here rather than read from the reducer's `anchorDay`:
 * an extend has to keep measuring from where the operator started even after a
 * backwards range moved the earliest selected day. It self-heals — an anchor
 * that is no longer selected is ignored (see `resolveAnchor`), so clearing the
 * selection from anywhere leaves the next shift-gesture behaving as a plain one.
 */

import { useState, useRef, useCallback } from "react";
import { useScheduler } from "@/features/booking/scheduler-context";
import { resolveAnchor } from "@/features/booking/use-schedule-selection";
import type { DaySelectMode } from "@/features/booking/use-schedule-selection";
import type { DayAvailability } from "@/features/booking/calendar-model";
import { useCellSelection } from "./use-cell-selection";

// ---------------------------------------------------------------------------
// Day-key arithmetic (UTC ordinals — DST-free, timezone-free)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" to UTC ordinal (ms). */
function keyToUtc(dayKey: string): number {
  // A key with missing parts parses to NaN, which carries through to an Invalid
  // Date exactly as an unparseable part always has.
  const [y = NaN, mo = NaN, d = NaN] = dayKey
    .split("-")
    .map((s) => parseInt(s, 10));
  return Date.UTC(y, mo - 1, d);
}

/** UTC ordinal → "YYYY-MM-DD". */
function utcToKey(utc: number): string {
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Enumerate all day-keys in the inclusive contiguous range [a, b], in calendar
 * order. Handles a > b gracefully.
 */
export function daysInRange(a: string, b: string): string[] {
  const minUtc = Math.min(keyToUtc(a), keyToUtc(b));
  const maxUtc = Math.max(keyToUtc(a), keyToUtc(b));
  const keys: string[] = [];
  for (let utc = minUtc; utc <= maxUtc; utc += MS_PER_DAY) {
    keys.push(utcToKey(utc));
  }
  return keys;
}

/** The day-key `deltaDays` away — the keyboard's day (±1) and week (±7) steps. */
export function stepDayKey(dayKey: string, deltaDays: number): string {
  return utcToKey(keyToUtc(dayKey) + deltaDays * MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cell-level kind for pointer routing. */
export type CellKind = "selectable" | "booked" | "inert";

/** Which modifier a gesture was pressed with. */
export interface CellModifiers {
  shiftKey: boolean;
  /** ctrl on Windows/Linux, cmd on macOS. */
  toggleKey: boolean;
}

/**
 * What the live preview is showing. "replace" is the plain/extend drag: the run
 * under the cursor is what will remain selected, so committed days OUTSIDE it
 * are the ones about to go.
 */
export type PreviewMode = "add" | "remove" | "replace" | null;

/** A press-drag in flight. Only multi presses start one. */
interface DragState {
  /** Where the swept range measures from: the anchor for an extend, else the press. */
  anchorKey: string;
  currentKey: string;
  /** The day the press landed on — decides a toggle run's direction. */
  originKey: string;
  mode: DaySelectMode;
}

export interface MonthGridDragArgs {
  /** Availability classification for the days on screen. */
  byKey: Map<string, DayAvailability>;
  cellKind: (dayKey: string) => CellKind;
  /** rdp's disabled predicate, keyed by day-key. */
  isDisabledKey: (dayKey: string) => boolean;
  /**
   * Whether a day may join a multi run. Unlike `cellKind` this also answers for
   * days the visible month does not classify, so a shift-extend can cross a
   * month boundary.
   */
  isSelectableKey: (dayKey: string) => boolean;
}

export interface MonthGridDrag {
  previewDays: Set<string>;
  previewMode: PreviewMode;
  hoveredBookingId: string | null;
  onCellPointerDown: (
    dayKey: string,
    kind: CellKind,
    modifiers: CellModifiers,
    bookingId?: string,
  ) => void;
  onCellPointerEnter: (
    dayKey: string,
    kind: CellKind,
    bookingId?: string,
  ) => void;
  onCellPointerLeave: (kind: CellKind) => void;
  /** rdp's onDayClick, guarded against the click that trails a pointer gesture. */
  onDayClick: (dayKey: string, detail: number) => void;
  /** Keyboard: grow the selection from the anchor onto the day focus moved to. */
  extendTo: (dayKey: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMonthGridDrag({
  byKey,
  cellKind,
  isDisabledKey,
  isSelectableKey,
}: MonthGridDragArgs): MonthGridDrag {
  const { selection, capabilities } = useScheduler();
  const { state, selectDays, toggleDay, setRange, clearDays, inspectBooking } =
    selection;

  const isMulti = capabilities.daySelection === "multi";
  const isRange = capabilities.daySelection === "range";

  // Live drag preview (populated during pointer-drag, cleared on commit).
  const [previewDays, setPreviewDays] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode>(null);

  // Transient hovered-booking id: lifts ALL cells of one booking together,
  // since CSS :hover can't span sibling cells.
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);

  // Range mode (house-sitting): the first of two boundary clicks, armed and
  // awaiting the second click. While set, hovering dotted-previews the would-be
  // range; the second click commits it. Either boundary may be clicked first.
  const [pendingBoundary, setPendingBoundary] = useState<string | null>(null);

  const dragRef = useRef<DragState | null>(null);
  // Swallows the click that fires after pointerup (the paint commits there).
  const suppressNextClick = useRef(false);
  const anchorRef = useRef<string | null>(null);
  const { dragEndHandlerRef, installEndHandler } = useCellSelection();

  /**
   * Contiguous calendar range anchor→current (inclusive, direction-agnostic),
   * filtered to selectable cells only, so booked/past/no-data days within the
   * span are skipped like a text selection skipping unselectable spans.
   */
  const selectableRange = useCallback(
    (anchorKey: string, currentKey: string): string[] =>
      daysInRange(anchorKey, currentKey).filter(isSelectableKey),
    [isSelectableKey],
  );

  /**
   * Commit one multi gesture. Whatever the gesture actually measured from
   * becomes the remembered anchor — including the day an extend FELL BACK to
   * when the old anchor was gone, or successive shift-gestures after a clear
   * would each keep falling back and select one day instead of growing a range.
   */
  const commitGesture = useCallback(
    (args: {
      mode: DaySelectMode;
      days: string[];
      originKey: string;
      anchorKey: string;
    }) => {
      selectDays({
        mode: args.mode,
        days: args.days,
        originKey: args.originKey,
      });
      anchorRef.current = args.anchorKey;
    },
    [selectDays],
  );

  const extendTo = useCallback(
    (dayKey: string) => {
      const anchorKey = resolveAnchor(
        anchorRef.current,
        state.selectedDays,
        dayKey,
      );
      commitGesture({
        mode: "extend",
        days: selectableRange(anchorKey, dayKey),
        originKey: dayKey,
        anchorKey,
      });
    },
    [state.selectedDays, selectableRange, commitGesture],
  );

  // ── pointerdown ───────────────────────────────────────────────────────────
  const onCellPointerDown = useCallback(
    (
      dayKey: string,
      kind: CellKind,
      modifiers: CellModifiers,
      bookingId?: string,
    ) => {
      if (kind === "inert") return;

      // Booked cell → inspect (both multi and range), no selection change.
      if (kind === "booked") {
        if (bookingId) inspectBooking(bookingId);
        // No drag started; suppress the synthetic click too (multi) so the
        // click handler doesn't run.
        if (isMulti) suppressNextClick.current = true;
        return;
      }

      if (!isMulti) {
        // range: pure two-click BOUNDARY model — no press-drag. The click
        // handler owns it. single / none: no drag; click handler owns it.
        return;
      }

      const mode: DaySelectMode = modifiers.shiftKey
        ? "extend"
        : modifiers.toggleKey
          ? "toggle"
          : "replace";
      // An extend sweeps from the remembered anchor; everything else from the
      // cell under the pointer.
      const anchorKey =
        mode === "extend"
          ? resolveAnchor(anchorRef.current, state.selectedDays, dayKey)
          : dayKey;

      dragRef.current = {
        anchorKey,
        currentKey: dayKey,
        originKey: dayKey,
        mode,
      };
      suppressNextClick.current = false;
      setPreviewDays(new Set(selectableRange(anchorKey, dayKey)));
      setPreviewMode(
        mode === "toggle"
          ? state.selectedDays.has(dayKey)
            ? "remove"
            : "add"
          : "replace",
      );

      const endHandler = () => {
        dragEndHandlerRef.current = null;
        const drag = dragRef.current;
        if (!drag) return;
        setPreviewDays(new Set<string>());
        setPreviewMode(null);
        suppressNextClick.current = true; // tap OR drag both commit here
        // Recompute the run (matching the live preview) and commit it.
        commitGesture({
          mode: drag.mode,
          days: selectableRange(drag.anchorKey, drag.currentKey),
          originKey: drag.originKey,
          anchorKey: drag.anchorKey,
        });
        dragRef.current = null;
      };
      installEndHandler(endHandler);
    },
    [
      isMulti,
      state.selectedDays,
      inspectBooking,
      commitGesture,
      installEndHandler,
      dragEndHandlerRef,
      selectableRange,
    ],
  );

  // ── pointerenter ──────────────────────────────────────────────────────────
  const onCellPointerEnter = useCallback(
    (dayKey: string, kind: CellKind, bookingId?: string) => {
      // Booking hover lift (independent of any drag).
      if (kind === "booked" && bookingId != null) {
        setHoveredBookingId(bookingId);
      }

      const drag = dragRef.current;
      if (drag) {
        if (dayKey === drag.currentKey) return;
        drag.currentKey = dayKey;
        setPreviewDays(new Set(selectableRange(drag.anchorKey, dayKey)));
        return;
      }

      // Two-click range: once one boundary is armed, hovering dotted-previews
      // the would-be range to the cursor until the second click commits. Works
      // across month navigation (the armed boundary persists).
      if (isRange && pendingBoundary !== null && kind === "selectable") {
        setPreviewDays(new Set(daysInRange(pendingBoundary, dayKey)));
      }
    },
    [selectableRange, isRange, pendingBoundary],
  );

  const onCellPointerLeave = useCallback((kind: CellKind) => {
    if (kind === "booked") setHoveredBookingId(null);
  }, []);

  // ── click ─────────────────────────────────────────────────────────────────
  const onDayClick = useCallback(
    (dayKey: string, detail: number) => {
      // A pointer gesture already committed on pointerup; only the click it
      // drags behind it is swallowed. Keyboard activation (detail 0) never
      // follows a pointerup, so it must not be eaten by a stale flag — a
      // pointerup released outside the grid leaves one behind.
      const trailing = suppressNextClick.current;
      suppressNextClick.current = false;
      if (trailing && detail !== 0) return;

      switch (capabilities.daySelection) {
        case "none":
          return;

        case "single":
          if (isDisabledKey(dayKey)) return;
          clearDays();
          toggleDay(dayKey);
          return;

        case "range": {
          // A click on a booked cell inspects the booking without disturbing
          // the range selection.
          if (cellKind(dayKey) === "booked") {
            const bid = byKey.get(dayKey)?.bookingId;
            if (bid) inspectBooking(bid);
            return;
          }
          if (isDisabledKey(dayKey)) return;
          // Two-click BOUNDARY model (either end first):
          if (pendingBoundary === null) {
            // First click: arm one boundary; drop any committed range. No commit
            // or quote yet — just a dotted marker that grows on hover.
            clearDays();
            setPendingBoundary(dayKey);
            setPreviewDays(new Set([dayKey]));
          } else {
            // Second click: commit the range between the two boundaries
            // (setRange normalizes order, so either end may be clicked first).
            setRange(pendingBoundary, dayKey);
            setPendingBoundary(null);
            setPreviewDays(new Set());
          }
          return;
        }

        case "multi": {
          // Pointer gestures commit on pointerup, so this is the keyboard path:
          // Space/Enter toggles the focused day.
          if (detail !== 0) return;
          if (cellKind(dayKey) !== "selectable") return;
          commitGesture({
            mode: "toggle",
            days: [dayKey],
            originKey: dayKey,
            anchorKey: dayKey,
          });
          return;
        }
      }
    },
    [
      capabilities.daySelection,
      pendingBoundary,
      isDisabledKey,
      cellKind,
      byKey,
      inspectBooking,
      clearDays,
      toggleDay,
      setRange,
      commitGesture,
    ],
  );

  return {
    previewDays,
    previewMode,
    hoveredBookingId,
    onCellPointerDown,
    onCellPointerEnter,
    onCellPointerLeave,
    onDayClick,
    extendTo,
  };
}
