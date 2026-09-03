/**
 * Unit tests for series cron: shouldPromote + nextOccurrencesToMaterialize.
 *
 * Integration tests for runSeriesRollCron live in
 * series-cron.integration.test.ts (requires local Supabase / SUPABASE_TEST_* env vars).
 */

import { assert, describe, it, expect } from "vitest";
import { shouldPromote, nextOccurrencesToMaterialize } from "./series-cron";
import type { SeriesRule } from "./series-cron";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Pure: shouldPromote
// ──────────────────────────────────────────────────────────────────────────────

describe("shouldPromote", () => {
  const now = new Date("2026-06-03T12:00:00Z");
  const horizon = 30;

  function at(days: number): Date {
    return new Date(now.getTime() + days * MS_PER_DAY);
  }

  it("promotes a time-only pending booking now inside the horizon", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(20),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(true);
  });

  it("promotes at exactly the horizon boundary (inclusive)", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(30),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(true);
  });

  it("does NOT promote while still beyond the horizon", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(31),
          baseRequiresApproval: false,
        },
        now,
        horizon,
      ),
    ).toBe(false);
  });

  it("does NOT promote a distance/service-flagged pending (Cal must decide)", () => {
    expect(
      shouldPromote(
        {
          status: "pending_approval",
          startsAt: at(10),
          baseRequiresApproval: true,
        },
        now,
        horizon,
      ),
    ).toBe(false);
  });

  it("ignores non-pending statuses", () => {
    expect(
      shouldPromote(
        { status: "confirmed", startsAt: at(10), baseRequiresApproval: false },
        now,
        horizon,
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: nextOccurrencesToMaterialize
// ──────────────────────────────────────────────────────────────────────────────

describe("nextOccurrencesToMaterialize", () => {
  const now = new Date("2026-06-03T12:00:00Z");
  const template = new Date("2026-06-04T15:00:00Z"); // 1 day out

  const openSeries: SeriesRule = {
    templateStartsAt: template,
    freq: "weekly",
    interval: 1,
    openEnded: true,
  };

  it("returns weekly occurrences up to the generation horizon", () => {
    const result = nextOccurrencesToMaterialize(openSeries, [], now, 42);
    // template at day+1, then +7 each: day 1,8,15,22,29,36 ≤ 43 (now+42) → 6
    expect(result.length).toBe(6);
  });

  it("skips already-materialized starts", () => {
    const all = nextOccurrencesToMaterialize(openSeries, [], now, 42);
    const [firstOcc, secondOcc] = all;
    assert(firstOcc && secondOcc, "expected at least two occurrences");
    const existing = [firstOcc.getTime(), secondOcc.getTime()];
    const result = nextOccurrencesToMaterialize(openSeries, existing, now, 42);
    expect(result.length).toBe(all.length - 2);
    expect(result.some((d) => existing.includes(d.getTime()))).toBe(false);
  });

  it("excludes occurrences at or before now", () => {
    // now is AFTER the template start → that first occurrence is in the past.
    const laterNow = new Date(template.getTime() + 2 * MS_PER_DAY);
    const result = nextOccurrencesToMaterialize(openSeries, [], laterNow, 42);
    expect(result.every((d) => d.getTime() > laterNow.getTime())).toBe(true);
  });

  it("respects a bounded count", () => {
    const bounded: SeriesRule = { ...openSeries, count: 2, openEnded: false };
    const result = nextOccurrencesToMaterialize(bounded, [], now, 365);
    expect(result.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure: nextOccurrencesToMaterialize — skip-set
// ──────────────────────────────────────────────────────────────────────────────

describe("nextOccurrencesToMaterialize — skip-set", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const series: SeriesRule = {
    templateStartsAt: new Date("2026-06-15T16:00:00Z"), // Mondays 16:00Z
    freq: "weekly",
    interval: 1,
    openEnded: true,
  };

  it("reproduces the duplicate without a skip, then excludes the skipped slot", () => {
    // The Jun 22 occurrence was moved away (its row no longer sits on Jun 22),
    // so it is absent from existingStarts. Without a skip it gets refilled.
    const jun22 = new Date("2026-06-22T16:00:00Z").getTime();
    const withoutSkip = nextOccurrencesToMaterialize(series, [], now, 21, []);
    expect(withoutSkip.map((d) => d.getTime())).toContain(jun22);

    // Recording Jun 22 in the skip-set excludes it from materialization.
    const withSkip = nextOccurrencesToMaterialize(series, [], now, 21, [jun22]);
    expect(withSkip.map((d) => d.getTime())).not.toContain(jun22);
  });
});
