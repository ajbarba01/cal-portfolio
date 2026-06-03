"use client";

/**
 * BookingCalendar — the one generalizable calendar surface. A mode-discriminated
 * presentational component: it renders, it does not decide. The caller owns all
 * business state (derived slots, day classification, selection); this component
 * only dispatches to the matching grid.
 *
 * Modes:
 *  - `week-slots`  — time-bounded services (walk / check_in / training).
 *  - `month-range` — house_sitting check-in/out date range.
 *
 * `manage-windows` (admin drag-create/resize/delete) lands in Phase 23 as a third
 * arm of this union.
 */

import { WeekGrid, type WeekGridProps } from "./week-grid";
import { MonthGrid, type MonthGridProps } from "./month-grid";

export type BookingCalendarProps =
  | ({ mode: "week-slots" } & WeekGridProps)
  | ({ mode: "month-range" } & MonthGridProps);

export function BookingCalendar(props: BookingCalendarProps) {
  if (props.mode === "week-slots") {
    const { mode: _mode, ...rest } = props;
    void _mode;
    return <WeekGrid {...rest} />;
  }
  const { mode: _mode, ...rest } = props;
  void _mode;
  return <MonthGrid {...rest} />;
}
