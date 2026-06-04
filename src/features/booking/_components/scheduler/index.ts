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
import { DayPanel } from "./day-panel";
import { WeekGrid } from "./week-grid";

export const Scheduler = Object.assign(SchedulerRoot, {
  SelectionSummary,
  MonthGrid,
  DayPanel,
  WeekGrid,
});

// Re-export prop types consumers need when wiring data/callbacks from outside.
export type { SchedulerProps } from "./scheduler";
export type {
  SchedulerData,
  SchedulerCallbacks,
} from "@/features/booking/scheduler-context";
