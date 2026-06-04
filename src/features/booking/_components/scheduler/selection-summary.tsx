"use client";

/**
 * SelectionSummary — collapsed run summary for the current scheduler selection.
 *
 * Reads summaryLabel from context (e.g. "Jun 1, 3–5") and renders it as
 * accessible status text. Screen readers hear selection changes via aria-live.
 *
 * Wireframe / token-only styling. No business logic — all derivation lives in
 * useScheduleSelection (collapseRuns).
 */

import { useScheduler } from "@/features/booking/scheduler-context";

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function SelectionSummary() {
  const { selection } = useScheduler();
  const label = selection.summaryLabel;

  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className="text-muted-foreground text-sm"
    >
      {label !== "" ? label : "No days selected"}
    </p>
  );
}
