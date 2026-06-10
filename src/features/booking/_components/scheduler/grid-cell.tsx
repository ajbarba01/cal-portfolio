"use client";

/**
 * GridCell — presentational cell primitive for scheduler time grids.
 *
 * Renders ONE cell as a <button> given props for state classification,
 * run-edge visual classes, and pointer handlers. Extracted verbatim from
 * WeekGrid's WeekCell memo component; class strings are byte-identical.
 *
 * Used by: WeekGrid.
 *
 * NOT used by MonthGrid (its SchedulerDayButton is a react-day-picker
 * DayButtonProps override with children, ...buttonProps spread, and an
 * inset outline overlay — structurally incompatible with this primitive).
 * NOT used by DayTimeline (no per-cell grid; uses a timeline/slider).
 *
 * Pixel-identity guarantee: this component emits the exact same className
 * as WeekGrid's inlined WeekCell for every cell state. See use-cell-selection.ts
 * for the shared drag-plumbing hook.
 */

import React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (re-exported so callers don't import from a grid-internal file)
// ---------------------------------------------------------------------------

/** Base status driving the FILL (independent of selection/preview). */
export type CellStatus = "past" | "busy" | "available" | "empty";

/** Per-cell role for pointer routing. */
export type CellRole = "paint" | "select" | "inspect" | "inert";

export interface GridCellInfo {
  cellId: string;
  dayKey: string;
  minute: number;
  status: CellStatus;
  role: CellRole;
  /** Owning booking id when status === "busy". */
  bookingId: string | null;
}

// ---------------------------------------------------------------------------
// GridCellProps
// ---------------------------------------------------------------------------

export interface GridCellProps {
  cell: GridCellInfo;
  pressed: boolean | undefined;
  /** Fully-composed visual className string (status fill + run rounding + outlines). */
  visualClassName: string;
  /** Short day label used in the aria-label, e.g. "Mon 1". */
  dayLabel: string;
  onCellPointerDown: (cell: GridCellInfo) => void;
  onCellPointerEnter: (cell: GridCellInfo) => void;
  onCellPointerLeave: (cell: GridCellInfo) => void;
  onCellClick: (cell: GridCellInfo) => void;
}

// ---------------------------------------------------------------------------
// GridCell — memoized single slot button
// ---------------------------------------------------------------------------
//
// Memoized so a drag tick only re-renders the cells whose visualClassName
// actually changed (the marquee edge), not all ~200 buttons. Parent passes
// stable callbacks + the per-cell visual string.
//
// Class strings are verbatim from WeekGrid's WeekCell — do not clean up,
// rename, or reorder them.

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

export const GridCell = React.memo(function GridCell({
  cell,
  pressed,
  visualClassName,
  dayLabel,
  onCellPointerDown,
  onCellPointerEnter,
  onCellPointerLeave,
  onCellClick,
}: GridCellProps) {
  const interactive = cell.role !== "inert";
  // Dotted hover affordance on selectable slots only (paint/select) — same
  // three-tier language as the month grid (dotted hover / dashed preview /
  // solid commit). Booked slots already have the booking-lift hover.
  const canSelect = cell.role === "paint" || cell.role === "select";
  const hoverClass = canSelect
    ? "hover:outline-2 hover:outline-dotted hover:outline-brand/60 hover:-outline-offset-2"
    : "";
  return (
    <button
      type="button"
      disabled={cell.role === "inert"}
      aria-pressed={pressed}
      aria-label={`${dayLabel} ${formatMinutes(cell.minute)}`}
      title={cell.role === "inspect" ? "Booked" : undefined}
      style={{ touchAction: "none", userSelect: "none" }}
      // Suppress native HTML5 drag so a pointer-drag paint isn't hijacked.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={cn(
        "border-border relative h-7 w-full border-b border-l text-xs",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        visualClassName,
        hoverClass,
        interactive ? "cursor-pointer" : "cursor-default",
      )}
      onPointerDown={() => onCellPointerDown(cell)}
      onPointerEnter={() => onCellPointerEnter(cell)}
      onPointerLeave={() => onCellPointerLeave(cell)}
      onClick={() => onCellClick(cell)}
    />
  );
});
