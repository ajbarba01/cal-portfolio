"use client";

/**
 * Scheduler.WeekGrid — when2meet-style intraday time grid (Layer 3).
 *
 * Renders nothing when capabilities.intraday === "none".
 *
 * Reads all state from SchedulerContext (via useScheduler) and dispatches back
 * into it. Owns NO selection logic — the run-edge math lives in grid-runs.ts.
 * Owns NO colours — token-only (status fills + primary outline; no hex).
 *
 * VISUAL LANGUAGE (token-only, no bespoke colors) — mirrors MonthGrid
 * Each cell composes INDEPENDENT layers so status and selection no longer fight
 * (selection used to be a solid fill that hid the slot's status):
 *
 *   1. STATUS FILL (background of the slot):
 *        available → bg-status-available  / text-status-available-foreground
 *        busy      → bg-status-booked      / text-status-booked-foreground
 *        empty     → bg-status-unavailable / text-status-unavailable-foreground
 *        past      → text-muted-foreground opacity-40 (no loud fill)
 *   2. BOOKING MERGE: busy slots of the SAME bookingId merge VERTICALLY within a
 *        day COLUMN into one rounded blue pill (runFillRounding, "vertical").
 *        Hovering any slot of a booking lifts ALL its slots lighter
 *        (bg-status-booked/70) via transient hoveredBookingId state (CSS :hover
 *        can't span sibling cells).
 *   3. SELECTION OUTLINE: drafted slots draw a merged charcoal outline
 *        (border-primary) joining VERTICALLY-adjacent drafted slots in the same
 *        day column into one rounded block (runOutlineClasses, "vertical").
 *        Interior shared edges show only left+right borders (two straight lines,
 *        no curve); top/bottom caps round. Live drag preview uses the same
 *        mechanism in a dashed/half variant; a REMOVE drag uses a distinct
 *        pending-removal treatment.
 *   Status fill and selection outline COMPOSE — a slot can be available AND
 *   selection-outlined at once.
 *
 * CELL ROLES (pointer routing)
 *   paint   — free-paint admin selectable slot (available/empty, not past/busy)
 *   select  — fixed-interval bookable slot (available, not past/busy)
 *   inspect — busy slot carrying a bookingId → click opens the booking
 *   inert   — past, or empty in fixed-interval (disabled)
 *   Only `inert` cells are `disabled`.
 *
 * MODES
 *   "free-paint"     (admin, editable): PAINT-TOGGLE over a rectangle marquee.
 *     pointerdown sets mode = gridDraft.has(start) ? "remove" : "add"; dragging
 *     previews the day×slot rectangle (buildRectangle); pointerup commits the
 *     rectangle (filtered to paintable cells) via paintCells. A single tap is
 *     the same path on one cell.
 *   "fixed-interval" (booking, not editable): clicking a select slot picks
 *     exactly ONE slot via beginGridDrag; busy slots are inspectable.
 *
 * DRAG MECHANICS — matches MonthGrid convention
 *   No setPointerCapture (would block onPointerEnter on siblings). One-shot
 *   global window pointerup/pointercancel listener; unmount cleanup; didDrag
 *   threshold. Transient drag preview lives in local React state; model commit
 *   on pointerup only. suppressNextClick swallows the click after a drag.
 */

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMidnight, fitsWindow } from "@/features/booking/availability";
import { overlapsHalfOpen } from "@/features/booking/calendar-model";
import {
  runEdges,
  runFillRounding,
  runOutlineClasses,
} from "@/features/booking/grid-runs";
import type { RunEdge } from "@/features/booking/grid-runs";
import type { TimeRange } from "@/features/booking/availability";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Format minutes-since-midnight as "H:MM" wall time. */
function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

/** Parse "YYYY-MM-DD" to a UTC ordinal (ms). */
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

/** Short column header label: "Mon 1" in Denver. */
function dayLabel(dayKey: string): string {
  const d = denverMidnight(dayKey);
  const weekday = d.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
  });
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    day: "numeric",
  });
  return `${weekday} ${day}`;
}

