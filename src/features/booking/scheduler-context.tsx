"use client";

/**
 * SchedulerContext — shared state carrier for the compound <Scheduler.*> tree.
 *
 * Deliberately minimal: carries only selection + capabilities now. Future tasks
 * will extend SchedulerContextValue with data and mutation callbacks.
 *
 * Pattern: the future <Scheduler> root computes `value` via useScheduleSelection
 * + chosen capabilities, then renders <SchedulerProvider value={value}>.
 * Leaf components call useScheduler() to read state without prop-drilling.
 */

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { UseScheduleSelectionResult } from "./use-schedule-selection";
import type { SchedulerCapabilities } from "./schedule-capabilities";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SchedulerContextValue {
  selection: UseScheduleSelectionResult;
  capabilities: SchedulerCapabilities;
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
