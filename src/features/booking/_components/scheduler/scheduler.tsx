"use client";

/**
 * Scheduler — compound-component root for the scheduler UI (Layer 3).
 *
 * Owns the selection state (via useScheduleSelection) and builds the context
 * value consumed by all nested <Scheduler.*> parts. Children declare their own
 * composition; this root is layout-neutral.
 *
 * Layer separation contract:
 *   Layer 1 (data/server) and Layer 2 (pure model + hook) are injected via
 *   props — this component is purely presentational glue.
 *
 * Styling: wireframe / token-only. A design pass later swaps classNames;
 * logic (Layers 1–2) must never change for that reason.
 */

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useScheduleSelection } from "@/features/booking/use-schedule-selection";
import { SchedulerProvider } from "@/features/booking/scheduler-context";
import { denverDayKey } from "@/features/booking/availability";
import type { SchedulerCapabilities } from "@/features/booking/schedule-capabilities";
import type {
  SchedulerData,
  SchedulerCallbacks,
  SchedulerContextValue,
} from "@/features/booking/scheduler-context";
import type { ScheduleSelectionState } from "@/features/booking/schedule-selection";

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────

export interface SchedulerProps {
  capabilities: SchedulerCapabilities;
  data: SchedulerData;
  callbacks?: SchedulerCallbacks;
  onSelectionChange?: (state: ScheduleSelectionState) => void;
  children: ReactNode;
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function Scheduler({
  capabilities,
  data,
  callbacks,
  onSelectionChange,
  children,
}: SchedulerProps) {
  const todayKey = denverDayKey(data.now);

  const selection = useScheduleSelection({ todayKey });

  useEffect(() => {
    onSelectionChange?.(selection.state);
  }, [selection.state, onSelectionChange]);

  const value = useMemo<SchedulerContextValue>(
    () => ({
      selection,
      capabilities,
      data,
      callbacks: callbacks ?? {},
    }),
    // selection is a memoized object from useScheduleSelection — its identity
    // changes only when state or derived values change (dispatchers are stable
    // useCallback refs). This useMemo therefore recomputes only on real
    // selection changes, not on every render.
    [selection, capabilities, data, callbacks],
  );

  return (
    <SchedulerProvider value={value}>
      <div className="bg-card border-border rounded-xl border p-4">
        {children}
      </div>
    </SchedulerProvider>
  );
}
