"use client";

/**
 * SchedulerContext — shared state carrier for the compound <Scheduler.*> tree.
 *
 * Carries selection, capabilities, data (server-fetched availability), and
 * optional mutation callbacks (admin only; empty object for read-only views).
 *
 * Pattern: the <Scheduler> root computes `value` via useScheduleSelection
 * + chosen capabilities, then renders <SchedulerProvider value={value}>.
 * Leaf components call useScheduler() to read state without prop-drilling.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { UseScheduleSelectionResult } from "./use-schedule-selection";
import type { SchedulerCapabilities } from "./schedule-capabilities";
import type { TimeRange, BookingRuleSettings } from "./availability";
import type {
  AvailabilityResult,
  SetWindowUnavailableResult,
  SetOvernightNightsResult,
  SettingsResult,
} from "@/features/admin";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** A busy time range that carries booking identity, so the grid can group
 *  contiguous cells of the same booking and open it on click. */
export interface BusyBlock extends TimeRange {
  /** Stable id of the owning booking (admin: real booking id; public: a synthesized stable key). */
  id: string;
  /** Optional short label for grid hover/title (e.g. client name). Omitted in identity-free public contexts. */
  label?: string;
}

export interface SchedulerData {
  overnightNights: Set<string>; // bookable nights (dayKeys)
  windows: TimeRange[]; // intraday availability windows (for WeekGrid)
  busy: BusyBlock[]; // active intraday bookings (for WeekGrid non-paintable cells)
  busyResident: BusyBlock[]; // resident bookings that block whole days
  rules: BookingRuleSettings;
  now: Date;
  /** Day-keys where the current client already has a booking (public view). */
  myBookings?: Set<string>;
  /** Day-keys that carry a premium (holiday) surcharge (admin only). */
  premiumDays?: Set<string>;
  /**
   * Day-keys that have at least one intraday availability window (admin
   * availability painter). MonthGrid renders these green even when the day is
   * not an overnight night — so a day reads "available" if it's overnight-bookable
   * OR has open walk hours. Undefined elsewhere → no change.
   */
  windowDays?: Set<string>;
  /**
   * Day-keys to render de-emphasized (hatched) — the search-greys context cue
   * in the admin Bookings hub. When undefined (public booking + availability),
   * MonthGrid renders identically to before. Keyed the same way MonthGrid keys
   * its cells (format(date, "yyyy-MM-dd")).
   */
  dimmedDays?: Set<string>;
  /**
   * Minutes of drive buffer for the viewer's own candidate; hourly only.
   * Set by `hourlySchedulerData` from the booking page's viewer buffer so the
   * day-timeline can read it without re-deriving. Undefined when unused (house
   * sitting or when no buffer applies).
   */
  viewerDriveBufferMin?: number;
}

export interface SchedulerCallbacks {
  createWindowsBatch?: (input: {
    dayKeys: string[];
    openMinute: number;
    closeMinute: number;
  }) => Promise<AvailabilityResult>;
  setWindowUnavailable?: (input: {
    dayKey: string;
    fromMinute: number;
    toMinute: number;
  }) => Promise<SetWindowUnavailableResult>;
  setOvernightNightsBatch?: (input: {
    nights: string[];
    on: boolean;
  }) => Promise<SetOvernightNightsResult>;
  setPremiumDaysBatch?: (input: {
    dayKeys: string[];
    on: boolean;
  }) => Promise<SettingsResult>;
}

export interface SchedulerContextValue {
  selection: UseScheduleSelectionResult;
  capabilities: SchedulerCapabilities;
  data: SchedulerData;
  callbacks: SchedulerCallbacks; // empty object when not editable
}

// ──────────────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────────────

export const SchedulerContext = createContext<SchedulerContextValue | null>(
  null,
);

// ──────────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────────

export function SchedulerProvider({
  value,
  children,
}: {
  value: SchedulerContextValue;
  children: ReactNode;
}) {
  return (
    <SchedulerContext.Provider value={value}>
      {children}
    </SchedulerContext.Provider>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Consumer hook
// ──────────────────────────────────────────────────────────────────────────────

export function useScheduler(): SchedulerContextValue {
  const ctx = useContext(SchedulerContext);
  if (ctx === null) {
    throw new Error("useScheduler must be used within a SchedulerProvider");
  }
  return ctx;
}
