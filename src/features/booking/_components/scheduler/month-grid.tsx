"use client";

/**
 * Scheduler.MonthGrid — multiselect month calendar panel (Layer 1 UI).
 *
 * Reads all state from SchedulerContext (via useScheduler) and dispatches back
 * into it. Owns NO selection logic — all day-classification logic lives in
 * calendar-model.ts; all run-edge math lives in grid-runs.ts. Owns NO colours —
 * token-only (status fills + clay (brand) outline + muted; no hex).
 *
 * DAY-KEY BRIDGE
 * The Calendar (react-day-picker v9) yields local-midnight Date objects for
 * each cell. We key them with format(date, "yyyy-MM-dd") (date-fns, layout
 * only) so they match the Denver day-keys built via denverMidnight.
 *
 * VISUAL LANGUAGE (token-only, no bespoke colors)
 * The cell composes three INDEPENDENT layers so state and selection no longer
 * fight (selection used to be a solid fill that hid the day's state):
 *
 *   1. STATE FILL (background of the day, from byKey classification):
 *        available     → bg-status-available  / text-status-available-foreground
 *        busy (booked) → bg-status-booked     / text-status-booked-foreground
 *        out-of-window → bg-status-unavailable / text-status-unavailable-foreground
 *        past          → text-muted-foreground opacity-40 (no loud fill)
 *        no-data       → disabled / faint (rdp default)
 *   2. BOOKING MERGE: busy days of the SAME bookingId merge horizontally within
 *        a week row into one rounded blue pill (runFillRounding). Hovering any
 *        cell of a booking lifts ALL its cells lighter (bg-status-booked/70) via
 *        transient hoveredBookingId state (CSS :hover can't span sibling cells).
 *   3. SELECTION OUTLINE: selected days draw a merged clay outline
 *        (border-brand) that joins horizontally-adjacent selected days in the
 *        same week row into one rounded pill (runOutlineClasses). A gap or week
 *        boundary caps the run. Live drag preview uses the same mechanism in a
 *        dashed/half-opacity variant (border-brand/60 border-dashed).
 *   State fill and selection outline COMPOSE — a day can be available-green AND
 *   selection-outlined at once.
 *
 * INTERACTION
 * - multi (admin): PAINT-TOGGLE. pointerdown on a non-booked selectable cell
 *     picks mode = selected ? "remove" : "add"; dragging selects a CONTIGUOUS
 *     calendar range anchor→current (text-selection semantics, reading-order
 *     day flow — NOT a free pointer path, NOT a rectangular marquee), filtered
 *     to selectable cells so booked/past/no-data days the range flows over are
 *     skipped; pointerup commits that filtered range via paintDays. A single
 *     tap is the same path with one key. pointerdown on a BOOKED cell →
 *     inspectBooking (no selection change, no paint drag). Past / no-data cells
 *     are inert.
 * - range (house_sitting) / single: UNCHANGED. Click + contiguous-range drag
 *     anchor→current, committed on pointerup. A click on a booked cell also
 *     inspects the booking (does not disturb range selection).
 *
 * Transient drag state lives in refs to avoid re-renders during drag; a one-shot
 * global pointerup/pointercancel listener commits even when released outside the
 * grid, with unmount cleanup. suppressNextClick swallows the click that follows
 * a drag.
 *
 * MONTH SYNC
 * `userMonth` tracks the month the user last navigated to (prev/next arrows).
 * The focused-week band is a SUBTLE underline on the day number (low priority)
 * so it never overrides the status fills.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format, getDaysInMonth, startOfMonth } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { deriveBookableDays } from "@/features/booking/calendar-model";
import type { DayAvailability } from "@/features/booking/calendar-model";
import { denverMidnight } from "@/features/booking/availability";
import {
  weekDays,
  sundayWeekStart,
} from "@/features/booking/schedule-selection";
import { runEdges, runFillRounding } from "@/features/booking/grid-runs";
import type { DayButtonProps } from "react-day-picker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All "YYYY-MM-DD" day-keys for the real days in `month`. */
function monthDayKeys(month: Date): string[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const count = getDaysInMonth(startOfMonth(month));
  const keys: string[] = [];
  for (let d = 1; d <= count; d++) {
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    keys.push(`${y}-${mm}-${dd}`);
  }
  return keys;
}

