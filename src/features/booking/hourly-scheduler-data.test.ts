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
      rules,
      myBookings: new Set<string>(),
    });
    expect(Array.isArray(data.overnightNights)).toBe(false);
    expect(data.busyResident).toEqual([]);
    expect(data.rules).toBe(rules);
    expect(data.now).toBe(now);
  });
});
