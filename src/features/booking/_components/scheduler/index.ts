/**
 * Scheduler compound namespace.
 *
 * Consumers import a single name and compose parts:
 *   import { Scheduler } from "@/features/booking/_components/scheduler";
 *   <Scheduler capabilities={...} data={...}>
 *     <Scheduler.SelectionSummary />
 *   </Scheduler>
 *
 * Later tasks extend Object.assign with MonthGrid, DayPanel, etc.
 */

import { Scheduler as SchedulerRoot } from "./scheduler";
import { SelectionSummary } from "./selection-summary";
import { MonthGrid } from "./month-grid";
import { Legend } from "./legend";
import { BookingDetailsPanel } from "./booking-details-panel";
import { ClearDates } from "./clear-dates";
import { DayTimeline } from "./day-timeline";
import { DayPainter } from "./day-painter";

export const Scheduler = Object.assign(SchedulerRoot, {
  SelectionSummary,
  MonthGrid,
  Legend,
  BookingDetailsPanel,
  ClearDates,
  DayTimeline,
  DayPainter,
});

// Re-export prop types consumers need when wiring data/callbacks from outside.
export type { SchedulerProps } from "./scheduler";
export type {
  SchedulerData,
  SchedulerCallbacks,
  BusyBlock,
} from "@/features/booking/scheduler-context";
