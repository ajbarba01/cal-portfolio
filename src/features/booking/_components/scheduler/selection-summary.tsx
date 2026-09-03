"use client";

/**
 * SelectionSummary — collapsed run summary for the current scheduler selection.
 *
 * Reads summaryLabel from context (e.g. "Jun 1, 3–5") and renders it as
 * accessible status text. Screen readers hear selection changes via aria-live.
 *
 * A multi-day editor leads with the count. Its gestures take and drop whole runs
 * at a time, so how many days a keyboard extend just swept is the fact the
 * operator needs before which ones they were — and it is the only reading of the
 * selection that reaches someone working inside the grid, where the count in the
 * editor's heading below is out of view and not announced.
 *
 * Wireframe / token-only styling. No business logic — all derivation lives in
 * useScheduleSelection (collapseRuns).
 */

import { useScheduler } from "@/features/booking/scheduler-context";

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function SelectionSummary() {
  const { selection, capabilities } = useScheduler();
  const label = selection.summaryLabel;
  const count = selection.state.selectedDays.size;
  const leadsWithCount = capabilities.daySelection === "multi" && count > 1;

  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className="text-muted-foreground text-sm"
    >
      {leadsWithCount
        ? `${count} days selected · ${label}`
        : label !== ""
          ? label
          : "No days selected"}
    </p>
  );
}
