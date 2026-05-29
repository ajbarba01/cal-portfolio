/**
 * Unit tests for deriveOpenSlots — the pure slot-derivation helper extracted
 * from useAvailability.
 *
 * WHY NOT TESTING THE HOOK ITSELF
 * --------------------------------
 * The useAvailability hook requires a live Supabase Realtime channel
 * (websocket). Vitest runs in a Node environment without browser or realtime
 * support. Mocking the entire Supabase channel lifecycle would test the mock,
 * not the hook behavior. The hook is thin glue: fetch → subscribe → setState.
 *
 * The meaningful logic — slot derivation — is the pure `deriveOpenSlots`
 * function, which is tested here without any IO or React machinery.
 */

import { describe, it, expect } from "vitest";
import { deriveOpenSlots } from "./use-availability";
import type { TimeRange, BookingRuleSettings } from "./availability";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Rules matching seed settings: 08-18 Denver, 24h lead, 90-day max advance.
const defaultRules: BookingRuleSettings = {
  bookingOpenHour: 8,
  bookingCloseHour: 18,
  minLeadTimeHours: 24,
  maxAdvanceDays: 90,
};

// A "now" at midnight UTC 30 days from a fixed epoch so Denver hour checks are
// predictable. We use 07:00 UTC = 00:00 MDT (UTC-7) — Denver midnight.
// Any candidate starting at 17:00 UTC = 10:00 MDT is within the 08-18 window.
function makeNow(): Date {
  // Use a known fixed point: 2026-07-01T07:00:00Z (Denver midnight in MDT).
  return new Date("2026-07-01T07:00:00Z");
}

/** Build a window covering [start, start + widthMs] */
function win(startOffset: number, widthMs: number, base: Date): TimeRange {
  const s = new Date(base.getTime() + startOffset);
  return { startsAt: s, endsAt: new Date(s.getTime() + widthMs) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("deriveOpenSlots", () => {
  it("returns no slots when openWindows is empty", () => {
    const now = makeNow();
    const slots = deriveOpenSlots([], HOUR, defaultRules, now, HOUR);
    expect(slots).toHaveLength(0);
  });

  it("returns no slots when window is too narrow for the duration", () => {
    const now = makeNow();
    // Window is 30 min; duration is 1 hour → no slot fits.
    const window = win(2 * DAY + 10 * HOUR, 30 * 60 * 1000, now); // starts 2d+10h from now
    const slots = deriveOpenSlots([window], HOUR, defaultRules, now, HOUR);
    expect(slots).toHaveLength(0);
  });

  it("returns a slot when a candidate fits the window and passes guards", () => {
    const now = makeNow();
    // Window starts 2 days from now at 10:00 Denver time (17:00 UTC).
    // 2026-07-03T17:00:00Z = 10:00 MDT, well within 08-18 window.
    const windowStart = new Date("2026-07-03T17:00:00Z");
    const window: TimeRange = {
      startsAt: windowStart,
      endsAt: new Date(windowStart.getTime() + 2 * HOUR),
    };

    const slots = deriveOpenSlots([window], HOUR, defaultRules, now, HOUR);
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots[0].startsAt.getTime()).toBe(windowStart.getTime());
  });

  it("excludes candidates that violate lead time (too soon)", () => {
    const now = makeNow();
    // Window starts in 1 hour — less than 24h lead time required.
    const window: TimeRange = {
      startsAt: new Date(now.getTime() + HOUR),
      endsAt: new Date(now.getTime() + 3 * HOUR),
    };
    const slots = deriveOpenSlots([window], HOUR, defaultRules, now, HOUR);
    expect(slots).toHaveLength(0);
  });

  it("excludes candidates outside booking hours (e.g. 02:00 Denver)", () => {
    const now = makeNow();
    // 2026-07-05T09:00:00Z = 02:00 MDT — outside 08-18 Denver window.
    const windowStart = new Date("2026-07-05T09:00:00Z");
    const window: TimeRange = {
      startsAt: windowStart,
      endsAt: new Date(windowStart.getTime() + 2 * HOUR),
    };
    const slots = deriveOpenSlots([window], HOUR, defaultRules, now, HOUR);
    expect(slots).toHaveLength(0);
  });

  it("step granularity controls how many slots are returned in a wide window", () => {
    const now = makeNow();
    // Window: 2026-07-03T17:00Z to 2026-07-03T21:00Z (4h wide = 10:00-14:00 MDT).
    const windowStart = new Date("2026-07-03T17:00:00Z");
    const window: TimeRange = {
      startsAt: windowStart,
      endsAt: new Date(windowStart.getTime() + 4 * HOUR),
    };

    // 30-min steps: 4h window, 1h duration → 7 candidate starts (0,30,60,90,120,150,180 min)
    const slots30 = deriveOpenSlots(
      [window],
      HOUR,
      defaultRules,
      now,
      30 * 60 * 1000,
    );
    // 1h steps: 4h window, 1h duration → 4 candidates (0,1h,2h,3h)
    const slots60 = deriveOpenSlots([window], HOUR, defaultRules, now, HOUR);

    expect(slots30.length).toBeGreaterThan(slots60.length);
  });
});
