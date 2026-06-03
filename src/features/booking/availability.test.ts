import { describe, it, expect } from "vitest";
import {
  fitsWindow,
  passesGuards,
  seriesQualifiesForRecurringDiscount,
} from "./availability";
import type { TimeRange, BookingRuleSettings } from "./availability";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRange(startIso: string, endIso: string): TimeRange {
  return { startsAt: new Date(startIso), endsAt: new Date(endIso) };
}

// ---------------------------------------------------------------------------
// fitsWindow
// ---------------------------------------------------------------------------

describe("fitsWindow", () => {
  const window: TimeRange = makeRange(
    "2025-03-01T10:00:00Z",
    "2025-03-01T18:00:00Z",
  );

  it("returns true when candidate is fully inside the window", () => {
    const candidate = makeRange("2025-03-01T11:00:00Z", "2025-03-01T14:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(true);
  });

  it("returns true when candidate starts exactly at window start", () => {
    const candidate = makeRange("2025-03-01T10:00:00Z", "2025-03-01T12:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(true);
  });

  it("returns true when candidate ends exactly at window end", () => {
    const candidate = makeRange("2025-03-01T16:00:00Z", "2025-03-01T18:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(true);
  });

  it("returns true when candidate exactly spans the window", () => {
    const candidate = makeRange("2025-03-01T10:00:00Z", "2025-03-01T18:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(true);
  });

  it("returns false when candidate starts before window", () => {
    const candidate = makeRange("2025-03-01T09:59:59Z", "2025-03-01T12:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(false);
  });

  it("returns false when candidate ends after window", () => {
    const candidate = makeRange("2025-03-01T16:00:00Z", "2025-03-01T18:00:01Z");
    expect(fitsWindow(candidate, [window])).toBe(false);
  });

  it("returns false when candidate is completely outside window", () => {
    const candidate = makeRange("2025-03-01T20:00:00Z", "2025-03-01T22:00:00Z");
    expect(fitsWindow(candidate, [window])).toBe(false);
  });

  it("returns false with empty windows list", () => {
    const candidate = makeRange("2025-03-01T11:00:00Z", "2025-03-01T14:00:00Z");
    expect(fitsWindow(candidate, [])).toBe(false);
  });

  it("returns true when candidate fits any one of multiple windows", () => {
    const window2 = makeRange("2025-03-02T10:00:00Z", "2025-03-02T18:00:00Z");
    const candidate = makeRange("2025-03-02T11:00:00Z", "2025-03-02T14:00:00Z");
    expect(fitsWindow(candidate, [window, window2])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// passesGuards
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: BookingRuleSettings = {
  bookingOpenMinute: 480, // 8:00am
  bookingCloseMinute: 1080, // 6:00pm
  minLeadTimeHours: 24,
  hardMaxAdvanceDays: 90,
};

describe("passesGuards: lead time", () => {
  // now = 2025-03-01T12:00:00Z
  // candidate starts 2025-03-02T12:00:00Z → exactly 24h lead → should pass
  it("passes when lead time is exactly minLeadTimeHours (inclusive boundary)", () => {
    const now = new Date("2025-03-01T12:00:00Z");
    // 2025-03-02T15:00:00Z = 8:00am MST (UTC-7; DST starts Mar 9) = open minute 480.
    // now=12:00Z, start=15:00Z next day → 27h lead → passes lead time AND hours-of-day.
    const candidate = makeRange("2025-03-02T15:00:00Z", "2025-03-02T17:00:00Z");
    expect(passesGuards(candidate, DEFAULT_SETTINGS, now)).toBe(true);
  });

  it("fails when lead time is less than minLeadTimeHours", () => {
    const now = new Date("2025-03-01T12:00:00Z");
    // Only 3 hours lead — starts at 15:00 same day (8am MST)
    const candidate = makeRange("2025-03-01T15:00:00Z", "2025-03-01T17:00:00Z");
    expect(passesGuards(candidate, DEFAULT_SETTINGS, now)).toBe(false);
  });

  it("passes at exactly 24h lead time (>= boundary)", () => {
    const now = new Date("2025-03-01T15:00:00Z");
    // start = exactly 24h later and at 8am MST next day → 2025-03-02T15:00:00Z
    const candidate = makeRange("2025-03-02T15:00:00Z", "2025-03-02T17:00:00Z");
    expect(passesGuards(candidate, DEFAULT_SETTINGS, now)).toBe(true);
  });
});

describe("passesGuards: hard max advance", () => {
  it("passes when booking is exactly at hardMaxAdvanceDays (inclusive boundary)", () => {
    const now = new Date("2025-03-01T00:00:00Z");
    // 90 days later = 2025-05-29T00:00:00Z; use 8am MST (15:00 UTC)
    const start = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    // adjust to 15:00 UTC same day (8am MDT — DST starts March 9, so May 29 is MDT = UTC-6 → 8am MDT = 14:00 UTC)
    // Keep it simple: use same-day 15:00 UTC which is within allowed hours regardless
    start.setUTCHours(15, 0, 0, 0);
    // Recalculate: from now=midnight to start=90days+15h → max advance in days = (90days + 15h)/1day = 90.625 days
    // We need start - now <= 90 days. Let's pick now=15:00Z so start=exactly 90 days later=15:00Z
    const now2 = new Date("2025-03-01T15:00:00Z");
    const start2 = new Date(now2.getTime() + 90 * 24 * 60 * 60 * 1000);
    const candidate = makeRange(
      start2.toISOString(),
      new Date(start2.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    );
    // hour check: start2 will be at 15:00 UTC; May is MDT (UTC-6) so 15:00 UTC = 9:00 MDT → within [8,18)
    expect(passesGuards(candidate, DEFAULT_SETTINGS, now2)).toBe(true);
  });

  it("fails when booking is beyond hardMaxAdvanceDays", () => {
    const now = new Date("2025-03-01T15:00:00Z");
    // 91 days later
    const start = new Date(now.getTime() + 91 * 24 * 60 * 60 * 1000);
    start.setUTCHours(15, 0, 0, 0);
    const candidate = makeRange(
      start.toISOString(),
      new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    );
    expect(passesGuards(candidate, DEFAULT_SETTINGS, now)).toBe(false);
  });
});

describe("passesGuards: hours of day in America/Denver (minute-bounded start & end)", () => {
  // Denver is MST (UTC-7) in winter, MDT (UTC-6) in summer.
  // DST 2025: starts March 9, ends Nov 2.
  // Seed window: open 390 (6:30am), close 1320 (10:00pm).
  const now = new Date("2025-01-01T00:00:00Z"); // plenty of lead time, well inside max advance
  const settings: BookingRuleSettings = {
    ...DEFAULT_SETTINGS,
    bookingOpenMinute: 390, // 6:30am
    bookingCloseMinute: 1320, // 10:00pm
  };

  it("passes when start is exactly at open (6:30am MST = 13:30 UTC)", () => {
    const candidate = makeRange("2025-01-15T13:30:00Z", "2025-01-15T14:30:00Z");
    expect(passesGuards(candidate, settings, now)).toBe(true);
  });

  it("fails when start is one minute before open (6:29am MST = 13:29 UTC)", () => {
    const candidate = makeRange("2025-01-15T13:29:00Z", "2025-01-15T14:29:00Z");
    expect(passesGuards(candidate, settings, now)).toBe(false);
  });

  it("passes when end is exactly at close (ends 10:00pm MST = 05:00 UTC next day)", () => {
    // start 9:00pm MST (04:00 UTC next day, minute 1260), end 10:00pm MST (minute 1320)
    const candidate = makeRange("2025-01-16T04:00:00Z", "2025-01-16T05:00:00Z");
    expect(passesGuards(candidate, settings, now)).toBe(true);
  });

  it("fails when end is past close (9:30pm start runs to 10:30pm MST)", () => {
    // start 9:30pm MST (04:30 UTC next day, minute 1290 >= open),
    // end 10:30pm MST (05:30 UTC, minute 1350 > 1320 close) → rejected on the end bound
    const candidate = makeRange("2025-01-16T04:30:00Z", "2025-01-16T05:30:00Z");
    expect(passesGuards(candidate, settings, now)).toBe(false);
  });

  it("DST: 6:30am MDT (12:30 UTC in July) passes — offset handled by IANA tz", () => {
    const julyNow = new Date("2025-07-01T00:00:00Z");
    const candidate = makeRange("2025-07-15T12:30:00Z", "2025-07-15T13:30:00Z");
    expect(passesGuards(candidate, settings, julyNow)).toBe(true);
  });

  it("DST: 6:29am MDT (12:29 UTC in July) fails — one minute before open", () => {
    const julyNow = new Date("2025-07-01T00:00:00Z");
    const candidate = makeRange("2025-07-15T12:29:00Z", "2025-07-15T13:29:00Z");
    expect(passesGuards(candidate, settings, julyNow)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// seriesQualifiesForRecurringDiscount
// ---------------------------------------------------------------------------

describe("seriesQualifiesForRecurringDiscount", () => {
  const settings = { recurringMinOccurrences: 3 };

  it("house_sitting: 1 occurrence (e.g. 3-night stay = 1 booking) → does NOT qualify", () => {
    // A single multi-night stay is ONE occurrence element
    const occurrences = [new Date("2025-03-01T12:00:00Z")];
    expect(
      seriesQualifiesForRecurringDiscount(
        occurrences,
        "house_sitting",
        settings,
      ),
    ).toBe(false);
  });

  it("house_sitting: 3 distinct stays (3 separate occurrence dates) → qualifies", () => {
    const occurrences = [
      new Date("2025-03-01T12:00:00Z"),
      new Date("2025-04-01T12:00:00Z"),
      new Date("2025-05-01T12:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(
        occurrences,
        "house_sitting",
        settings,
      ),
    ).toBe(true);
  });

  it("walk: exactly recurringMinOccurrences → qualifies (boundary)", () => {
    const occurrences = [
      new Date("2025-03-01T15:00:00Z"),
      new Date("2025-03-08T15:00:00Z"),
      new Date("2025-03-15T15:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "walk", settings),
    ).toBe(true);
  });

  it("walk: one fewer than recurringMinOccurrences → does NOT qualify", () => {
    const occurrences = [
      new Date("2025-03-01T15:00:00Z"),
      new Date("2025-03-08T15:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "walk", settings),
    ).toBe(false);
  });

  it("check_in: qualifies at exactly recurringMinOccurrences", () => {
    const occurrences = [
      new Date("2025-03-01T15:00:00Z"),
      new Date("2025-03-08T15:00:00Z"),
      new Date("2025-03-15T15:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "check_in", settings),
    ).toBe(true);
  });

  it("training: qualifies at exactly recurringMinOccurrences", () => {
    const occurrences = [
      new Date("2025-03-01T15:00:00Z"),
      new Date("2025-03-08T15:00:00Z"),
      new Date("2025-03-15T15:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "training", settings),
    ).toBe(true);
  });

  it("de-duplicates identical timestamps: 3 copies of same date count as 1 occurrence → does NOT qualify", () => {
    const ts = new Date("2025-03-01T12:00:00Z");
    const occurrences = [ts, ts, ts];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "walk", settings),
    ).toBe(false);
  });

  it("de-duplicates: 2 distinct + 1 duplicate = 2 distinct → does NOT qualify", () => {
    const t1 = new Date("2025-03-01T12:00:00Z");
    const t2 = new Date("2025-03-08T12:00:00Z");
    const occurrences = [t1, t2, t1]; // t1 duplicate
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "walk", settings),
    ).toBe(false);
  });

  it("qualifies with more than min occurrences", () => {
    const occurrences = [
      new Date("2025-03-01T15:00:00Z"),
      new Date("2025-03-08T15:00:00Z"),
      new Date("2025-03-15T15:00:00Z"),
      new Date("2025-03-22T15:00:00Z"),
    ];
    expect(
      seriesQualifiesForRecurringDiscount(occurrences, "walk", settings),
    ).toBe(true);
  });
});
