"use client";

/**
 * Scheduler.WeekGrid — when2meet-style intraday time grid (Layer 3).
 *
 * Renders nothing when capabilities.intraday === "none".
 *
 * MODES
 * -----
 * "free-paint"     (admin, editable): pointer-drag paints a rectangular region
 *   (day-range × slot-range). During an active drag a local `previewCells` Set
 *   drives the painted state; on pointerup the rectangle is committed via
 *   extendGridDrag. Multiple paints accumulate additively.
 * "fixed-interval" (booking, not editable): each non-past, non-busy slot is a
 *   selectable button; clicking selects exactly ONE slot via beginGridDrag
 *   (which resets gridDraft to that single cell).
 *
 * DRAG MECHANICS — matches MonthGrid convention
 * -----------------------------------------------
 * No setPointerCapture (would block onPointerEnter on siblings). One-shot
 * global window pointerup/pointercancel listener; unmount cleanup; didDrag
 * threshold. Transient drag preview lives in local React state; model commit
 * on pointerup only.
 *
 * CELL CLASSIFICATION (precedence)
 * ---------------------------------
 * 1. past      — isPast(dayKey) OR slot start < data.now
 * 2. busy      — any data.busy range overlaps [start, end) via overlapsHalfOpen
 * 3. draft     — cellId ∈ gridDraft (committed)
 * 4. preview   — cellId ∈ previewCells (live drag, before commit)
 * 5. available — fitsWindow({startsAt, endsAt}, data.windows)
 * 6. empty
 *
 * TOKEN MAP (wireframe — no bespoke colors)
 * -----------------------------------------
 * past      → text-muted-foreground opacity-40
 * busy      → bg-destructive/10 text-destructive
 * draft     → bg-primary text-primary-foreground          (committed)
 * preview   → bg-primary/40 text-primary-foreground       (live drag preview)
 * available → bg-secondary text-secondary-foreground
 * empty     → bg-muted
 *
 * HOVER / INTERACTION AFFORDANCES
 * --------------------------------
 * Interactive non-draft cells: hover:ring-2 hover:ring-inset hover:ring-ring
 * Draft (committed) cells: bg-primary survives hover (hover:bg-primary/80)
 * Preview cells: bg-primary/40 survives hover
 * Non-interactive (past/busy): cursor-default, no hover ring
 */

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { cn } from "@/lib/utils";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMidnight, fitsWindow } from "@/features/booking/availability";
import { overlapsHalfOpen } from "@/features/booking/calendar-model";
import type { TimeRange } from "@/features/booking/availability";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format minutes-since-midnight as "H:MM" wall time. */
function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
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
 * (inclusive on both ends in both dimensions).
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

type CellClass = "past" | "busy" | "draft" | "preview" | "available" | "empty";

interface CellInfo {
  cellId: string;
  dayKey: string;
  minute: number;
  cls: CellClass;
  interactive: boolean;
}

function classifyCell(args: {
  dayKey: string;
  minute: number;
  start: number;
  end: number;
  interval: number;
  isPastDay: boolean;
  nowMs: number;
  busy: TimeRange[];
  windows: TimeRange[];
  gridDraft: Set<string>;
  previewCells: Set<string>;
  intraday: "free-paint" | "fixed-interval";
  editable: boolean;
}): { cls: CellClass; interactive: boolean } {
  const {
    dayKey,
    minute,
    start,
    end,
    interval,
    isPastDay,
    nowMs,
    busy,
    windows,
    gridDraft,
    previewCells,
    intraday,
    editable,
  } = args;
  const cellId = `${dayKey}@${minute}`;
  const slotRange: TimeRange = {
    startsAt: new Date(start),
    endsAt: new Date(end),
  };

  // 1. past
  if (isPastDay || start < nowMs) {
    return { cls: "past", interactive: false };
  }

  // 2. busy
  if (busy.some((b) => overlapsHalfOpen(slotRange, b))) {
    return { cls: "busy", interactive: false };
  }

  // 3. draft (committed)
  if (gridDraft.has(cellId)) {
    const interactive =
      intraday === "fixed-interval" || (intraday === "free-paint" && editable);
    return { cls: "draft", interactive };
  }

  // 4. preview (live drag, before commit)
  if (previewCells.has(cellId)) {
    const interactive =
      intraday === "fixed-interval" || (intraday === "free-paint" && editable);
    return { cls: "preview", interactive };
  }

  // 5. available
  if (fitsWindow(slotRange, windows)) {
    const interactive =
      intraday === "fixed-interval" || (intraday === "free-paint" && editable);
    return { cls: "available", interactive };
  }

  // 6. empty — free-paint can paint empty cells; fixed-interval cannot
  const interactive = intraday === "free-paint" && editable;
  // Suppress TS "unused variable" for interval (kept in signature for future)
  void interval;
  return { cls: "empty", interactive };
}

function cellTokens(cls: CellClass, interactive: boolean): string {
  const hoverRing =
    interactive && cls !== "draft" && cls !== "preview"
      ? "hover:ring-2 hover:ring-inset hover:ring-ring"
      : "";

  switch (cls) {
    case "past":
      return "text-muted-foreground opacity-40";
    case "busy":
      return "bg-destructive/10 text-destructive";
    case "draft":
      // Selected fill survives hover
      return cn(
        "bg-primary text-primary-foreground",
        interactive && "hover:bg-primary/80",
      );
    case "preview":
      // Semi-transparent — visually distinct from committed draft
      return cn(
        "bg-primary/40 text-primary-foreground",
        interactive && "hover:bg-primary/50",
      );
    case "available":
      return cn("bg-secondary text-secondary-foreground", hoverRing);
    case "empty":
    default:
      return cn("bg-muted", hoverRing);
  }
}

