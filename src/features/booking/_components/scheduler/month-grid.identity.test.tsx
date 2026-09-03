// @vitest-environment jsdom

/**
 * Regression guard for the range second-click bug.
 *
 * BUG: react-day-picker remounts every day cell whenever the component handed to
 * its `components.DayButton` slot changes REFERENCE. MonthGrid's DayButton used
 * to close over volatile hover/preview state (previewDays / previewMode /
 * hoveredBookingId via cellClasses), so each hover during the two-click range
 * flow churned the DayButton identity → rdp remounted the grid → a second click
 * that straddled a remount never synthesized a `click`, so onDayClick was lost
 * ("takes a few clicks").
 *
 * FIX: the DayButton handed to rdp is now a STABLE module-level component reading
 * volatile state from a MonthGrid-local context. This test arms a boundary (first
 * click) and hovers another cell (preview update), asserting at each step that
 * the volatile state DID change — the dotted preview appears, then grows — and
 * that the day-button DOM node captured before either update is STILL the same
 * instance. Preserved identity is only evidence of the fix while the state
 * around it is moving; asserting the node alone would keep passing if the two
 * gestures stopped doing anything at all.
 *
 * NOTE: jsdom has no real pointer-event synthesis, so this test verifies the
 * STRUCTURAL invariant (node identity preserved across preview updates), not the
 * end-to-end "second click commits" behavior. The latter still needs a manual
 * sweep.
 */

import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MonthGrid } from "./month-grid";
import {
  SchedulerProvider,
  type SchedulerContextValue,
  type SchedulerData,
} from "@/features/booking/scheduler-context";
import { useScheduleSelection } from "@/features/booking/use-schedule-selection";
import { BOOK_HOUSE_SITTING_CAPABILITIES } from "@/features/booking/schedule-capabilities";
import type { BookingRuleSettings } from "@/features/booking/availability";

afterEach(cleanup);

// Fixed "now" mid-June 2025 so mid-month days are neither past nor beyond the
// advance window — they classify "available" → selectable in range mode.
const NOW = new Date("2025-06-12T12:00:00Z");

const RULES: BookingRuleSettings = {
  bookingOpenMinute: 390,
  bookingCloseMinute: 1320,
  minLeadTimeHours: 24,
  hardMaxAdvanceDays: 90,
};

// House-sitting availability is driven by `overnightNights`: a day classifies
// "available" (→ selectable in range mode) only if its key is in this set and it
// clears lead-time / too-far. Seed mid/late-June 2025 so the grid has enabled
// cells to click and hover.
const AVAILABLE_NIGHTS = new Set<string>(
  Array.from({ length: 14 }, (_, i) => {
    const day = String(16 + i).padStart(2, "0");
    return `2025-06-${day}`;
  }),
);

const DATA: SchedulerData = {
  overnightNights: AVAILABLE_NIGHTS,
  windows: [],
  busy: [],
  busyResident: [],
  rules: RULES,
  now: NOW,
};

/** Mounts MonthGrid in range mode with the real selection hook. */
function Harness() {
  const selection = useScheduleSelection({ todayKey: "2025-06-12" });
  const value: SchedulerContextValue = {
    selection,
    capabilities: BOOK_HOUSE_SITTING_CAPABILITIES,
    data: DATA,
    callbacks: {},
  };
  return (
    <SchedulerProvider value={value}>
      <MonthGrid />
    </SchedulerProvider>
  );
}

function setup() {
  const { container } = render(<Harness />);
  const cell = (dayKey: string): HTMLButtonElement => {
    const el = container.querySelector<HTMLButtonElement>(
      `[data-day-key="${dayKey}"]`,
    );
    if (!el) throw new Error(`no month cell for ${dayKey}`);
    return el;
  };
  /**
   * The days currently carrying the dotted "would-be range" outline. The
   * preview is an overlay span rather than a modifier, so it is read off the
   * dashed border class the outline tier uses (solid = committed).
   */
  const previewed = (): string[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-day-key] span[class*="border-dashed"]',
      ),
    ).map(
      (span) => span.closest<HTMLElement>("[data-day-key]")!.dataset.dayKey!,
    );
  return { container, cell, previewed };
}

describe("MonthGrid range second-click identity", () => {
  it("grows the preview across a hover without remounting the grid", () => {
    const { container, cell, previewed } = setup();

    const first = cell("2025-06-16");
    expect(previewed()).toEqual([]);

    // Arm a boundary on the first cell: this calls setPreviewDays (and clearDays
    // + setPendingBoundary), the exact volatile-state update path that used to
    // churn the DayButton identity and remount the grid.
    fireEvent.click(first);
    expect(previewed()).toEqual(["2025-06-16"]);

    // Hover a later cell: in range mode with a boundary armed, pointerenter
    // calls setPreviewDays again to grow the dotted preview to the cursor.
    fireEvent.pointerEnter(cell("2025-06-19"));
    expect(previewed()).toEqual([
      "2025-06-16",
      "2025-06-17",
      "2025-06-18",
      "2025-06-19",
    ]);

    // Both updates landed, and the node captured before either one is still the
    // SAME instance attached to the document — proof the grid re-rendered
    // without remounting.
    expect(document.body.contains(first)).toBe(true);
    expect(container.contains(first)).toBe(true);
    expect(cell("2025-06-16")).toBe(first);
  });
});