/** Week-range label, e.g. "Jun 7 – 13" or cross-month "Jun 28 – Jul 4". */
function weekRangeLabel(firstKey: string, lastKey: string): string {
  const a = denverMidnight(firstKey);
  const b = denverMidnight(lastKey);
  const start = a.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
  });
  const sameMonth =
    a.toLocaleDateString("en-US", {
      timeZone: "America/Denver",
      month: "short",
    }) ===
    b.toLocaleDateString("en-US", {
      timeZone: "America/Denver",
      month: "short",
    });
  const end = b.toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    ...(sameMonth ? {} : { month: "short" }),
    day: "numeric",
  });
  return `${start} – ${end}`;
}

/** Build ordered list of slot start-minutes given open/close/interval. */
function buildSlots(
  openMinute: number,
  closeMinute: number,
  interval: number,
): number[] {
  const slots: number[] = [];
  for (let m = openMinute; m + interval <= closeMinute; m += interval) {
    slots.push(m);
  }
  return slots;
}

/**
 * Compute the rectangle of cell ids between two anchor cell ids
 * (inclusive on both ends in both dimensions). The deliberate day×slot region
 * marquee — NOT a free pointer-path.
 */
function buildRectangle(
  startCellId: string,
  endCellId: string,
  focusedWeekDays: string[],
  slots: number[],
): Set<string> {
  const [startDay, startMinStr] = startCellId.split("@");
  const [endDay, endMinStr] = endCellId.split("@");
  const startDayIdx = focusedWeekDays.indexOf(startDay);
  const endDayIdx = focusedWeekDays.indexOf(endDay);
  if (startDayIdx === -1 || endDayIdx === -1) return new Set();

  const startMin = parseInt(startMinStr, 10);
  const endMin = parseInt(endMinStr, 10);
  const minDayIdx = Math.min(startDayIdx, endDayIdx);
  const maxDayIdx = Math.max(startDayIdx, endDayIdx);
  const minMin = Math.min(startMin, endMin);
  const maxMin = Math.max(startMin, endMin);

  const rect = new Set<string>();
  for (let di = minDayIdx; di <= maxDayIdx; di++) {
    for (const m of slots) {
      if (m >= minMin && m <= maxMin) {
        rect.add(`${focusedWeekDays[di]}@${m}`);
      }
    }
  }
  return rect;
}

// ---------------------------------------------------------------------------
// Cell classification
// ---------------------------------------------------------------------------

/** Base status driving the FILL (independent of selection/preview). */
type CellStatus = "past" | "busy" | "available" | "empty";

/** Per-cell role for pointer routing. */
type CellRole = "paint" | "select" | "inspect" | "inert";

interface CellInfo {
  cellId: string;
  dayKey: string;
  minute: number;
  status: CellStatus;
  role: CellRole;
  /** Owning booking id when status === "busy". */
  bookingId: string | null;
}

function classifyCell(args: {
  start: number;
  end: number;
  isPastDay: boolean;
  nowMs: number;
  busy: { id: string; startsAt: Date; endsAt: Date }[];
  windows: TimeRange[];
  intraday: "free-paint" | "fixed-interval";
  editable: boolean;
}): { status: CellStatus; role: CellRole; bookingId: string | null } {
  const { start, end, isPastDay, nowMs, busy, windows, intraday, editable } =
    args;
  const slotRange: TimeRange = {
    startsAt: new Date(start),
    endsAt: new Date(end),
  };

  // 1. past — inert (no interaction)
  if (isPastDay || start < nowMs) {
    return { status: "past", role: "inert", bookingId: null };
  }

  // 2. busy — capture the owning booking; inspectable, never paint/select
  const block = busy.find((b) => overlapsHalfOpen(slotRange, b));
  if (block) {
    return { status: "busy", role: "inspect", bookingId: block.id };
  }

  // 3. available — fits an open window
  if (fitsWindow(slotRange, windows)) {
    const role: CellRole =
      intraday === "fixed-interval" ? "select" : editable ? "paint" : "inert";
    return { status: "available", role, bookingId: null };
  }

  // 4. empty — free-paint admin can paint; fixed-interval cannot
  const role: CellRole =
    intraday === "free-paint" && editable ? "paint" : "inert";
  return { status: "empty", role, bookingId: null };
}

