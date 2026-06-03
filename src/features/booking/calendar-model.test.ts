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
  // now = mid-June (MDT). Window covers all of June.
  const now = new Date("2025-06-10T12:00:00Z");
  const windows = [range("2025-06-01T06:00:00Z", "2025-06-30T06:00:00Z")];

  function stateFor(
    day: Date,
    opts?: Partial<{ busyResident: TimeRange[]; windows: TimeRange[] }>,
  ) {
    const out = deriveBookableDays({
      days: [day],
      windows: opts?.windows ?? windows,
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

  it("classifies a near future day with no covering window as out-of-window", () => {
    expect(stateFor(denverMidnightMDT("2025-06-15"), { windows: [] })).toBe(
      "out-of-window",
    );
  });

  it("classifies a day beyond hardMaxAdvanceDays as too-far", () => {
    // ~112 days ahead of June 10.
    expect(stateFor(denverMidnightMDT("2025-09-30"))).toBe("too-far");
  });

  it("too-far takes precedence over out-of-window", () => {
    expect(stateFor(denverMidnightMDT("2025-09-30"), { windows: [] })).toBe(
      "too-far",
    );
  });

  it("classifies an empty day list as empty output", () => {
    expect(
      deriveBookableDays({
        days: [],
        windows,
        busyResident: [],
        rules: RULES,
        now,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateStayRange
// ---------------------------------------------------------------------------

describe("validateStayRange", () => {
  // January (MST). Window covers all of January.
  const now = new Date("2025-01-01T00:00:00Z");
  const windows = [range("2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z")];

  it("accepts a 2-night in-window stay and returns nights + a 6:30am start", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      windows,
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
      windows,
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
      windows,
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
      windows,
      busyResident: [range("2025-01-16T00:00:00Z", "2025-01-18T00:00:00Z")],
      rules: RULES,
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/overlap/i);
  });

  it("rejects a stay partly outside the availability window", () => {
    const result = validateStayRange({
      checkIn: denverMidnightMST("2025-01-15"),
      checkOut: denverMidnightMST("2025-01-17"),
      windows: [range("2025-01-01T00:00:00Z", "2025-01-16T00:00:00Z")],
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
      windows,
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
      windows,
      busyResident: [],
      rules: RULES,
      now: new Date("2024-09-01T00:00:00Z"), // ~136 days before check-in
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/too far/i);
  });
});
