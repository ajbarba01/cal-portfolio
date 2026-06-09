import { denverDayKey, denverMidnight } from "./availability";
import { hourlyAvailableDayKeys } from "./calendar-model";
import type { BookingRuleSettings, TimeRange } from "./availability";
import type { SchedulerData, BusyBlock } from "./_components/scheduler";

export interface HourlySchedulerDataInput {
  now: Date;
  openWindows: TimeRange[];
  busy: BusyBlock[];
  durationMin: number;
  rules: BookingRuleSettings;
  myBookings: Set<string>;
}

/**
 * Builds the week-slots SchedulerData for an hourly service.
 * Duration changes re-derive which days have at least one bookable start.
 */
export function hourlySchedulerData({
  now,
  openWindows,
  busy,
  durationMin,
  rules,
  myBookings,
}: HourlySchedulerDataInput): SchedulerData {
  const days: Date[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= rules.hardMaxAdvanceDays; i++) {
    const key = denverDayKey(new Date(now.getTime() + i * 86_400_000));
    if (seen.has(key)) continue;
    seen.add(key);
    days.push(denverMidnight(key));
  }

  const overnightNights = hourlyAvailableDayKeys({
    days,
    windows: openWindows,
    busy,
    durationMin,
    granularityMin: 15,
  });

  return {
    overnightNights,
    windows: openWindows,
    busy,
    busyResident: [],
    myBookings,
    rules,
    now,
  };
}
