/**
 * RED tests for server-side holiday-days derivation.
 *
 * Tests the pure `deriveHolidayDays` function before implementation exists.
 * Follows red-first TDD: all tests should fail until the function is exported.
 */

import { describe, it, expect } from "vitest";
import { deriveHolidayDays } from "./booking-service-shared";

// Denver-midnight instants for specific dates (Mountain Standard Time = UTC-7)
// MST: UTC-7 → midnight Denver = 07:00 UTC
// MDT: UTC-6 → midnight Denver = 06:00 UTC
// Use UTC times that reliably land on the correct Denver calendar day.

/** Denver midnight for 2026-12-25 (MST, UTC-7) = 07:00 UTC */
const DEC_25 = new Date("2026-12-25T07:00:00Z");
/** Denver midnight for 2026-12-26 (MST) = 07:00 UTC */
const DEC_26 = new Date("2026-12-26T07:00:00Z");
/** Denver midnight for 2026-12-28 (MST) = 07:00 UTC */
const DEC_28 = new Date("2026-12-28T07:00:00Z");

/** Denver midnight for 2026-07-04 (MDT, UTC-6) = 06:00 UTC */
const JUL_04 = new Date("2026-07-04T06:00:00Z");
/** Denver midnight for 2026-07-06 (MDT) = 06:00 UTC */
const JUL_06 = new Date("2026-07-06T06:00:00Z");

/** Non-premium date */
const JAN_10 = new Date("2026-01-10T07:00:00Z");
const JAN_11 = new Date("2026-01-11T07:00:00Z");

describe("deriveHolidayDays", () => {
  // ── house_sitting ──────────────────────────────────────────────────────────

  it("house_sitting: 0 premium days when none in range", () => {
    // Stay: Jan 10 → Jan 11 (1 night); no premium dates set
    expect(deriveHolidayDays("house_sitting", JAN_10, JAN_11, [])).toBe(0);
  });

  it("house_sitting: 1 premium day when stay overlaps 1 premium date", () => {
    // Stay: Dec 24 → Dec 26 (2 nights, covers Dec 24 + Dec 25)
    // Premium: Dec 25 only → 1 day
    const DEC_24 = new Date("2026-12-24T07:00:00Z");
    expect(
      deriveHolidayDays("house_sitting", DEC_24, DEC_26, ["2026-12-25"]),
    ).toBe(1);
  });

  it("house_sitting: 3-night stay spanning 2 premium days counts 2", () => {
    // Stay: Dec 25 → Dec 28 (3 nights, covers Dec 25, Dec 26, Dec 27)
    // Premium: Dec 25, Dec 26 → 2 days
    expect(
      deriveHolidayDays("house_sitting", DEC_25, DEC_28, [
        "2026-12-25",
        "2026-12-26",
      ]),
    ).toBe(2);
  });

  it("house_sitting: all 3 nights are premium → count 3", () => {
    // Stay: Dec 25 → Dec 28 (3 nights, covers Dec 25, Dec 26, Dec 27)
    // Premium: all three → 3 days
    expect(
      deriveHolidayDays("house_sitting", DEC_25, DEC_28, [
        "2026-12-25",
        "2026-12-26",
        "2026-12-27",
      ]),
    ).toBe(3);
  });

  it("house_sitting: checkout day is NOT counted (half-open range [checkIn, checkOut))", () => {
    // Stay: Dec 25 → Dec 26 (1 night, covers only Dec 25)
    // Premium: Dec 25 AND Dec 26 → only Dec 25 is in range → 1 day
    expect(
      deriveHolidayDays("house_sitting", DEC_25, DEC_26, [
        "2026-12-25",
        "2026-12-26",
      ]),
    ).toBe(1);
  });

  it("house_sitting: premium date outside range is not counted", () => {
    // Stay: Jan 10 → Jan 11 (1 night)
    // Premium: Dec 25 — entirely outside → 0 days
    expect(
      deriveHolidayDays("house_sitting", JAN_10, JAN_11, ["2026-12-25"]),
    ).toBe(0);
  });

  it("house_sitting: DST-safe — July 4 stay counted correctly (MDT)", () => {
    // Stay: Jul 4 → Jul 6 (2 nights, covers Jul 4 + Jul 5)
    // Premium: Jul 4 → 1 day
    expect(
      deriveHolidayDays("house_sitting", JUL_04, JUL_06, ["2026-07-04"]),
    ).toBe(1);
  });

  // ── hourly services (walk, check_in, training) ─────────────────────────────
  // holidayDays for hourly = 0 or 1 (the service's calendar day in Denver)

  it("walk: returns 1 when the service day is premium", () => {
    // Walk on Dec 25 at some time during the day
    const walkStart = new Date("2026-12-25T15:00:00Z"); // 8am MST
    const walkEnd = new Date("2026-12-25T16:00:00Z");
    expect(deriveHolidayDays("walk", walkStart, walkEnd, ["2026-12-25"])).toBe(
      1,
    );
  });

  it("walk: returns 0 when the service day is not premium", () => {
    const walkStart = new Date("2026-12-25T15:00:00Z");
    const walkEnd = new Date("2026-12-25T16:00:00Z");
    expect(deriveHolidayDays("walk", walkStart, walkEnd, ["2026-12-26"])).toBe(
      0,
    );
  });

  it("check_in: returns 1 when the service day is premium", () => {
    const start = new Date("2026-07-04T15:00:00Z"); // Jul 4, MDT
    const end = new Date("2026-07-04T16:00:00Z");
    expect(deriveHolidayDays("check_in", start, end, ["2026-07-04"])).toBe(1);
  });

  it("check_in: returns 0 when no premium dates set", () => {
    const start = new Date("2026-07-04T15:00:00Z");
    const end = new Date("2026-07-04T16:00:00Z");
    expect(deriveHolidayDays("check_in", start, end, [])).toBe(0);
  });

  it("training: returns 1 when service day is premium", () => {
    const start = new Date("2026-12-25T16:00:00Z");
    const end = new Date("2026-12-25T18:00:00Z");
    expect(deriveHolidayDays("training", start, end, ["2026-12-25"])).toBe(1);
  });

  it("meet_greet: always returns 0 (free service, no surcharge)", () => {
    const start = new Date("2026-12-25T16:00:00Z");
    const end = new Date("2026-12-25T17:00:00Z");
    expect(deriveHolidayDays("meet_greet", start, end, ["2026-12-25"])).toBe(0);
  });
});
