/**
 * The pure half of the scheduler's day-selection gestures.
 *
 * The hook around them is thin React glue (see the module header), so these two
 * functions are where the whole model lives: which day a range gesture measures
 * from, and which reducer actions one gesture becomes. Every mouse and keyboard
 * path in MonthGrid funnels through them, which is why they are tested here
 * rather than through the grid.
 */

import { describe, it, expect } from "vitest";
import { daySelectionActions, resolveAnchor } from "./use-schedule-selection";

const JUN = (day: number) => `2026-06-${String(day).padStart(2, "0")}`;

describe("resolveAnchor", () => {
  it("keeps the live anchor while it is still selected", () => {
    expect(resolveAnchor(JUN(3), new Set([JUN(3), JUN(4)]), JUN(9))).toBe(
      JUN(3),
    );
  });

  it("falls back to the pressed day once the anchor is no longer selected", () => {
    // Clearing the selection (Escape, "Clear dates") leaves the remembered
    // anchor pointing at nothing, and an extend with nothing to extend from is
    // a plain selection.
    expect(resolveAnchor(JUN(3), new Set(), JUN(9))).toBe(JUN(9));
  });

  it("falls back to the pressed day when no anchor has been set", () => {
    expect(resolveAnchor(null, new Set([JUN(3)]), JUN(9))).toBe(JUN(9));
  });
});

describe("daySelectionActions", () => {
  it("replaces the selection with a single clicked day", () => {
    expect(
      daySelectionActions({
        mode: "replace",
        days: [JUN(9)],
        originKey: JUN(9),
        selectedDays: new Set([JUN(1), JUN(2)]),
      }),
    ).toEqual([
      { type: "clearDays" },
      { type: "paintDays", days: [JUN(9)], mode: "add" },
    ]);
  });

  it("replaces the selection with a dragged run", () => {
    const days = [JUN(9), JUN(10), JUN(11)];
    expect(
      daySelectionActions({
        mode: "replace",
        days,
        originKey: JUN(11),
        selectedDays: new Set([JUN(1)]),
      }),
    ).toEqual([
      { type: "clearDays" },
      { type: "paintDays", days, mode: "add" },
    ]);
  });

  it("commits an extend as the whole run, so the anchor end stays selected", () => {
    const days = [JUN(3), JUN(4), JUN(5)];
    expect(
      daySelectionActions({
        mode: "extend",
        days,
        originKey: JUN(5),
        selectedDays: new Set([JUN(3)]),
      }),
    ).toEqual([
      { type: "clearDays" },
      { type: "paintDays", days, mode: "add" },
    ]);
  });

  it("clears when a range gesture covers nothing selectable", () => {
    // A drag that flows entirely over past or no-data cells must not leave the
    // previous selection standing — the operator aimed somewhere else.
    expect(
      daySelectionActions({
        mode: "replace",
        days: [],
        originKey: JUN(9),
        selectedDays: new Set([JUN(1)]),
      }),
    ).toEqual([{ type: "clearDays" }]);
  });

  it("adds when a toggle starts on an unselected day", () => {
    expect(
      daySelectionActions({
        mode: "toggle",
        days: [JUN(9)],
        originKey: JUN(9),
        selectedDays: new Set([JUN(1)]),
      }),
    ).toEqual([{ type: "paintDays", days: [JUN(9)], mode: "add" }]);
  });

  it("removes when a toggle starts on a selected day", () => {
    expect(
      daySelectionActions({
        mode: "toggle",
        days: [JUN(9)],
        originKey: JUN(9),
        selectedDays: new Set([JUN(9)]),
      }),
    ).toEqual([{ type: "paintDays", days: [JUN(9)], mode: "remove" }]);
  });

  it("takes a toggle run's direction from the day it started on, not the earliest", () => {
    // Dragging backwards from a selected Jun 11 over unselected Jun 9–10 erases
    // the run; deriving the mode from the sorted first day would add instead.
    const days = [JUN(9), JUN(10), JUN(11)];
    expect(
      daySelectionActions({
        mode: "toggle",
        days,
        originKey: JUN(11),
        selectedDays: new Set([JUN(11)]),
      }),
    ).toEqual([{ type: "paintDays", days, mode: "remove" }]);
  });

  it("does nothing when a toggle covers nothing selectable", () => {
    expect(
      daySelectionActions({
        mode: "toggle",
        days: [],
        originKey: JUN(9),
        selectedDays: new Set([JUN(9)]),
      }),
    ).toEqual([]);
  });
});
