// @vitest-environment jsdom

/**
 * The multi-day selection model, end to end through a real grid.
 *
 * Which actions a gesture becomes is unit-tested in use-schedule-selection; what
 * this pins is the wiring the operator actually touches: that a plain press
 * REPLACES the selection rather than adding to it, that a drag commits the run
 * it swept, that shift keeps measuring from the anchor even after a backwards
 * range, that ctrl/cmd flips one day, and that the keyboard reaches all of it.
 * Those are the paths a regression would quietly break — the calendar would
 * still look right while writing availability to the wrong days.
 */

import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MonthGrid } from "./month-grid";
import {
  SchedulerProvider,
  type SchedulerContextValue,
  type SchedulerData,
} from "@/features/booking/scheduler-context";
import { useScheduleSelection } from "@/features/booking/use-schedule-selection";
import { ADMIN_CAPABILITIES } from "@/features/booking/schedule-capabilities";
import type { BookingRuleSettings } from "@/features/booking/availability";

afterEach(cleanup);

/** Noon in Denver, mid-June 2025 — later days in the month are all future. */
const NOW = new Date("2025-06-12T18:00:00Z");

const RULES: BookingRuleSettings = {
  bookingOpenMinute: 480,
  bookingCloseMinute: 1080,
  minLeadTimeHours: 0,
  hardMaxAdvanceDays: 365,
};

const DATA: SchedulerData = {
  overnightNights: new Set<string>(),
  windows: [],
  busy: [],
  busyResident: [],
  rules: RULES,
  now: NOW,
};

/** `now`/`todayKey` move together; a test that overrides one overrides both. */
interface HarnessProps {
  month?: Date;
  onMonthChange?: (m: Date) => void;
  now?: Date;
  todayKey?: string;
}

function Harness({
  now = NOW,
  todayKey = "2025-06-12",
  ...gridProps
}: HarnessProps) {
  const selection = useScheduleSelection({ todayKey });
  const value: SchedulerContextValue = {
    selection,
    capabilities: ADMIN_CAPABILITIES,
    data: { ...DATA, now },
    callbacks: {},
  };
  return (
    <SchedulerProvider value={value}>
      <MonthGrid {...gridProps} />
    </SchedulerProvider>
  );
}

const KEY = (day: number) => `2025-06-${String(day).padStart(2, "0")}`;

function setup(props: HarnessProps = {}) {
  const { container } = render(<Harness {...props} />);
  const cellFor = (dayKey: string): HTMLButtonElement => {
    const el = container.querySelector<HTMLButtonElement>(
      `[data-day-key="${dayKey}"]`,
    );
    if (!el) throw new Error(`no month cell for ${dayKey}`);
    return el;
  };
  const cell = (day: number): HTMLButtonElement => cellFor(KEY(day));
  /** The days currently carrying the committed selection, as day numbers. */
  const selected = (): number[] =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-day-key][aria-pressed="true"]',
      ),
    ).map((el) => Number(el.dataset.dayKey!.slice(-2)));
  const caption = (): string =>
    container.querySelector(".rdp-caption_label")?.textContent?.trim() ?? "";
  return { container, cell, cellFor, selected, caption };
}

/** Press, optionally sweep over more cells, release — the pointer gesture. */
function sweep(
  [first, ...rest]: [HTMLButtonElement, ...HTMLButtonElement[]],
  init: { shiftKey?: boolean; ctrlKey?: boolean } = {},
) {
  fireEvent.pointerDown(first, { button: 0, ...init });
  for (const cell of rest) fireEvent.pointerEnter(cell, init);
  fireEvent.pointerUp(window);
}