// ---------------------------------------------------------------------------
// Drag state shape
// ---------------------------------------------------------------------------

interface DragState {
  active: boolean;
  startCellId: string;
  /** Latest cell the pointer entered; drives the commit rectangle on pointerup. */
  currentCellId: string;
  mode: "add" | "remove";
  didDrag: boolean;
}

// ---------------------------------------------------------------------------
// WeekCell — memoized single slot button
// ---------------------------------------------------------------------------
//
// Extracted + React.memo'd so a drag tick only re-renders the cells whose
// visualClassName actually changed (the marquee edge), not all ~200 buttons.
// Parent passes stable callbacks + the per-cell visual string; cell objects are
// stable across a drag (they only recompute when classification deps change).
// This is what closes the responsiveness gap with MonthGrid (~42 cells).

interface WeekCellProps {
  cell: CellInfo;
  pressed: boolean | undefined;
  visualClassName: string;
  onCellPointerDown: (cell: CellInfo) => void;
  onCellPointerEnter: (cell: CellInfo) => void;
  onCellPointerLeave: (cell: CellInfo) => void;
  onCellClick: (cell: CellInfo) => void;
}

const WeekCell = React.memo(function WeekCell({
  cell,
  pressed,
  visualClassName,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellClick,
}: WeekCellProps) {
  const interactive = cell.role !== "inert";
  return (
    <button
      type="button"
      disabled={cell.role === "inert"}
      aria-pressed={pressed}
      aria-label={`${dayLabel(cell.dayKey)} ${formatMinutes(cell.minute)}`}
      title={cell.role === "inspect" ? "Booked" : undefined}
      style={{ touchAction: "none", userSelect: "none" }}
      className={cn(
        "border-border h-7 w-full border-b border-l text-xs",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        visualClassName,
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      onPointerDown={() => onCellPointerDown(cell)}
      onPointerEnter={() => onCellPointerEnter(cell)}
      onPointerLeave={() => onCellPointerLeave(cell)}
      onClick={() => onCellClick(cell)}
    />
  );
});

// ---------------------------------------------------------------------------
// WeekGrid (the actual component — all hooks unconditional)
// ---------------------------------------------------------------------------

function WeekGridInner({ className }: { className?: string }) {
  const { capabilities, data, selection } = useScheduler();
  const {
    state,
    isPast,
    beginGridDrag,
    paintCells,
    inspectBooking,
    setFocusedWeek,
    focusedWeekDays,
  } = selection;

  const interval = capabilities.intervalMinutes ?? 30;
  const { bookingOpenMinute, bookingCloseMinute } = data.rules;

  const slots = useMemo(
    () => buildSlots(bookingOpenMinute, bookingCloseMinute, interval),
    [bookingOpenMinute, bookingCloseMinute, interval],
  );

  // Live drag preview (free-paint only); cleared on commit.
  const [previewCells, setPreviewCells] = useState<Set<string>>(
    () => new Set<string>(),
  );
  // Reactive mirror of the active paint mode for the add/remove visual.
  const [previewMode, setPreviewMode] = useState<"add" | "remove" | null>(null);
  // Transient hovered-booking id — lifts ALL slots of one booking together.
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);

  // ── Classify all cells — indexed [dayIdx][slotIdx] ─────────────────────────
  const cells = useMemo<CellInfo[][]>(() => {
    const intraday = capabilities.intraday as "free-paint" | "fixed-interval";
    const editable = capabilities.editable;
    const nowMs = data.now.getTime();
    return focusedWeekDays.map((dayKey) => {
      const midnight = denverMidnight(dayKey).getTime();
      const isPastDay = isPast(dayKey);
      return slots.map((m) => {
        const start = midnight + m * 60_000;
        const end = start + interval * 60_000;
        const { status, role, bookingId } = classifyCell({
          start,
          end,
          isPastDay,
          nowMs,
          busy: data.busy,
          windows: data.windows,
          intraday,
          editable,
        });
        return {
          cellId: `${dayKey}@${m}`,
          dayKey,
          minute: m,
          status,
          role,
          bookingId,
        };
      });
    });
  }, [
    focusedWeekDays,
    slots,
    interval,
    isPast,
    data.now,
    data.busy,
    data.windows,
    capabilities.intraday,
    capabilities.editable,
  ]);

  // Flat lookup so the run maps can resolve a cell's booking id by cellId.
  const byCellId = useMemo(() => {
    const map = new Map<string, CellInfo>();
    for (const col of cells) for (const c of col) map.set(c.cellId, c);
    return map;
  }, [cells]);

  // ── Per-column run-edge maps (computed once per render, VERTICAL axis) ──────
  // Each column's ordered cellIds run top→bottom (slot order). Selection +
  // booking maps MUST NOT depend on previewCells/hoveredBookingId so hover/
  // preview re-renders don't rebuild them (the drag hot path).
  const columnIds = useMemo(
    () => focusedWeekDays.map((dayKey) => slots.map((m) => `${dayKey}@${m}`)),
    [focusedWeekDays, slots],
  );

  const selEdgeMap = useMemo(() => {
    const map = new Map<string, RunEdge>();
    for (const ids of columnIds) {
      const e = runEdges(ids, (id) => (state.gridDraft.has(id) ? "sel" : null));
      for (const [k, v] of e) map.set(k, v);
    }
    return map;
  }, [columnIds, state.gridDraft]);

  const bookEdgeMap = useMemo(() => {
    const map = new Map<string, RunEdge>();
    for (const ids of columnIds) {
      const e = runEdges(ids, (id) => byCellId.get(id)?.bookingId ?? null);
      for (const [k, v] of e) map.set(k, v);
    }
    return map;
  }, [columnIds, byCellId]);

  const previewEdgeMap = useMemo(() => {
    const map = new Map<string, RunEdge>();
    for (const ids of columnIds) {
      const e = runEdges(ids, (id) => (previewCells.has(id) ? "p" : null));
      for (const [k, v] of e) map.set(k, v);
    }
    return map;
  }, [columnIds, previewCells]);

  // ── Per-cell composed visuals ──────────────────────────────────────────────
  const visualFor = useCallback(
    (cell: CellInfo): string => {
      // 1. Status fill
      let fill = "";
      switch (cell.status) {
        case "available":
          fill = "bg-status-available text-status-available-foreground";
          break;
        case "busy": {
          const lifted =
            hoveredBookingId != null && cell.bookingId === hoveredBookingId;
          fill = cn(
            lifted ? "bg-status-booked/70" : "bg-status-booked",
            "text-status-booked-foreground",
          );
          break;
        }
        case "past":
          fill = "text-muted-foreground opacity-40";
          break;
        case "empty":
        default:
          fill = "bg-status-unavailable text-status-unavailable-foreground";
      }

      // 2. Booking fill merge (busy slots of same bookingId → one rounded pill)
      let bookingRounding = "";
      if (cell.status === "busy") {
        const bookEdge = bookEdgeMap.get(cell.cellId);
        if (bookEdge) bookingRounding = runFillRounding(bookEdge, "vertical");
      }

      // 3. Selection outline (committed) — merged vertically. During a REMOVE
      //    paint drag, drafted cells in the preview render a distinct pending-
      //    removal treatment (dashed/faded) so removal is visible mid-drag.
      let selectionOutline = "";
      const selEdge = selEdgeMap.get(cell.cellId);
      const pendingRemove =
        previewMode === "remove" &&
        previewCells.has(cell.cellId) &&
        state.gridDraft.has(cell.cellId);
      if (selEdge) {
        selectionOutline = cn(
          runOutlineClasses(selEdge, "vertical"),
          pendingRemove ? "border-dashed border-primary/40" : "border-primary",
        );
      }

      // 4. Live ADD preview outline — dashed/half variant over previewCells for
      //    cells not yet drafted (avoids double border on add).
      let previewOutline = "";
      if (previewMode !== "remove" && previewCells.size > 0 && !selEdge) {
        const prevEdge = previewEdgeMap.get(cell.cellId);
        if (prevEdge) {
          previewOutline = cn(
            runOutlineClasses(prevEdge, "vertical"),
            "border-dashed border-primary/50",
          );
        }
      }

      return cn(fill, bookingRounding, selectionOutline, previewOutline);
    },
    [
      selEdgeMap,
      bookEdgeMap,
      previewEdgeMap,
      state.gridDraft,
      previewCells,
      previewMode,
      hoveredBookingId,
    ],
  );

  // ── Drag refs ──────────────────────────────────────────────────────────────
  const dragRef = useRef<DragState | null>(null);
  const suppressNextClick = useRef(false);
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  const installEndHandler = useCallback((endHandler: () => void) => {
    if (dragEndHandlerRef.current) {
      window.removeEventListener("pointerup", dragEndHandlerRef.current);
      window.removeEventListener("pointercancel", dragEndHandlerRef.current);
      dragEndHandlerRef.current = null;
    }
    dragEndHandlerRef.current = endHandler;
    window.addEventListener("pointerup", endHandler, { once: true });
    window.addEventListener("pointercancel", endHandler, { once: true });
  }, []);

  /** Filter a rectangle to cells that may actually be painted (role === "paint"). */
  const paintableOf = useCallback(
    (ids: Iterable<string>): string[] => {
      const out: string[] = [];
      for (const id of ids) {
        if (byCellId.get(id)?.role === "paint") out.push(id);
      }
      return out;
    },
    [byCellId],
  );

  // ── Pointer handlers (free-paint only) ─────────────────────────────────────
  const handlePointerDown = useCallback(
    (cellId: string) => {
      if (capabilities.intraday !== "free-paint" || !capabilities.editable)
        return;

      const mode: "add" | "remove" = state.gridDraft.has(cellId)
        ? "remove"
        : "add";
      dragRef.current = {
        active: true,
        startCellId: cellId,
        currentCellId: cellId,
        mode,
        didDrag: false,
      };
      suppressNextClick.current = false;
      setPreviewCells(new Set([cellId]));
      setPreviewMode(mode);

      const endHandler = () => {
        dragEndHandlerRef.current = null;
        const drag = dragRef.current;
        if (!drag) return;
        suppressNextClick.current = true; // tap OR drag both commit here
        // Recompute the marquee from drag refs and commit OUTSIDE any setState
        // updater — dispatching the reducer inside setPreviewCells' updater runs
        // during render and trips "Cannot update a component while rendering".
        const rect = buildRectangle(
          drag.startCellId,
          drag.currentCellId,
          focusedWeekDays,
          slots,
        );
        const paintable = paintableOf(rect);
        if (paintable.length > 0) paintCells(paintable, drag.mode);
        setPreviewCells(new Set<string>());
        setPreviewMode(null);
        dragRef.current = null;
      };
      installEndHandler(endHandler);
    },
    [
      capabilities.intraday,
      capabilities.editable,
      state.gridDraft,
      focusedWeekDays,
      slots,
      paintCells,
      paintableOf,
      installEndHandler,
    ],
  );

  const handlePointerEnter = useCallback(
    (cell: CellInfo) => {
      // Booking hover lift (independent of any drag).
      if (cell.status === "busy" && cell.bookingId != null) {
        setHoveredBookingId(cell.bookingId);
      }
      const drag = dragRef.current;
      if (!drag?.active) return;
      if (cell.cellId === drag.currentCellId) return;
      drag.currentCellId = cell.cellId;
      if (cell.cellId !== drag.startCellId) drag.didDrag = true;
      const rect = buildRectangle(
        drag.startCellId,
        cell.cellId,
        focusedWeekDays,
        slots,
      );
      // Filter to paintable cells so busy/past cells inside the marquee don't
      // flash a dashed preview mid-drag (parity with MonthGrid).
      setPreviewCells(new Set(paintableOf(rect)));
    },
    [focusedWeekDays, slots, paintableOf],
  );

  const handlePointerLeave = useCallback((cell: CellInfo) => {
    if (cell.status === "busy") setHoveredBookingId(null);
  }, []);

  // Stable per-cell pointerdown wrapper passed to the memoized WeekCell. (The
  // click wrapper is declared after handleClick to avoid a TDZ reference.)
  const onCellPointerDown = useCallback(
    (cell: CellInfo) => {
      if (cell.role === "paint") handlePointerDown(cell.cellId);
    },
    [handlePointerDown],
  );

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }
    };
  }, []);

  // ── Click handler ───────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (cell: CellInfo) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      // Busy → inspect (both modes), never select.
      if (cell.role === "inspect") {
        if (cell.bookingId) inspectBooking(cell.bookingId);
        return;
      }
      // fixed-interval: single-select. (free-paint commits via pointer handlers.)
      if (
        capabilities.intraday === "fixed-interval" &&
        cell.role === "select"
      ) {
        beginGridDrag(cell.cellId);
      }
    },
    [capabilities.intraday, beginGridDrag, inspectBooking],
  );

  // Stable per-cell click wrapper (declared here so handleClick is initialized).
  const onCellClick = useCallback(
    (cell: CellInfo) => {
      if (cell.role !== "inert") handleClick(cell);
    },
    [handleClick],
  );

  // ── Week navigation ─────────────────────────────────────────────────────────
  const firstKey = focusedWeekDays[0];
  const lastKey = focusedWeekDays[focusedWeekDays.length - 1];

  const goToWeek = useCallback(
    (deltaDays: number) => {
      setFocusedWeek(utcToKey(keyToUtc(firstKey) + deltaDays * MS_PER_DAY));
    },
    [firstKey, setFocusedWeek],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Week-navigation header */}
      <div className="flex items-center justify-between">
        {capabilities.weekNavigable ? (
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => goToWeek(-7)}
            className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : (
          <span className="size-8" aria-hidden="true" />
        )}

        <span className="text-sm font-medium">
          {weekRangeLabel(firstKey, lastKey)}
        </span>

        {capabilities.weekNavigable ? (
          <button
            type="button"
            aria-label="Next week"
            onClick={() => goToWeek(7)}
            className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight className="size-4" />
          </button>
        ) : (
          <span className="size-8" aria-hidden="true" />
        )}
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-120"
          style={{
            gridTemplateColumns: `4rem repeat(${focusedWeekDays.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Header row — time-label spacer + day columns */}
          <div
            className="border-border border-b py-1 pr-2 text-right text-xs font-medium"
            aria-hidden="true"
          />
          {focusedWeekDays.map((dayKey) => {
            // Bold day headers for selectedDays (links month selection → week).
            // Intentional divergence from MonthGrid's focused-week underline —
            // do NOT "unify" them.
            const isSelectedDay = state.selectedDays.has(dayKey);
            return (
              <div
                key={dayKey}
                className={cn(
                  "border-border border-b border-l py-1 text-center text-xs",
                  isSelectedDay
                    ? "text-foreground font-bold"
                    : "text-muted-foreground font-medium",
                )}
              >
                {dayLabel(dayKey)}
              </div>
            );
          })}

          {/* Slot rows */}
          {slots.map((m, slotIdx) => (
            <React.Fragment key={m}>
              {/* Time label */}
              <div
                className="text-muted-foreground border-border flex items-center justify-end border-b py-0.5 pr-2 text-xs"
                aria-hidden="true"
              >
                {formatMinutes(m)}
              </div>

              {/* Day cells */}
              {focusedWeekDays.map((_dayKey, dayIdx) => {
                const cell = cells[dayIdx][slotIdx];
                const pressed =
                  cell.role === "select" || cell.role === "paint"
                    ? state.gridDraft.has(cell.cellId)
                    : undefined;

                return (
                  <WeekCell
                    key={cell.cellId}
                    cell={cell}
                    pressed={pressed}
                    visualClassName={visualFor(cell)}
                    onCellPointerDown={onCellPointerDown}
                    onCellPointerEnter={handlePointerEnter}
                    onCellPointerLeave={handlePointerLeave}
                    onCellClick={onCellClick}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — gate on intraday capability
// ---------------------------------------------------------------------------

export function WeekGrid({ className }: { className?: string }) {
  const { capabilities } = useScheduler();
  if (capabilities.intraday === "none") return null;
  return <WeekGridInner className={className} />;
}
