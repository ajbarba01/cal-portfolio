import { describe, it, expect } from "vitest";
import { expandOccurrences } from "./recurrence";
import type { RecurrenceRule } from "./recurrence";

// Base date: 2025-03-01 12:00:00 UTC (Saturday)
const BASE = new Date("2025-03-01T12:00:00Z");

// Helper: add days to a date (for assertion building)
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// Helper: add months (UTC calendar math)
function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCMonth(result.getUTCMonth() + n);
  return result;
}

// ---------------------------------------------------------------------------
// weekly
// ---------------------------------------------------------------------------

describe("expandOccurrences: weekly count=3", () => {
  it("returns exactly 3 dates each 7 days apart", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, count: 3 };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(3);
    expect(result[0].getTime()).toBe(BASE.getTime());
    expect(result[1].getTime()).toBe(addDays(BASE, 7).getTime());
    expect(result[2].getTime()).toBe(addDays(BASE, 14).getTime());
  });
});

describe("expandOccurrences: weekly interval=2 (fortnightly)", () => {
  it("steps 14 days per occurrence", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 2, count: 3 };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(3);
    expect(result[1].getTime()).toBe(addDays(BASE, 14).getTime());
    expect(result[2].getTime()).toBe(addDays(BASE, 28).getTime());
  });
});

// ---------------------------------------------------------------------------
// until bound
// ---------------------------------------------------------------------------

describe("expandOccurrences: until bound", () => {
  it("includes occurrences on or before until, excludes after", () => {
    // until = 2 weeks after BASE → should include week 0 and week 1 (day 7),
    // but NOT week 2 (day 14, exactly 14 days later > until which is day 13)
    const until = addDays(BASE, 13);
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, until };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(2);
    expect(result[0].getTime()).toBe(BASE.getTime());
    expect(result[1].getTime()).toBe(addDays(BASE, 7).getTime());
  });

  it("includes occurrence that falls exactly on until (inclusive boundary)", () => {
    const until = addDays(BASE, 7); // exactly the second occurrence
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, until };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(2);
    expect(result[1].getTime()).toBe(until.getTime());
  });
});

// ---------------------------------------------------------------------------
// both count and until — whichever is tighter wins
// ---------------------------------------------------------------------------

describe("expandOccurrences: both count and until", () => {
  it("count tighter: stops at count when count < until-implied occurrences", () => {
    // until allows 4 weeks → 5 occurrences, but count=3 is tighter
    const until = addDays(BASE, 28);
    const rule: RecurrenceRule = {
      freq: "weekly",
      interval: 1,
      count: 3,
      until,
    };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(3);
  });

  it("until tighter: stops at until when until < count-implied occurrences", () => {
    // count=10 but until only allows 2 occurrences (up to day 7)
    const until = addDays(BASE, 10);
    const rule: RecurrenceRule = {
      freq: "weekly",
      interval: 1,
      count: 10,
      until,
    };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// count=1 edge case
// ---------------------------------------------------------------------------

describe("expandOccurrences: count=1", () => {
  it("returns only [start]", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1, count: 1 };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(1);
    expect(result[0].getTime()).toBe(BASE.getTime());
  });
});

// ---------------------------------------------------------------------------
// daily
// ---------------------------------------------------------------------------

describe("expandOccurrences: daily", () => {
  it("steps by 1 day per interval with count", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 1, count: 4 };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(4);
    expect(result[1].getTime()).toBe(addDays(BASE, 1).getTime());
    expect(result[2].getTime()).toBe(addDays(BASE, 2).getTime());
    expect(result[3].getTime()).toBe(addDays(BASE, 3).getTime());
  });

  it("daily interval=3 steps 3 days", () => {
    const rule: RecurrenceRule = { freq: "daily", interval: 3, count: 3 };
    const result = expandOccurrences(BASE, rule);
    expect(result[1].getTime()).toBe(addDays(BASE, 3).getTime());
    expect(result[2].getTime()).toBe(addDays(BASE, 6).getTime());
  });
});

// ---------------------------------------------------------------------------
// monthly
// ---------------------------------------------------------------------------

describe("expandOccurrences: monthly", () => {
  it("steps by 1 calendar month (UTC)", () => {
    // 2025-03-01 → 2025-04-01 → 2025-05-01
    const rule: RecurrenceRule = { freq: "monthly", interval: 1, count: 3 };
    const result = expandOccurrences(BASE, rule);
    expect(result).toHaveLength(3);
    expect(result[1].getTime()).toBe(addMonths(BASE, 1).getTime());
    expect(result[2].getTime()).toBe(addMonths(BASE, 2).getTime());
  });

  it("monthly interval=2 steps 2 calendar months", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 2, count: 3 };
    const result = expandOccurrences(BASE, rule);
    expect(result[1].getTime()).toBe(addMonths(BASE, 2).getTime());
    expect(result[2].getTime()).toBe(addMonths(BASE, 4).getTime());
  });
});

// ---------------------------------------------------------------------------
// no bound (neither count nor until) → throws
// ---------------------------------------------------------------------------

describe("expandOccurrences: unbounded rule", () => {
  it("throws a clear error when neither count nor until is provided", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 1 };
    expect(() => expandOccurrences(BASE, rule)).toThrow(
      /count.*until|until.*count|unbounded/i,
    );
  });
});

// ---------------------------------------------------------------------------
// invalid interval
// ---------------------------------------------------------------------------

describe("expandOccurrences: invalid interval", () => {
  it("throws when interval < 1", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: 0, count: 3 };
    expect(() => expandOccurrences(BASE, rule)).toThrow(/interval/i);
  });

  it("throws when interval is negative", () => {
    const rule: RecurrenceRule = { freq: "weekly", interval: -2, count: 3 };
    expect(() => expandOccurrences(BASE, rule)).toThrow(/interval/i);
  });
});