describe("MonthGrid multi selection — pointer", () => {
  it("replaces the selection on a plain press", () => {
    const { cell, selected } = setup();

    sweep([cell(15)]);
    expect(selected()).toEqual([15]);

    sweep([cell(20)]);
    expect(selected()).toEqual([20]);
  });

  it("selects the run a drag sweeps", () => {
    const { cell, selected } = setup();

    sweep([cell(16), cell(17), cell(18)]);
    expect(selected()).toEqual([16, 17, 18]);
  });

  it("extends from the anchor on shift, and keeps that anchor afterwards", () => {
    const { cell, selected } = setup();

    sweep([cell(20)]);
    // Backwards first: the range runs 15–20 but the anchor is still the 20th.
    sweep([cell(15)], { shiftKey: true });
    expect(selected()).toEqual([15, 16, 17, 18, 19, 20]);

    sweep([cell(18)], { shiftKey: true });
    expect(selected()).toEqual([18, 19, 20]);
  });

  it("re-anchors on the day a shift lands on once the old anchor is gone", () => {
    const { container, cell, selected } = setup();

    sweep([cell(20)]);
    fireEvent.keyDown(container.firstElementChild!, { key: "Escape" });

    // The remembered anchor is now unselected, so this shift has nothing to
    // extend and simply selects — and has to become the anchor itself, or the
    // next shift would fall back again and never grow a range.
    sweep([cell(15)], { shiftKey: true });
    expect(selected()).toEqual([15]);

    sweep([cell(18)], { shiftKey: true });
    expect(selected()).toEqual([15, 16, 17, 18]);
  });

  it("toggles one day on ctrl/cmd, leaving the rest alone", () => {
    const { cell, selected } = setup();

    sweep([cell(16), cell(17), cell(18)]);
    sweep([cell(17)], { ctrlKey: true });
    expect(selected()).toEqual([16, 18]);

    sweep([cell(20)], { ctrlKey: true });
    expect(selected()).toEqual([16, 18, 20]);
  });

  it("erases the run a ctrl-drag starting on a selected day sweeps", () => {
    const { cell, selected } = setup();

    sweep([cell(16), cell(17), cell(18), cell(19)]);
    // Backwards from the selected 19th: the whole run goes, not each day flipped.
    sweep([cell(19), cell(18), cell(17)], { ctrlKey: true });
    expect(selected()).toEqual([16]);
  });
});

