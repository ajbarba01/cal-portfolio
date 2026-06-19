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
import { Surface } from "@/components/ui/surface";
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
  /** Pre-select an existing time slot on mount (e.g. rescheduling). */
  initialSlot?: { dayKey: string; minute: number };
  /**
   * Render the outer container as an emphasis Surface (clay shimmer ring). Use
   * only when the Scheduler is the OUTERMOST panel — e.g. the account read-only
   * calendar. Leave off when it already sits inside a ringed card (the booking
   * step shell) → plain, so rings never nest.
   */
  outlined?: boolean;
  /**
   * Render the scheduler with NO outer card chrome (no border/background) — for
   * use INSIDE a step shell that already provides the card, so the calendar reads
   * as flush content rather than a nested card. Mutually exclusive with `outlined`.
   */
  bare?: boolean;
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
  initialSlot,
  outlined = false,
  bare = false,
  children,
}: SchedulerProps) {
  const todayKey = denverDayKey(data.now);

  const selection = useScheduleSelection({ todayKey, initialSlot });

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

  if (bare) {
    return (
      <SchedulerProvider value={value}>
        <div className="min-w-0">{children}</div>
      </SchedulerProvider>
    );
  }
  return (
    <SchedulerProvider value={value}>
      {/* Outlined = the Scheduler is the outermost panel (account read-only
          calendar) → shimmer. Otherwise it sits inside a ringed step shell →
          plain, so rings never nest. */}
      <Surface variant={outlined ? "emphasis" : "plain"} className="p-4">
        {children}
      </Surface>
    </SchedulerProvider>
  );
}