const MS_PER_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" to UTC ordinal (ms). */
function keyToUtc(dayKey: string): number {
  const [y, mo, d] = dayKey.split("-").map((s) => parseInt(s, 10));
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
 * Enumerate all day-keys in the inclusive contiguous range [a, b].
 * Handles a > b gracefully.
 */
function daysInRange(a: string, b: string): string[] {
  const minUtc = Math.min(keyToUtc(a), keyToUtc(b));
  const maxUtc = Math.max(keyToUtc(a), keyToUtc(b));
  const keys: string[] = [];
  for (let utc = minUtc; utc <= maxUtc; utc += MS_PER_DAY) {
    keys.push(utcToKey(utc));
  }
  return keys;
}

/** Cell-level kind for pointer routing. */
type CellKind = "selectable" | "booked" | "inert";

// ---------------------------------------------------------------------------
// Custom DayButton — owns ALL per-cell visuals (state fill + booking merge +
// selection outline + hover) because per-cell rounding/outline depends on
// row-neighbor computation that rdp's static modifiersClassNames can't express.
// ---------------------------------------------------------------------------

interface DragState {
  active: boolean;
  /**
   * Both variants build a contiguous anchor→current calendar range. "paint"
   * (multi) filters that range to selectable cells and applies paintMode;
   * "range" sets the raw range.
   */
  variant: "paint" | "range";
  anchorKey: string;
  currentKey: string;
  paintMode: "add" | "remove";
  didDrag: boolean;
}

interface SchedulerDayButtonProps extends DayButtonProps {
  dayKey: string;
  /** Classification of this cell for fill + pointer routing. */
  availability: DayAvailability | undefined;
  kind: CellKind;
  /** Status-fill + fill-run rounding, applied to the button itself. */
  fillClassName: string;
  /**
   * Selection / preview OUTLINE, rendered on a separate inset overlay span so it
   * never shares the button's fill corner-radius. This is what removes the notch
   * when a selection is a strict subset of a contiguous fill run: fill rounding
   * (button) and outline rounding (overlay) are now fully independent layers.
   */
  outlineClassName: string;
  onCellPointerDown: (
    dayKey: string,
    kind: CellKind,
    bookingId?: string,
  ) => void;
  onCellPointerEnter: (
    dayKey: string,
    kind: CellKind,
    bookingId?: string,
  ) => void;
  onCellPointerLeave: (kind: CellKind) => void;
}

function SchedulerDayButton({
  // `day` is part of DayButtonProps (required by rdp) but we only need dayKey,
  // which is pre-computed from day.date by the parent.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  day: _day,
  modifiers,
  dayKey,
  availability,
  kind,
  fillClassName,
  outlineClassName,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerLeave,
  className,
  // `children` is the rdp-rendered day number — pull it out so our explicit JSX
  // children (the outline overlay) don't clobber it via the spread below.
  children,
  ...buttonProps
}: SchedulerDayButtonProps) {
  const isSelected = modifiers.selected === true;
  const bookingId = availability?.bookingId;
  const { data } = useScheduler();
  const hasMyBooking = data.myBookings?.has(dayKey) ?? false;

  // Hover affordance (selectable cells only): a dotted clay (brand) outline signalling
  // "this will select". Outline (not border) so it never shifts layout or fights
  // the selection border; inset so it sits inside the cell. Dotted = hover,
  // dashed = drag-preview, solid = committed — the three-tier outline language.
  const hoverClass =
    kind === "selectable"
      ? "hover:outline-2 hover:outline-dotted hover:outline-brand/60 hover:-outline-offset-2"
      : "";

  // Do NOT call setPointerCapture — that redirects all pointer events to this
  // element and prevents onPointerEnter from firing on sibling buttons.
  const handlePointerDown = useCallback(() => {
    onCellPointerDown(dayKey, kind, bookingId);
  }, [dayKey, kind, bookingId, onCellPointerDown]);

  const handlePointerEnter = useCallback(() => {
    onCellPointerEnter(dayKey, kind, bookingId);
  }, [dayKey, kind, bookingId, onCellPointerEnter]);

  const handlePointerLeave = useCallback(() => {
    onCellPointerLeave(kind);
  }, [kind, onCellPointerLeave]);

  return (
    <button
      {...buttonProps}
      className={cn(
        className,
        fillClassName,
        hoverClass,
        isSelected && "text-brand-strong font-bold",
      )}
      aria-pressed={kind === "selectable" ? isSelected : undefined}
      title={kind === "booked" ? "Booked" : undefined}
      style={{ touchAction: "none", userSelect: "none" }}
      // Suppress the browser's native drag (the "moving a picture/file" ghost)
      // so a pointer-drag selection isn't hijacked into an HTML5 drag op.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      {hasMyBooking && (
        <span
          aria-hidden="true"
          className="bg-status-available-foreground absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full"
        />
      )}
      {outlineClassName !== "" && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0",
            outlineClassName,
          )}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MonthGrid
