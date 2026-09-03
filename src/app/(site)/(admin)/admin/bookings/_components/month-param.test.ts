import { describe, expect, it } from "vitest";

import { denverMonthDate, monthParamOf } from "./month-param";

describe("denverMonthDate", () => {
  it("names the Denver month a window start falls in", () => {
    // The window the page loads for `?month=2026-09`: Denver midnight, Sep 1.
    const month = denverMonthDate("2026-09-01T06:00:00.000Z");
    expect(month.getFullYear()).toBe(2026);
    expect(month.getMonth()).toBe(8);
    expect(month.getDate()).toBe(1);
  });

  it("stays in the Denver month for an instant that is already the next one in UTC", () => {
    // 11:59 PM Denver on the last day of September — 5:59 AM UTC on October 1.
    expect(monthParamOf(denverMonthDate("2026-10-01T05:59:00.000Z"))).toBe(
      "2026-09",
    );
  });
});

describe("monthParamOf", () => {
  it("pads a single-digit month", () => {
    expect(monthParamOf(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("round-trips the month a grid navigation lands on", () => {
    const october = new Date(2026, 9, 1);
    const param = monthParamOf(october);
    expect(param).toBe("2026-10");
    // The page turns the parameter back into a window start; the grid must get
    // that same month back, or the caption and the rows disagree.
    expect(monthParamOf(denverMonthDate("2026-10-01T06:00:00.000Z"))).toBe(
      param,
    );
  });
});
