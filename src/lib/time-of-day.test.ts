import { describe, expect, it, vi } from "vitest";
import {
  minutesToClock,
  clockToMinutes,
  DENVER_TZ,
  denverDayKey,
  denverTime,
  denverDate,
  denverDateTime,
  denverDayLabel,
  denverMidnight,
  denverMinutesSinceMidnight,
} from "./time-of-day";

/**
 * ICU renders the space before AM/PM as a narrow no-break space (U+202F) from
 * ICU 72 onward and as a plain space before it. Normalising here keeps these
 * assertions readable and stable across Node versions.
 */
function plainSpaces(value: string): string {
  return value.replace(/[\u202f\u00a0]/g, " ");
}

describe("time-of-day", () => {
  it("splits minutes-since-midnight into 12h parts", () => {
    expect(minutesToClock(390)).toEqual({
      hour12: 6,
      minute: 30,
      meridiem: "AM",
    });
    expect(minutesToClock(0)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "AM",
    });
    expect(minutesToClock(720)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "PM",
    });
    expect(minutesToClock(1320)).toEqual({
      hour12: 10,
      minute: 0,
      meridiem: "PM",
    });
  });
  it("round-trips", () => {
    for (const m of [0, 1, 390, 719, 720, 721, 1320, 1439]) {
      const c = minutesToClock(m);
      expect(clockToMinutes(c.hour12, c.minute, c.meridiem)).toBe(m);
    }
  });
});

// ---------------------------------------------------------------------------
// Denver display formatters
//
// Denver is MST (UTC-7) in winter and MDT (UTC-6) in summer. In 2025 the clocks
// spring forward on March 9 at 2am local (09:00 UTC) and fall back on November 2
// at 2am local (08:00 UTC). Every case below is anchored to a UTC instant so the
// assertion holds whatever timezone the test machine sits in.
// ---------------------------------------------------------------------------

describe("DENVER_TZ", () => {
  it("is the IANA identifier the whole app formats against", () => {
    expect(DENVER_TZ).toBe("America/Denver");
  });
});

describe("denverDayKey", () => {
  it("returns the Denver calendar day, not the UTC one", () => {
    // 22:00 on March 8 in Denver, already March 9 in UTC.
    expect(denverDayKey(new Date("2025-03-09T05:00:00Z"))).toBe("2025-03-08");
    expect(denverDayKey(new Date("2025-07-15T12:00:00Z"))).toBe("2025-07-15");
  });

  it("rolls the day at Denver midnight on both sides of the DST changes", () => {
    // Spring forward: midnight arrives at 07:00 UTC while still on MST.
    expect(denverDayKey(new Date("2025-03-09T06:59:00Z"))).toBe("2025-03-08");
    expect(denverDayKey(new Date("2025-03-09T07:00:00Z"))).toBe("2025-03-09");
    // Fall back: midnight arrives at 06:00 UTC while still on MDT.
    expect(denverDayKey(new Date("2025-11-02T05:59:00Z"))).toBe("2025-11-01");
    expect(denverDayKey(new Date("2025-11-02T06:00:00Z"))).toBe("2025-11-02");
  });
});

describe("denverTime", () => {
  it("renders the Denver wall clock", () => {
    expect(plainSpaces(denverTime(new Date("2025-06-07T15:00:00Z")))).toBe(
      "9:00 AM",
    );
    expect(plainSpaces(denverTime(new Date("2025-06-07T06:00:00Z")))).toBe(
      "12:00 AM",
    );
  });

  it("skips the hour that does not exist on the spring-forward day", () => {
    expect(plainSpaces(denverTime(new Date("2025-03-09T08:59:00Z")))).toBe(
      "1:59 AM",
    );
    expect(plainSpaces(denverTime(new Date("2025-03-09T09:00:00Z")))).toBe(
      "3:00 AM",
    );
  });

  it("repeats the hour that happens twice on the fall-back day", () => {
    expect(plainSpaces(denverTime(new Date("2025-11-02T07:30:00Z")))).toBe(
      "1:30 AM",
    );
    expect(plainSpaces(denverTime(new Date("2025-11-02T08:30:00Z")))).toBe(
      "1:30 AM",
    );
  });
});