describe("MonthGrid multi selection — keyboard", () => {
  it("toggles the focused day on activation", () => {
    const { cell, selected } = setup();

    fireEvent.click(cell(15)); // Space/Enter on a button: a click with detail 0
    expect(selected()).toEqual([15]);

    fireEvent.click(cell(15));
    expect(selected()).toEqual([]);
  });

  it("adds each activated day to the selection rather than replacing it", () => {
    // The keyboard has no "press somewhere else to drop the rest", so every
    // activation toggles its own day and leaves the others alone — already the
    // additive gesture ctrl-click gives the pointer. Ctrl+Space and Ctrl+Enter
    // therefore need no handling of their own: the activation path is handed
    // the day and the click detail only, and never reads a modifier.
    const { cell, selected } = setup();

    fireEvent.click(cell(15));
    fireEvent.click(cell(18));
    expect(selected()).toEqual([15, 18]);

    fireEvent.click(cell(18));
    expect(selected()).toEqual([15]);
  });

  it("moves focus a day sideways and a week up or down on the arrows", () => {
    const { cell } = setup();

    act(() => cell(15).focus());
    fireEvent.keyDown(cell(15), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(16));

    fireEvent.keyDown(cell(16), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(23));

    fireEvent.keyDown(cell(23), { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell(16));

    fireEvent.keyDown(cell(16), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell(15));
  });

  it("moves focus to the ends of the week on Home and End", () => {
    // Sunday 2025-06-15 opens the week that ends on Saturday the 21st.
    const { cell } = setup();

    act(() => cell(18).focus());
    fireEvent.keyDown(cell(18), { key: "Home" });
    expect(document.activeElement).toBe(cell(15));

    fireEvent.keyDown(cell(15), { key: "End" });
    expect(document.activeElement).toBe(cell(21));
  });

  it("takes Home to the week's first live day, not its dead Sunday", () => {
    // The week being worked in nearly always opens in the past: today is the
    // 12th, so the week from Sunday the 8th is half gone. rdp recomputes that
    // same dead Sunday on every retry and so never moves at all, which makes
    // Home a no-op in the one week the admin is in most.
    const { cell } = setup();

    act(() => cell(13).focus());
    fireEvent.keyDown(cell(13), { key: "Home" });
    expect(document.activeElement).toBe(cell(12));
  });

  it("keeps only the focused day tabbable, following focus around the grid", () => {
    const { cell } = setup();

    act(() => cell(15).focus());
    fireEvent.keyDown(cell(15), { key: "ArrowRight" });

    expect(cell(16).tabIndex).toBe(0);
    expect(cell(15).tabIndex).toBe(-1);
  });

  it("carries focus across a month edge on a plain arrow", () => {
    const { cellFor, caption } = setup();

    act(() => cellFor("2025-06-30").focus());
    fireEvent.keyDown(cellFor("2025-06-30"), { key: "ArrowRight" });

    expect(caption()).toBe("July 2025");
    expect(document.activeElement).toBe(cellFor("2025-07-01"));
  });

  it("stays put when a step off the edge lands on a day it cannot focus", () => {
    // Today is the 1st, a Tuesday, so ArrowLeft and Home both reach June — a
    // month with no day this grid can put focus on. Going there anyway would
    // unmount the cell holding focus and then fail to focus a really-disabled
    // one, dropping the caret onto <body> and leaving the whole grid with
    // nothing tabbable to get back in by.
    const { cellFor, caption } = setup({
      now: new Date("2025-07-01T18:00:00Z"),
      todayKey: "2025-07-01",
      month: new Date(2025, 6, 1),
    });
    const first = cellFor("2025-07-01");

    act(() => first.focus());
    for (const key of ["ArrowLeft", "ArrowUp", "Home"]) {
      fireEvent.keyDown(first, { key });
      expect(caption()).toBe("July 2025");
      expect(document.activeElement).toBe(first);
      expect(first.tabIndex).toBe(0);
    }
  });

  it("extends onto the day Shift+Arrow moves focus to", () => {
    const { cell, selected } = setup();

    fireEvent.click(cell(15));
    fireEvent.keyDown(cell(15), { key: "ArrowRight", shiftKey: true });
    expect(selected()).toEqual([15, 16]);
    expect(document.activeElement).toBe(cell(16));

    // A week step reaches the same run seven days on.
    fireEvent.keyDown(cell(16), { key: "ArrowDown", shiftKey: true });
    expect(selected()).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(document.activeElement).toBe(cell(23));
  });

  it("clears the selection on Escape", () => {
    const { container, cell, selected } = setup();

    sweep([cell(16), cell(17)]);
    expect(selected()).toEqual([16, 17]);

    fireEvent.keyDown(container.firstElementChild!, { key: "Escape" });
    expect(selected()).toEqual([]);
  });
});

describe("MonthGrid month boundaries", () => {
  it("opens on the month it is given", () => {
    const { caption } = setup({ month: new Date(2025, 11, 1) });
    expect(caption()).toBe("December 2025");
  });

  it("follows a later change of the month prop", () => {
    // A host that mirrors the month into the URL changes this prop on browser
    // back/forward, and the grid has to move with it or the caption and the
    // data window disagree with the days on screen.
    const { container, rerender } = render(
      <Harness month={new Date(2025, 5, 1)} />,
    );
    const caption = () =>
      container.querySelector(".rdp-caption_label")?.textContent?.trim() ?? "";
    expect(caption()).toBe("June 2025");

    rerender(<Harness month={new Date(2025, 11, 1)} />);
    expect(caption()).toBe("December 2025");
  });

  it("keeps its own navigation while the host's month prop catches up", () => {
    // Navigating tells the host, which routes; until that round trip lands the
    // grid is re-rendered with the OLD month, and must not snap back to it.
    const { container, rerender } = render(
      <Harness month={new Date(2025, 5, 1)} />,
    );
    const caption = () =>
      container.querySelector(".rdp-caption_label")?.textContent?.trim() ?? "";
    const cellFor = (dayKey: string) =>
      container.querySelector<HTMLButtonElement>(`[data-day-key="${dayKey}"]`)!;

    fireEvent.click(cellFor("2025-06-30"));
    fireEvent.keyDown(cellFor("2025-06-30"), {
      key: "ArrowRight",
      shiftKey: true,
    });
    expect(caption()).toBe("July 2025");

    rerender(<Harness month={new Date(2025, 5, 1)} />);
    expect(caption()).toBe("July 2025");
  });

  it("follows a keyboard extend into the next month and tells the host", () => {
    const months: Date[] = [];
    const { cellFor, selected, caption } = setup({
      onMonthChange: (m) => months.push(m),
    });

    fireEvent.click(cellFor("2025-06-30"));
    fireEvent.keyDown(cellFor("2025-06-30"), {
      key: "ArrowRight",
      shiftKey: true,
    });

    expect(caption()).toBe("July 2025");
    expect(months.map((m) => m.getMonth())).toEqual([6]);
    // The June day stays selected even though the grid no longer draws it.
    expect(selected()).toEqual([1]);
    expect(document.activeElement).toBe(cellFor("2025-07-01"));
  });
});
