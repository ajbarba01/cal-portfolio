"use client";

/**
 * Scheduler.ClearDates — Layer-3 reset control for selection. Wires the EXISTING
 * Layer-2 `selection.clearDays()` (no logic added). Renders only when something
 * is selected, so it never shows as dead chrome. Fixes the booking-month dead-end
 * where an editable:false range could only grow (scheduler-deferred-followups).
 */

import { useScheduler } from "@/features/booking/scheduler-context";
import { cn } from "@/lib/utils";

export function ClearDates({ className }: { className?: string }) {
  const { selection } = useScheduler();
  if (selection.state.selectedDays.size === 0) return null;
  return (
    <button
      type="button"
      onClick={selection.clearDays}
      className={cn(
        "text-brand-strong hover:text-brand focus-visible:ring-ring border-border hover:bg-sidebar-accent rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none active:translate-y-px",
        className,
      )}
    >
      Clear dates
    </button>
  );
}