describe("denverDate", () => {
  it("includes the year by default", () => {
    expect(denverDate(new Date("2025-06-07T15:00:00Z"))).toBe("Jun 7, 2025");
  });

  it("drops the year on request", () => {
    expect(denverDate(new Date("2025-06-07T15:00:00Z"), { year: false })).toBe(
      "Jun 7",
    );
  });

  it("uses the Denver day for an instant that has already rolled over in UTC", () => {
    expect(denverDate(new Date("2025-03-09T05:00:00Z"))).toBe("Mar 8, 2025");
  });
});

describe("denverDateTime", () => {
  it("renders the Denver date and wall clock together", () => {
    expect(plainSpaces(denverDateTime(new Date("2025-06-07T15:00:00Z")))).toBe(
      "Jun 7, 2025, 9:00 AM",
    );
  });

  it("agrees with the date and time formatters on a DST boundary day", () => {
    const springForward = new Date("2025-03-09T09:00:00Z");
    expect(plainSpaces(denverDateTime(springForward))).toBe(
      `${denverDate(springForward)}, ${plainSpaces(denverTime(springForward))}`,
    );
  });
});

describe("denverDayLabel", () => {
  it("includes the weekday and the year by default", () => {
    expect(denverDayLabel(new Date("2025-06-07T15:00:00Z"))).toBe(
      "Sat, Jun 7, 2025",
    );
  });

  it("drops the year on request", () => {
    expect(
      denverDayLabel(new Date("2025-06-07T15:00:00Z"), { year: false }),
    ).toBe("Sat, Jun 7");
  });

  it("labels the Denver day, not the UTC one", () => {
    // 22:00 Saturday in Denver, already Sunday in UTC.
    expect(denverDayLabel(new Date("2025-03-09T05:00:00Z"))).toBe(
      "Sat, Mar 8, 2025",
    );
  });

  it("keeps the old year on New Year's Eve after UTC has rolled over", () => {
    // 22:00 on December 31 in Denver, already January 1 in UTC. The year has to
    // stay behind with the day.
    expect(denverDayLabel(new Date("2026-01-01T05:00:00Z"))).toBe(
      "Wed, Dec 31, 2025",
    );
    expect(denverDate(new Date("2026-01-01T05:00:00Z"))).toBe("Dec 31, 2025");
    expect(denverDayKey(new Date("2026-01-01T05:00:00Z"))).toBe("2025-12-31");
  });
});

// ---------------------------------------------------------------------------
// Denver timezone arithmetic
// ---------------------------------------------------------------------------

describe("denverMinutesSinceMidnight", () => {
  it("returns the Denver time-of-day, not the UTC one", () => {
    // 15:00Z = 09:00 MDT.
    expect(denverMinutesSinceMidnight(new Date("2025-06-07T15:00:00Z"))).toBe(
      9 * 60,
    );
    // 17:30Z = 10:30 MST.
    expect(denverMinutesSinceMidnight(new Date("2025-01-15T17:30:00Z"))).toBe(
      10 * 60 + 30,
    );
  });

  it("returns 0 at Denver midnight in both MST and MDT", () => {
    expect(denverMinutesSinceMidnight(new Date("2025-01-15T07:00:00Z"))).toBe(
      0,
    );
    expect(denverMinutesSinceMidnight(new Date("2025-07-15T06:00:00Z"))).toBe(
      0,
    );
  });

  it("skips the hour that does not exist on the spring-forward day", () => {
    // 01:59 MST, then the clocks jump straight to 03:00 MDT.
    expect(denverMinutesSinceMidnight(new Date("2025-03-09T08:59:00Z"))).toBe(
      1 * 60 + 59,
    );
    expect(denverMinutesSinceMidnight(new Date("2025-03-09T09:00:00Z"))).toBe(
      3 * 60,
    );
  });

  it("repeats the hour that happens twice on the fall-back day", () => {
    // 01:30 MDT and 01:30 MST are distinct instants with the same wall clock.
    expect(denverMinutesSinceMidnight(new Date("2025-11-02T07:30:00Z"))).toBe(
      1 * 60 + 30,
    );
    expect(denverMinutesSinceMidnight(new Date("2025-11-02T08:30:00Z"))).toBe(
      1 * 60 + 30,
    );
  });
});

