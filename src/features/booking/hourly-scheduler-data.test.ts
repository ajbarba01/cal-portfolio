import { describe, it, expect } from "vitest";

import { hourlySchedulerData } from "./hourly-scheduler-data";
import type { BookingRuleSettings } from "./availability";

const rules: BookingRuleSettings = {
  bookingOpenMinute: 9 * 60,
  bookingCloseMinute: 17 * 60,
  minLeadTimeHours: 1,
  hardMaxAdvanceDays: 14,
};

describe("hourlySchedulerData", () => {
  it("returns the week-slots SchedulerData shape with empty busyResident", () => {
    const now = new Date("2026-06-10T12:00:00Z");
    const data = hourlySchedulerData({
      now,
      openWindows: [],
      busy: [],
      durationMin: 30,
      granularityMin: 15,
      rules,
      myBookings: new Set<string>(),
      premiumDays: new Set<string>(),
      bufferMin: 0,
    });
    expect(Array.isArray(data.overnightNights)).toBe(false);
    expect(data.busyResident).toEqual([]);
    expect(data.rules).toBe(rules);
    expect(data.now).toBe(now);
  });

  it("passes premiumDays through to the scheduler data", () => {
    const premiumDays = new Set(["2026-07-04"]);
    const data = hourlySchedulerData({
      now: new Date("2026-07-01T12:00:00Z"),
      openWindows: [],
      busy: [],
      durationMin: 60,
      granularityMin: 15,
      rules: {
        bookingOpenMinute: 540,
        bookingCloseMinute: 1020,
        minLeadTimeHours: 2,
        hardMaxAdvanceDays: 60,
      },
      myBookings: new Set(),
      premiumDays,
      bufferMin: 0,
    });
    expect(data.premiumDays).toBe(premiumDays);
  });
});

describe("hourlySchedulerData granularity", () => {
  it("passes a 5-minute start grid through to availability", () => {
    const now = new Date("2026-06-20T08:00:00-06:00");
    const open = {
      startsAt: new Date("2026-06-20T09:00:00-06:00"),
      endsAt: new Date("2026-06-20T09:20:00-06:00"),
    };
    const data = hourlySchedulerData({
      now,
      openWindows: [open],
      busy: [],
      durationMin: 15,
      granularityMin: 5,
      rules: { hardMaxAdvanceDays: 1, minLeadTimeHours: 0 } as never,
      myBookings: new Set(),
      premiumDays: new Set(),
      bufferMin: 0,
    });
    // A 20-min window fitting a 15-min booking on a 5-min grid has a bookable start.
    expect(data.overnightNights.size).toBeGreaterThan(0);
  });
});
