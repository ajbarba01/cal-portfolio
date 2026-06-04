import { describe, it, expect } from "vitest";
import {
  overlapsHalfOpen,
  markSlotsBusy,
  deriveBookableDays,
  validateStayRange,
} from "./calendar-model";
import type { TimeRange, BookingRuleSettings } from "./availability";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function range(startIso: string, endIso: string): TimeRange {
  return { startsAt: new Date(startIso), endsAt: new Date(endIso) };
}

const RULES: BookingRuleSettings = {
  bookingOpenMinute: 390, // 6:30am Denver
  bookingCloseMinute: 1320, // 10:00pm Denver
  minLeadTimeHours: 24,
  hardMaxAdvanceDays: 90,
};

// Denver-midnight instants: MST (winter) = UTC-7 → 07:00Z; MDT (summer) = UTC-6 → 06:00Z.
function denverMidnightMST(day: string): Date {
  return new Date(`${day}T07:00:00Z`);
}
function denverMidnightMDT(day: string): Date {
  return new Date(`${day}T06:00:00Z`);
}

// ---------------------------------------------------------------------------
// overlapsHalfOpen
// ---------------------------------------------------------------------------

describe("overlapsHalfOpen", () => {
  const a = range("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z");

  it("true when ranges genuinely overlap", () => {
    expect(
      overlapsHalfOpen(
        a,
        range("2025-03-01T10:30:00Z", "2025-03-01T11:30:00Z"),
      ),
    ).toBe(true);
  });

  it("false when b starts exactly at a's end (touching)", () => {
    expect(
      overlapsHalfOpen(
        a,
        range("2025-03-01T11:00:00Z", "2025-03-01T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("false when b ends exactly at a's start (touching)", () => {
    expect(
      overlapsHalfOpen(
        a,
        range("2025-03-01T09:00:00Z", "2025-03-01T10:00:00Z"),
      ),
    ).toBe(false);
  });

  it("false when disjoint", () => {
    expect(
      overlapsHalfOpen(
        a,
        range("2025-03-01T13:00:00Z", "2025-03-01T14:00:00Z"),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markSlotsBusy
// ---------------------------------------------------------------------------

describe("markSlotsBusy", () => {
  const slots = [
    range("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z"),
    range("2025-03-01T11:00:00Z", "2025-03-01T12:00:00Z"),
    range("2025-03-01T12:00:00Z", "2025-03-01T13:00:00Z"),
  ];

  it("marks only the overlapping slot busy (half-open)", () => {
    const busy = [range("2025-03-01T11:30:00Z", "2025-03-01T11:45:00Z")];
    const out = markSlotsBusy(slots, busy);
    expect(out.map((m) => m.busy)).toEqual([false, true, false]);
  });

  it("a busy range touching a slot boundary does NOT mark it busy", () => {
    // busy [11:00,12:00) touches slot[0] end and equals slot[1].
    const busy = [range("2025-03-01T11:00:00Z", "2025-03-01T12:00:00Z")];
    const out = markSlotsBusy(slots, busy);
    expect(out.map((m) => m.busy)).toEqual([false, true, false]);
  });

  it("no busy ranges → all free", () => {
    expect(markSlotsBusy(slots, []).every((m) => !m.busy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deriveBookableDays
// ---------------------------------------------------------------------------

describe("deriveBookableDays", () => {
  // now = mid-June (MDT). Night-set covers all of June.
  const now = new Date("2025-06-10T12:00:00Z");
  const juneNights = new Set([
    "2025-06-01",
    "2025-06-02",
    "2025-06-03",
    "2025-06-04",
    "2025-06-05",
    "2025-06-06",
    "2025-06-07",
    "2025-06-08",
    "2025-06-09",
    "2025-06-10",
    "2025-06-11",
    "2025-06-12",
    "2025-06-13",
    "2025-06-14",
    "2025-06-15",
    "2025-06-16",
    "2025-06-17",
    "2025-06-18",
    "2025-06-19",
    "2025-06-20",
    "2025-06-21",
    "2025-06-22",
    "2025-06-23",
    "2025-06-24",
    "2025-06-25",
    "2025-06-26",
    "2025-06-27",
    "2025-06-28",
    "2025-06-29",
  ]);

  function stateFor(
    day: Date,
    opts?: Partial<{
      busyResident: TimeRange[];
      overnightNights: Set<string>;
    }>,
  ) {
    const out = deriveBookableDays({
      days: [day],
      overnightNights: opts?.overnightNights ?? juneNights,
      busyResident: opts?.busyResident ?? [],
      rules: RULES,
      now,
    });
    return out[0].state;
  }

  it("classifies a yesterday as past", () => {
    expect(stateFor(denverMidnightMDT("2025-06-09"))).toBe("past");
  });

  it("classifies an in-window future day as available", () => {
    expect(stateFor(denverMidnightMDT("2025-06-15"))).toBe("available");
  });

  it("classifies a day overlapping a resident booking as busy", () => {
    const busyResident = [
      range("2025-06-20T12:00:00Z", "2025-06-22T12:00:00Z"),
    ];
    expect(stateFor(denverMidnightMDT("2025-06-21"), { busyResident })).toBe(
      "busy",
    );
  });

  it("classifies a near future day NOT in the night-set as out-of-window", () => {
    expect(
      stateFor(denverMidnightMDT("2025-06-15"), {
        overnightNights: new Set(),
      }),
    ).toBe("out-of-window");
  });

  it("classifies a day beyond hardMaxAdvanceDays as too-far", () => {
    // ~112 days ahead of June 10.
    expect(stateFor(denverMidnightMDT("2025-09-30"))).toBe("too-far");
  });

  it("too-far takes precedence over out-of-window", () => {
    expect(
      stateFor(denverMidnightMDT("2025-09-30"), {
        overnightNights: new Set(),
      }),
    ).toBe("too-far");
  });

  it("classifies an empty day list as empty output", () => {
    expect(
      deriveBookableDays({
        days: [],
        overnightNights: juneNights,
        busyResident: [],
        rules: RULES,
        now,
      }),
    ).toEqual([]);
  });

  it("day IN the night-set is available", () => {
    const nights = new Set(["2025-06-20"]);
    expect(
      stateFor(denverMidnightMDT("2025-06-20"), { overnightNights: nights }),
    ).toBe("available");
  });

  it("day NOT in the night-set is out-of-window", () => {
    const nights = new Set(["2025-06-20"]);
    // 2025-06-21 is not in the set
    expect(
      stateFor(denverMidnightMDT("2025-06-21"), { overnightNights: nights }),
    ).toBe("out-of-window");
  });

  it("past takes precedence over out-of-window", () => {
    // 2025-06-09 is yesterday — past regardless of night-set
    expect(
      stateFor(denverMidnightMDT("2025-06-09"), { overnightNights: new Set() }),
    ).toBe("past");
  });

  it("busy takes precedence over out-of-window", () => {
    const busyResident = [
      range("2025-06-15T06:00:00Z", "2025-06-16T06:00:00Z"),
    ];
    expect(
      stateFor(denverMidnightMDT("2025-06-15"), {
        busyResident,
        overnightNights: new Set(), // not in set, but busy wins
      }),
    ).toBe("busy");
  });
});

// ---------------------------------------------------------------------------
// validateStayRange
// ---------------------------------------------------------------------------

describe("validateStayRange", () => {
  // January (MST). All nights in the stay are in the set.
  const now = new Date("2025-01-01T00:00:00Z");
  // Night-set covers all of January
  const januaryNights = new Set(
    Array.from({ length: 31 }, (_, i) => {
      const d = i + 1;
      return `2025-01-${String(d).padStart(2, "0")}`;
    }),
  );

  it("accepts a 2-night in-window stay and returns nights + a 6:30am start", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: januaryNights,
      busyResident: [],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nights).toBe(2);
      // 6:30am MST = 13:30 UTC.
      expect(result.range.startsAt.toISOString()).toBe(
        "2025-01-15T13:30:00.000Z",
      );
      expect(result.range.endsAt.toISOString()).toBe(
        "2025-01-17T13:30:00.000Z",
      );
    }
  });

  it("rejects check-out before check-in", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-17"),
      checkOut: denverMidnightMST("2025-01-15"),
      overnightNights: januaryNights,
      busyResident: [],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at least one night/i);
  });

  it("rejects a same-day (zero-night) selection", () => {
    const day = denverMidnightMST("2025-01-15");
    const result = validateStayRange({
      checkIn: day,
      checkOut: day,
      overnightNights: januaryNights,
      busyResident: [],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a stay straddling a resident booking", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: januaryNights,
      busyResident: [range("2025-01-16T00:00:00Z", "2025-01-18T00:00:00Z")],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/overlap/i);
  });

  it("rejects a stay where one interior night is missing from the set", () => {
    // Remove 2025-01-16 from the set
    const partialNights = new Set(januaryNights);
    partialNights.delete("2025-01-16");
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: partialNights,
      busyResident: [],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/availability/i);
  });

  it("rejects a stay with empty night-set (outside availability)", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: new Set(),
      busyResident: [],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/availability/i);
  });

  it("rejects a check-in inside the lead-time window", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: januaryNights,
      busyResident: [],
      rules: RULES,
      now: new Date("2025-01-15T10:00:00Z"), // only ~3.5h before the 13:30Z start → lead < 24h
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too soon/i);
  });

  it("rejects a check-in beyond hard-max-advance", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      overnightNights: januaryNights,
      busyResident: [],
      rules: RULES,
      now: new Date("2024-09-01T00:00:00Z"), // ~136 days before check-in
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too far/i);
  });

  it("DST-spanning stay (spring-forward 2026): all nights in set → ok:true with correct count", () => {
    // US/Denver spring-forward 2026: clocks spring forward at 2026-03-08 02:00 MST → 03:00 MDT
    // Stay: 2026-03-06 (MST) to 2026-03-10 (MDT) = 4 nights covering 03-06, 03-07, 03-08, 03-09
    // now = 2026-02-01 (well before, within 90-day window of 2026-03-06)
    const now2026 = new Date("2026-02-01T00:00:00Z");
    const checkIn = new Date("2026-03-06T07:00:00Z"); // Denver midnight MST (UTC-7)
    const checkOut = new Date("2026-03-10T06:00:00Z"); // Denver midnight MDT (UTC-6)
    const dstNights = new Set([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08", // DST transition night
      "2026-03-09",
    ]);
    const result = validateStayRange({
      checkIn,
      checkOut,
      overnightNights: dstNights,
      busyResident: [],
      rules: RULES,
      now: now2026,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nights).toBe(4);
    }
  });

  it("DST-spanning stay (fall-back 2026): all nights in set → ok:true with correct count", () => {
    // US/Denver fall-back 2026: clocks fall back at 2026-11-01 02:00 MDT → 01:00 MST
    // Stay: 2026-10-30 (MDT) to 2026-11-03 (MST) = 4 nights covering 10-30, 10-31, 11-01, 11-02
    // now = 2026-10-01 (within 90-day window)
    const now2026 = new Date("2026-10-01T00:00:00Z");
    const checkIn = new Date("2026-10-30T06:00:00Z"); // Denver midnight MDT (UTC-6)
    const checkOut = new Date("2026-11-03T07:00:00Z"); // Denver midnight MST (UTC-7)
    const dstNights = new Set([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01", // DST transition night
      "2026-11-02",
    ]);
    const result = validateStayRange({
      checkIn,
      checkOut,
      overnightNights: dstNights,
      busyResident: [],
      rules: RULES,
      now: now2026,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nights).toBe(4);
    }
  });
});
