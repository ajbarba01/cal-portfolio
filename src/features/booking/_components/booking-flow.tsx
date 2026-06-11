"use client";

/**
 * BookingFlow — the shared stepped-booking layout behind the three booking
 * surfaces (public self-serve, admin on-behalf create, owner/admin edit).
 *
 * Extracted from the three near-identical client components (SP5a Task 10). The
 * three already share the `useBookingScheduler` substrate + the primitives, but
 * each DUPLICATED the stepped JSX. This component owns the parts that were
 * byte-identical: the page container and the Step-1 calendar section (mode →
 * week-slots vs month-range, the loading/error states, the Scheduler composition
 * with its month grid / legend / timeline / details panel, and the month-range
 * summary + invalid-range line).
 *
 * Everything that DIVERGED per surface stays with the caller as a React-node
 * slot, so this extraction is a pure MOVE with no behavior change:
 *   - `header`        — auth/returnTo banner (public) or admin identity header.
 *   - `petSection`    — Step 2 (caller owns the `petAware` wrapper + body:
 *                       public's not-ready fallback, admin's always-on
 *                       PetAssignment, edit's paid-lock notice).
 *   - `detailsSection`— Step 3 quantities (caller owns edit's paid-lock hiding).
 *   - `extraSection`  — Step 4 (public/admin recurring controls, edit's notes).
 *   - `receipt`       — the gated QuotePanel block (public's auth gating +
 *                       GatePanels, admin/edit's footer + warnings + deltas).
 *
 * Presentational only: it holds no booking state or logic. The load-bearing
 * booking GATES live in the cores/hooks; this component just renders them.
 */

import type { ReactNode } from "react";
import { Scheduler } from "./scheduler";
import type { SchedulerData } from "./scheduler";
import type { SchedulerCapabilities } from "../schedule-capabilities";
import { ErrorState } from "@/components/feedback/error-state";
import type { BookingMode } from "../use-booking-scheduler";
import type { validateStayRange } from "../calendar-model";
import type { ScheduleSelectionState } from "../schedule-selection";
import type { DateRange } from "@/components/ui/calendar";

/**
 * The common subset of the three hooks' returns that the shared calendar
 * section consumes. Each client passes this straight through from its hook.
 */
export interface BookingFlowState {
  mode: BookingMode;
  windowsLoading: boolean;
  windowsError: string | null;
  capabilities: SchedulerCapabilities;
  schedulerData: SchedulerData;
  range: DateRange | undefined;
  stay: ReturnType<typeof validateStayRange> | null;
  onSelectionChange: (state: ScheduleSelectionState) => void;
  /** Pre-select an existing slot on mount (edit only; week-slots). */
  initialSlot?: { dayKey: string; minute: number };
}

export interface BookingFlowProps {
  flow: BookingFlowState;
  /**
   * Intro copy above the month-range calendar. Differs by one word between the
   * surfaces ("your stay" public/edit vs "the stay" admin), so the caller owns it.
   */
  monthRangeIntro: ReactNode;
  /** Step 0 — auth/returnTo banner (public) or admin identity header. */
  header?: ReactNode;
  /** Step 2 — pet assignment block (caller owns the petAware wrapper + body). */
  petSection?: ReactNode;
  /** Step 3 — quantities/details block. */
  detailsSection?: ReactNode;
  /** Step 4 — recurring controls (public/admin) or notes (edit). */
  extraSection?: ReactNode;
  /** The gated price receipt + primary CTA block. */
  receipt: ReactNode;
}

export function BookingFlow({
  flow,
  monthRangeIntro,
  header,
  petSection,
  detailsSection,
  extraSection,
  receipt,
}: BookingFlowProps) {
  const {
    mode,
    windowsLoading,
    windowsError,
    capabilities,
    schedulerData,
    range,
    stay,
    onSelectionChange,
    initialSlot,
  } = flow;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-12">
      {header}

      {/* 1. Calendar */}
      <section aria-labelledby="cal-heading">
        <h2
          id="cal-heading"
          className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          1. {mode === "month-range" ? "Pick your dates" : "Pick a day"}
        </h2>
        {windowsError && (
          <ErrorState
            title="Couldn't load availability"
            message={windowsError}
          />
        )}
        {windowsLoading && (
          <p className="text-muted-foreground text-sm">Loading availability…</p>
        )}
        {!windowsLoading && !windowsError && mode === "week-slots" && (
          <Scheduler
            capabilities={capabilities}
            data={schedulerData}
            onSelectionChange={onSelectionChange}
            initialSlot={initialSlot}
          >
            <Scheduler.MonthGrid />
            {/* Legend sits directly under the month (B2), before the timeline. */}
            <Scheduler.Legend className="mt-5" />
            <div className="mt-6">
              <Scheduler.DayTimeline />
            </div>
            <Scheduler.BookingDetailsPanel />
          </Scheduler>
        )}
        {!windowsLoading && !windowsError && mode === "month-range" && (
          <>
            <p className="text-muted-foreground mb-3 text-sm">
              {monthRangeIntro}
            </p>
            <Scheduler
              capabilities={capabilities}
              data={schedulerData}
              onSelectionChange={onSelectionChange}
            >
              <Scheduler.MonthGrid />
              {/* Fixed-height summary row: nights live inline (never a new line)
                    and the Clear-dates slot is always reserved, so selecting a
                    range changes only text/opacity — never layout height. */}
              <div className="mt-5 flex h-8 items-center justify-between gap-3 overflow-hidden">
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <Scheduler.SelectionSummary />
                  {stay?.ok && (
                    <span className="text-muted-foreground text-sm">
                      · {stay.nights} night{stay.nights === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <Scheduler.ClearDates />
              </div>
              <Scheduler.Legend className="mt-5" />
              <Scheduler.BookingDetailsPanel />
            </Scheduler>
            {/* Reserved-height line for the invalid-range message only. */}
            <p className="mt-2 min-h-5 text-sm" aria-live="polite">
              {range?.from && range?.to && stay && !stay.ok && (
                <span className="text-destructive">{stay.reason}</span>
              )}
            </p>
          </>
        )}
      </section>

      {petSection}
      {detailsSection}
      {extraSection}
      {receipt}
    </div>
  );
}
