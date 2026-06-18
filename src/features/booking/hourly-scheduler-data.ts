import { denverDayKey, denverMidnight } from "./availability";
import { hourlyAvailableDayKeys } from "./calendar-model";
import type { BookingRuleSettings, TimeRange } from "./availability";
import type { SchedulerData, BusyBlock } from "./_components/scheduler";

export interface HourlySchedulerDataInput {
  now: Date;
  openWindows: TimeRange[];
  busy: BusyBlock[];
  durationMin: number;
  /** Minutes between candidate slot-start times (the start grid). Separate from block length. */
  granularityMin: number;
  rules: BookingRuleSettings;
  myBookings: Set<string>;
  premiumDays: Set<string>;
  /** Minutes of drive buffer for the viewer's candidate. Defaults to 0. */
  bufferMin: number;
}

/**
 * Builds the week-slots SchedulerData for an hourly service.
 * Duration changes re-derive which days have at least one bookable start.
 *
 * U2: Days within the lead-time window are excluded from the available day set
 * so they render grey (unavailable) in the month grid instead of surfacing a
 * post-selection error. A day is lead-time-blocked when no start on that day
 * can satisfy `startTime >= now + minLeadTimeHours`.
 */
export function hourlySchedulerData({
  now,
  openWindows,
  busy,
  durationMin,
  granularityMin,
  rules,
  myBookings,
  premiumDays,
  bufferMin,
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
    granularityMin,
    leadTimeMs: rules.minLeadTimeHours * 60 * 60 * 1000,
    now,
    bufferMin,
  });

  return {
    overnightNights,
    windows: openWindows,
    busy,
    busyResident: [],
    myBookings,
    premiumDays,
    rules,
    now,
    viewerDriveBufferMin: bufferMin,
  };
}