// ---------------------------------------------------------------------------
// Drag state shape
// ---------------------------------------------------------------------------

interface DragState {
  active: boolean;
  startCellId: string;
  didDrag: boolean;
}

// ---------------------------------------------------------------------------
// WeekGrid (the actual component — all hooks unconditional)
// ---------------------------------------------------------------------------

function WeekGridInner({ className }: { className?: string }) {
  const { selection, capabilities, data } = useScheduler();
  const { state, isPast, beginGridDrag, extendGridDrag, focusedWeekDays } =
    selection;

  const interval = capabilities.intervalMinutes ?? 30;
  const { bookingOpenMinute, bookingCloseMinute } = data.rules;

  const slots = useMemo(
    () => buildSlots(bookingOpenMinute, bookingCloseMinute, interval),
    [bookingOpenMinute, bookingCloseMinute, interval],
  );

  // Local preview for free-paint drag
  const [previewCells, setPreviewCells] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Classify all cells — rows indexed as [dayIdx][slotIdx]
  const cells = useMemo<CellInfo[][]>(() => {
    const intraday = capabilities.intraday as "free-paint" | "fixed-interval";
    const editable = capabilities.editable;
    return focusedWeekDays.map((dayKey) => {
      const midnight = denverMidnight(dayKey).getTime();
      const isPastDay = isPast(dayKey);
      return slots.map((m) => {
        const start = midnight + m * 60_000;
        const end = start + interval * 60_000;
        const { cls, interactive } = classifyCell({
          dayKey,
          minute: m,
          start,
          end,
          interval,
          isPastDay,
          nowMs: data.now.getTime(),
          busy: data.busy,
          windows: data.windows,
          gridDraft: state.gridDraft,
          previewCells,
          intraday,
          editable,
        });
        return {
          cellId: `${dayKey}@${m}`,
          dayKey,
          minute: m,
          cls,
          interactive,
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
    state.gridDraft,
    previewCells,
    capabilities.intraday,
    capabilities.editable,
  ]);

  // ── Drag refs ────────────────────────────────────────────────────────────
  const dragRef = useRef<DragState | null>(null);
  const suppressNextClick = useRef(false);
  const dragEndHandlerRef = useRef<(() => void) | null>(null);

  // ── Pointer handlers (free-paint only) ───────────────────────────────────
  const handlePointerDown = useCallback(
    (cellId: string) => {
      if (capabilities.intraday !== "free-paint" || !capabilities.editable)
        return;

      dragRef.current = { active: true, startCellId: cellId, didDrag: false };
      suppressNextClick.current = false;

      if (dragEndHandlerRef.current) {
        window.removeEventListener("pointerup", dragEndHandlerRef.current);
        window.removeEventListener("pointercancel", dragEndHandlerRef.current);
        dragEndHandlerRef.current = null;
      }

      const endHandler = () => {
        dragEndHandlerRef.current = null;
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.didDrag) {
          suppressNextClick.current = true;
          // Capture preview synchronously before clearing
          setPreviewCells((prev) => {
            if (prev.size > 0) {
              extendGridDrag([...prev]);
            }
            return new Set<string>();
          });
        }
        dragRef.current = null;
      };

      dragEndHandlerRef.current = endHandler;
      window.addEventListener("pointerup", endHandler, { once: true });
      window.addEventListener("pointercancel", endHandler, { once: true });
    },
    [capabilities.intraday, capabilities.editable, extendGridDrag],
  );

  const handlePointerEnter = useCallback(
    (cellId: string) => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      drag.didDrag = true;
      const rect = buildRectangle(
        drag.startCellId,
        cellId,
        focusedWeekDays,
        slots,
      );
      setPreviewCells(rect);
    },
    [focusedWeekDays, slots],
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

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (cellId: string) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (capabilities.intraday === "free-paint" && capabilities.editable) {
        extendGridDrag([cellId]);
      } else if (capabilities.intraday === "fixed-interval") {
        beginGridDrag(cellId);
      }
    },
    [
      capabilities.intraday,
      capabilities.editable,
      extendGridDrag,
      beginGridDrag,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn("overflow-x-auto", className)}>
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
        {focusedWeekDays.map((dayKey) => (
          <div
            key={dayKey}
            className="border-border border-b py-1 text-center text-xs font-medium"
          >
            {dayLabel(dayKey)}
          </div>
        ))}

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
              // aria-pressed: true for committed draft; preview is transient
              const pressed = cell.cls === "draft";

              return (
                <button
                  key={cell.cellId}
                  type="button"
                  disabled={!cell.interactive}
                  aria-pressed={pressed}
                  aria-label={`${dayLabel(cell.dayKey)} ${formatMinutes(m)}`}
                  style={{ touchAction: "none", userSelect: "none" }}
                  className={cn(
                    "border-border h-7 w-full border-b text-xs",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                    cellTokens(cell.cls, cell.interactive),
                    cell.interactive ? "cursor-pointer" : "cursor-default",
                  )}
                  onPointerDown={() => {
                    if (cell.interactive) handlePointerDown(cell.cellId);
                  }}
                  onPointerEnter={() => handlePointerEnter(cell.cellId)}
                  onClick={() => {
                    if (cell.interactive) handleClick(cell.cellId);
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}
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