describe("denverMidnight", () => {
  it("resolves a summer (MDT, UTC-6) day to 06:00Z", () => {
    expect(denverMidnight("2025-07-15").toISOString()).toBe(
      "2025-07-15T06:00:00.000Z",
    );
  });

  it("resolves a winter (MST, UTC-7) day to 07:00Z", () => {
    expect(denverMidnight("2025-01-15").toISOString()).toBe(
      "2025-01-15T07:00:00.000Z",
    );
  });

  it("uses the pre-transition offset on the spring-forward day", () => {
    // March 9 2025 starts on MST: midnight is 07:00Z even though the rest of
    // the day is MDT. A single-probe solve would land an hour off here.
    expect(denverMidnight("2025-03-09").toISOString()).toBe(
      "2025-03-09T07:00:00.000Z",
    );
  });

  it("uses the pre-transition offset on the fall-back day", () => {
    // November 2 2025 starts on MDT: midnight is 06:00Z, MST arrives at 2am.
    expect(denverMidnight("2025-11-02").toISOString()).toBe(
      "2025-11-02T06:00:00.000Z",
    );
  });

  it("round-trips with denverDayKey across both DST boundaries", () => {
    for (const key of [
      "2025-01-15",
      "2025-03-08",
      "2025-03-09",
      "2025-03-10",
      "2025-07-15",
      "2025-11-01",
      "2025-11-02",
      "2025-11-03",
    ]) {
      expect(denverDayKey(denverMidnight(key))).toBe(key);
    }
  });

  it("starts every Denver day at minute 0", () => {
    for (const key of [
      "2025-01-15",
      "2025-03-09",
      "2025-07-15",
      "2025-11-02",
    ]) {
      expect(denverMinutesSinceMidnight(denverMidnight(key))).toBe(0);
    }
  });
});

describe("Denver formatter reuse", () => {
  it("builds no Intl formatter per call", () => {
    // The scheduler formats a full year of days on every recompute, so a
    // formatter constructed inside one of these helpers costs ~1,100 instances
    // per pass. Every formatter belongs at module scope.
    //
    // The Date.prototype.toLocale* methods are spied alongside the constructor
    // because each allocates a formatter internally without touching the
    // Intl.DateTimeFormat binding — a regression rewritten as
    // `date.toLocaleDateString(...)` would otherwise slip past the spy with the
    // cost fully restored.
    const construct = vi.spyOn(Intl, "DateTimeFormat");
    const viaString = vi.spyOn(Date.prototype, "toLocaleString");
    const viaDate = vi.spyOn(Date.prototype, "toLocaleDateString");
    const viaTime = vi.spyOn(Date.prototype, "toLocaleTimeString");
    try {
      const at = new Date("2025-06-07T15:00:00Z");
      denverDayKey(at);
      denverTime(at);
      denverDate(at);
      denverDate(at, { year: false });
      denverDateTime(at);
      denverDayLabel(at);
      denverDayLabel(at, { year: false });
      denverMinutesSinceMidnight(at);
      denverMidnight("2025-06-07");
      expect(construct).not.toHaveBeenCalled();
      expect(viaString).not.toHaveBeenCalled();
      expect(viaDate).not.toHaveBeenCalled();
      expect(viaTime).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