// ---------------------------------------------------------------------------

export function MonthGrid({ className }: { className?: string }) {
  const { selection, capabilities, data } = useScheduler();
  const {
    state,
    toggleDay,
    setRange,
    clearDays,
    paintDays,
    inspectBooking,
    focusedWeekDays,
  } = selection;

  // ── Visible month ─────────────────────────────────────────────────────────
  // User-controlled via the calendar's prev/next arrows; defaults to today's
  // month. The focused-week band is applied via the `focusedWeek` modifier per
  // in-view day; the visible month is NOT slaved to the focused week.
  const [userMonth, setUserMonth] = useState<Date>(data.now);

  // Live drag preview (populated during pointer-drag, cleared on commit).
  const [previewDays, setPreviewDays] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Active paint mode for the live preview (multi only). dragRef is non-reactive,
  // so visualFor needs a reactive mirror to differentiate add vs remove feedback.
  const [previewMode, setPreviewMode] = useState<"add" | "remove" | null>(null);

  // Transient hovered-booking id: lifts ALL cells of one booking together,
  // since CSS :hover can't span sibling cells.
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);

  // ── Classification ────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const keys = monthDayKeys(userMonth);
    return deriveBookableDays({
      days: keys.map((k) => denverMidnight(k)),
      overnightNights: data.overnightNights,
      busyResident: data.busyResident,
      rules: data.rules,
      now: data.now,
    });
  }, [
    userMonth,
    data.overnightNights,
    data.busyResident,
    data.rules,
    data.now,
  ]);

  const byKey = useMemo(() => new Map(days.map((d) => [d.dayKey, d])), [days]);

  // ── Visible week rows ─────────────────────────────────────────────────────
  // Distinct Sunday-week-start rows covering the visible grid, derived from the
  // first day of userMonth. 6 rows always cover any month layout; extra rows are
  // harmless (byKey.get returns undefined for non-month days). Used to compute
  // run-edge maps ONCE per render instead of per-cell.
  const visibleWeeks = useMemo(() => {
    const firstKey = format(startOfMonth(userMonth), "yyyy-MM-dd");
    let weekStart = sundayWeekStart(firstKey);
    const rows: string[][] = [];
    for (let i = 0; i < 6; i++) {
      const row = weekDays(weekStart);
      rows.push(row);
      // Next row's Sunday = the day after this row's Saturday (row[6]). Treat
      // Saturday as a 7-day window start; index 1 is the following Sunday.
      weekStart = weekDays(row[6])[1];
    }
    return rows;
  }, [userMonth]);

  // ── Run-edge maps (computed once per render, not per-cell) ──────────────────
  // Edges are computed over the WHOLE visible month flattened into calendar
  // reading order (Sun→Sat, row after row) — NOT per week row. This is what makes
  // a contiguous selection that wraps across a row boundary round only at its
  // TRUE ends: the last cell of a row whose run continues onto the next row is
  // interior (no cap border, no rounding → flat edge), and likewise the first
  // cell of the continuation. Per-row edges used to round every row's ends,
  // which read as separate pills. Booking fills get the same treatment.
  //
  // Selection + booking maps MUST NOT depend on previewDays/hoveredBookingId so
  // hover/preview re-renders don't rebuild them (the drag hot path).
  const orderedDays = useMemo(() => visibleWeeks.flat(), [visibleWeeks]);

  // Fill runs group by STATUS (not just booking id) so a contiguous block of
  // available days merges into one rounded pill, an unavailable block into
  // another, and same-booking busy days into theirs. Adjacent DIFFERENT bookings
  // stay separate (distinct keys); past cells never merge (null).
  const fillEdgeMap = useMemo(
    () =>
      runEdges(orderedDays, (k) => {
        const da = byKey.get(k);
        if (!da) return null;
        switch (da.state) {
          case "available":
            return "available";
          case "busy":
            return da.bookingId ? `booking:${da.bookingId}` : "busy";
          case "out-of-window":
            return "unavailable";
          case "past":
            return null;
          default:
            return "unavailable";
        }
      }),
    [orderedDays, byKey],
  );

  const previewEdgeMap = useMemo(
    () => runEdges(orderedDays, (k) => (previewDays.has(k) ? "p" : null)),
    [orderedDays, previewDays],
  );

  // ── Disabled predicate ────────────────────────────────────────────────────
  const isDisabled = useCallback(
    (date: Date): boolean => {
      const k = format(date, "yyyy-MM-dd");
      const da = byKey.get(k);
      if (!da) return true; // adjacent month cell — no data
      if (da.state === "past") return true;
      if (!capabilities.editable && da.state !== "available") return true;
      return false;
    },
    [byKey, capabilities.editable],
  );

  // ── Cell kind (pointer routing) ───────────────────────────────────────────
  // selectable: paintable / range-eligible (available or out-of-window, not past)
  // booked:     busy day → inspect, never select
  // inert:      past / no-data
  const cellKind = useCallback(
    (dayKey: string): CellKind => {
      const da = byKey.get(dayKey);
      if (!da) return "inert";
      if (da.state === "busy") return "booked";
      if (da.state === "past") return "inert";
      // available + out-of-window are selectable (admin may book out-of-window);
      // for non-editable views isDisabled gates non-available cells already.
      if (!capabilities.editable && da.state !== "available") return "inert";
      return "selectable";
    },
    [byKey, capabilities.editable],
  );

  // ── Per-cell composed visuals ─────────────────────────────────────────────
  // Returns TWO independent layers:
  //   fill    → status colour + fill-run rounding, applied to the button. Its
  //             corner radius follows the STATUS run (contiguous available pill…).
  //   outline → selection / preview border, applied to a separate inset overlay.
  //             Its corner radius follows the SELECTION run, independent of fill,
  //             so a subset selection no longer notches the fill underneath.
  const cellClasses = useCallback(
    (dayKey: string): { fill: string; outline: string } => {
      const da = byKey.get(dayKey);
      if (!da) return { fill: "", outline: "" }; // no-data cell → rdp defaults

      // 1. Status fill colour
      let fill = "";
      switch (da.state) {
        case "available":
          fill = "bg-status-available text-status-available-foreground";
          break;
        case "busy": {
          const lifted =
            hoveredBookingId != null && da.bookingId === hoveredBookingId;
          fill = cn(
            lifted ? "bg-status-booked/70" : "bg-status-booked",
            "text-status-booked-foreground",
          );
          break;
        }
        case "out-of-window":
          fill = "bg-status-unavailable text-status-unavailable-foreground";
          break;
        case "past":
          fill = "text-muted-foreground opacity-40";
          break;
        default:
          // too-far (not produced in current month windows) → neutral
          fill = "bg-status-unavailable text-status-unavailable-foreground";
      }

      // 2. Status fill merge — contiguous same-status days share one rounded pill
      //    (available block, unavailable block, or same-booking busy run); the
      //    leading rounded-none also resets the base rounded-lg so interiors are
      //    square and the fill reads as one continuous shape.
      const fillEdge = fillEdgeMap.get(dayKey);
      const fillRounding = fillEdge
        ? runFillRounding(fillEdge, "horizontal")
        : "";

      // 3. Selection outline (committed) — each selected day gets its own closed
      //    clay box, independent of neighbors. During a REMOVE paint drag,
      //    painted-selected cells render a distinct "pending removal" treatment
      //    (dashed/faded) so removal is visible mid-drag instead of only at commit.
      let outline = "";
      const pendingRemove =
        previewMode === "remove" &&
        previewDays.has(dayKey) &&
        state.selectedDays.has(dayKey);
      if (state.selectedDays.has(dayKey)) {
        outline = pendingRemove
          ? "border-2 border-dashed border-brand/50 rounded-lg"
          : "border-2 border-brand rounded-lg";
      } else if (previewMode !== "remove" && previewDays.size > 0) {
        // 4. Live ADD preview outline — dashed/half variant for cells not yet
        //    committed-selected (only reached when there is no committed outline).
        const prevEdge = previewEdgeMap.get(dayKey);
        if (prevEdge)
          outline = "border-2 border-dashed border-brand/60 rounded-lg";
      }

      return { fill: cn(fill, fillRounding), outline };
    },
    [
      byKey,
      fillEdgeMap,
      previewEdgeMap,
      state.selectedDays,
      previewDays,
      previewMode,
      hoveredBookingId,
    ],
  );

  // ── Modifiers (selected + focusedWeek only — fills moved into DayButton) ───
  const modifiers = useMemo(
    () => ({
      focusedWeek: (date: Date) =>
        focusedWeekDays.includes(format(date, "yyyy-MM-dd")),
      selected: (date: Date) =>
        state.selectedDays.has(format(date, "yyyy-MM-dd")),
    }),
    [state.selectedDays, focusedWeekDays],
  );

  // focusedWeek: SUBTLE band — a muted underline on the day number, low visual
  // priority, so it never overrides the status fills behind the button.
  const modifiersClassNames = {
    focusedWeek:
      "[&>button]:underline [&>button]:decoration-muted-foreground/60 [&>button]:underline-offset-4",
  };

  // Base layout for the custom DayButton (re-include needed utilities from the
  // calendar.tsx primitive MINUS hover:bg-muted, which would wash the fills).
  // The status fill / outline is composed on top via visualClassName.
  const dayButtonBase = useMemo(
    () =>
      cn(
        "relative inline-flex size-9 items-center justify-center rounded-lg outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-3",
        "disabled:pointer-events-none disabled:opacity-40 aria-selected:opacity-100",
      ),
    [],
  );

  // ── Click handler (range / single / none — preserved behavior) ────────────
  const handleDayClick = useCallback(
    (date: Date) => {
      const k = format(date, "yyyy-MM-dd");

      switch (capabilities.daySelection) {
        case "none":
          return;

        case "single":
          if (isDisabled(date)) return;
          clearDays();
          toggleDay(k);
          break;

        case "range": {
          // A click on a booked cell inspects the booking without disturbing
          // the range selection.
          if (cellKind(k) === "booked") {
            const bid = byKey.get(k)?.bookingId;
            if (bid) inspectBooking(bid);
            return;
          }
          if (isDisabled(date)) return;
          if (state.anchorDay == null || state.selectedDays.size !== 1) {
            clearDays();
            toggleDay(k);
          } else {
            setRange(state.anchorDay, k);
          }
          break;
        }

        case "multi":
          // multi uses pointer paint-toggle (handled in pointer handlers); the
          // click path is suppressed after a paint. A bare click is routed
          // through onCellPointerDown/up, so do nothing here.
          return;
      }
    },
    [
      capabilities.daySelection,
      state.anchorDay,
      state.selectedDays,
      isDisabled,
      cellKind,
      byKey,
      inspectBooking,
      clearDays,
      toggleDay,
      setRange,
    ],
  );

  // ── Pointer-drag plumbing ─────────────────────────────────────────────────
  const dragRef = useRef<DragState | null>(null);
  // Suppresses the click that fires after pointerUp (paint commits there).
  const suppressNextClick = useRef(false);
  // Holds the current global end handler so we can remove it on unmount.
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  const isMulti = capabilities.daySelection === "multi";
  const isRange = capabilities.daySelection === "range";

  // Contiguous calendar range anchor→current (inclusive, direction-agnostic via
  // daysInRange), filtered to selectable cells only. Booked/past/no-data days
  // within the span are skipped so the range "flows over" them like a text
  // selection skipping unselectable spans. Used for both the multi paint
  // preview and its commit.
  const selectableRange = useCallback(
    (anchorKey: string, currentKey: string): string[] =>
      daysInRange(anchorKey, currentKey).filter(
        (k) => cellKind(k) === "selectable",
      ),
    [cellKind],
  );

  const installEndHandler = useCallback((endHandler: () => void) => {
    // Remove any stale listener from a previous drag that didn't fire.
    if (dragEndHandlerRef.current) {
      window.removeEventListener("pointerup", dragEndHandlerRef.current);
      window.removeEventListener("pointercancel", dragEndHandlerRef.current);
      dragEndHandlerRef.current = null;
    }
    dragEndHandlerRef.current = endHandler;
    window.addEventListener("pointerup", endHandler, { once: true });
    window.addEventListener("pointercancel", endHandler, { once: true });
  }, []);

  // pointerdown on a cell — routes by mode + kind.
  const handleCellPointerDown = useCallback(
    (dayKey: string, kind: CellKind, bookingId?: string) => {
      if (kind === "inert") return;

      // Booked cell → inspect (both multi and range), no selection change.
      if (kind === "booked") {
        if (bookingId) inspectBooking(bookingId);
        // No drag started; suppress the synthetic click too (multi) so the
        // click handler doesn't run.
        if (isMulti) suppressNextClick.current = true;
        return;
      }

      if (isMulti) {
        // PAINT-TOGGLE: mode from the anchor cell's current selection state.
        const mode: "add" | "remove" = state.selectedDays.has(dayKey)
          ? "remove"
          : "add";
        dragRef.current = {
          active: true,
          variant: "paint",
          anchorKey: dayKey,
          currentKey: dayKey,
          paintMode: mode,
          didDrag: false,
        };
        suppressNextClick.current = false;
        setPreviewDays(new Set([dayKey]));
        setPreviewMode(mode);

        const endHandler = () => {
          dragEndHandlerRef.current = null;
          const drag = dragRef.current;
          if (!drag) return;
          setPreviewDays(new Set<string>());
          setPreviewMode(null);
          suppressNextClick.current = true; // tap OR drag both commit here
          // Recompute the contiguous anchor→current range, filtered to
          // selectable cells (matches the live preview), and commit it.
          paintDays(
            selectableRange(drag.anchorKey, drag.currentKey),
            drag.paintMode,
          );
          dragRef.current = null;
        };
        installEndHandler(endHandler);
        return;
      }

      if (isRange) {
        // Contiguous-range drag anchor→current (existing behavior).
        dragRef.current = {
          active: true,
          variant: "range",
          anchorKey: dayKey,
          currentKey: dayKey,
          paintMode: "add",
          didDrag: false,
        };
        suppressNextClick.current = false;
        setPreviewDays(new Set([dayKey]));

        const endHandler = () => {
          dragEndHandlerRef.current = null;
          const drag = dragRef.current;
          if (!drag) return;
          setPreviewDays(new Set<string>());
          if (drag.didDrag) {
            suppressNextClick.current = true;
            clearDays();
            setRange(drag.anchorKey, drag.currentKey);
          }
          dragRef.current = null;
        };
        installEndHandler(endHandler);
        return;
      }
      // single / none: no drag; click handler owns it.
    },
    [
      isMulti,
      isRange,
      state.selectedDays,
      inspectBooking,
      paintDays,
      clearDays,
      setRange,
      installEndHandler,
      selectableRange,
    ],
  );

  // pointerenter on a cell during a drag — extends paint set / range, and
  // tracks booking hover.
  const handleCellPointerEnter = useCallback(
    (dayKey: string, kind: CellKind, bookingId?: string) => {
      // Booking hover lift (independent of any drag).
      if (kind === "booked" && bookingId != null) {
        setHoveredBookingId(bookingId);
      }

      const drag = dragRef.current;
      if (!drag?.active) return;
      if (dayKey === drag.currentKey) return;
      drag.currentKey = dayKey;
      drag.didDrag = true;

      if (drag.variant === "paint") {
        // Contiguous range anchor→current, filtered to selectable cells
        // (text-selection semantics): booked/past/no-data days the span flows
        // over are skipped.
        setPreviewDays(new Set(selectableRange(drag.anchorKey, dayKey)));
      } else {
        // Contiguous range anchor→current.
        setPreviewDays(new Set(daysInRange(drag.anchorKey, dayKey)));
      }
    },
    [selectableRange],
  );

  const handleCellPointerLeave = useCallback((kind: CellKind) => {
    if (kind === "booked") setHoveredBookingId(null);
  }, []);

  // Clean up any dangling global listener on unmount.
  useEffect(() => {
    return () => {
      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }
    };
  }, []);

  // Wrap onDayClick to honour the drag-suppress flag.
  const handleDayClickWithDragGuard = useCallback(
    (date: Date) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      handleDayClick(date);
    },
    [handleDayClick],
  );

  // ── Custom DayButton — default renderer for ALL modes ─────────────────────
  const CustomDayButton = useCallback(
    (props: DayButtonProps) => {
      const k = format(props.day.date, "yyyy-MM-dd");
      const availability = byKey.get(k);
      const kind = cellKind(k);
      const { fill, outline } = cellClasses(k);
      return (
        <SchedulerDayButton
          {...props}
          className={dayButtonBase}
          dayKey={k}
          availability={availability}
          kind={kind}
          fillClassName={fill}
          outlineClassName={outline}
          onCellPointerDown={handleCellPointerDown}
          onCellPointerEnter={handleCellPointerEnter}
          onCellPointerLeave={handleCellPointerLeave}
        />
      );
    },
    [
      byKey,
      cellKind,
      cellClasses,
      dayButtonBase,
      handleCellPointerDown,
      handleCellPointerEnter,
      handleCellPointerLeave,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn("flex flex-col gap-4 select-none", className)}
      // Subtree-level guard: cancel any native dragstart (the day number text or
      // the cell) so a pointer-drag selection is never hijacked into an HTML5
      // image/file drag. The per-button guard misses drags that begin on the
      // text node itself.
      onDragStart={(e) => e.preventDefault()}
    >
      <Calendar
        mode="single"
        month={userMonth}
        onMonthChange={setUserMonth}
        selected={undefined}
        onDayClick={handleDayClickWithDragGuard}
        disabled={isDisabled}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        className="border-border rounded-lg border"
        // Slot overrides:
        //  selected — neutralize rdp's default bg-primary (solid black on commit);
        //    our selection is the overlay outline, modifier kept only for aria.
        //  today    — the primitive's default puts a 1px BORDER on the cell, which
        //    both shifts that one button ~1px AND reads as a stray outline. Drop
        //    the box entirely; mark today with a bold number only (no layout cost,
        //    no stray border).
        classNames={{
          selected: "",
          today: "[&>button]:font-extrabold",
        }}
        components={{ DayButton: CustomDayButton }}
      />
    </div>
  );
}
