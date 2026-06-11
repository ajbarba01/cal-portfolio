import type { BusyBlock, SchedulerData } from "./scheduler-context";

const DAY_MS = 86_400_000;

/**
 * The ~5-month span of day-keys (UTC, "YYYY-MM-DD") centered roughly on
 * `monthStartIso`. Used to mark every day bookable in an INSPECT calendar so any
 * day can be clicked to reveal its — possibly empty — bookings, while covering a
 * couple of months of prev/next navigation without re-fetching.
 */
export function inspectDayKeys(monthStartIso: string): Set<string> {
  const keys = new Set<string>();
  const start = new Date(monthStartIso);
  const base = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 2, 1);
  for (let i = 0; i < 150; i += 1) {
    const d = new Date(base + i * DAY_MS);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    keys.add(`${yyyy}-${mm}-${dd}`);
  }
  return keys;
}

/**
 * Build read-only ("inspect") {@link SchedulerData} from booking busy-blocks.
 * Every day in {@link inspectDayKeys} is marked bookable so the MonthGrid lets
 * you click ANY day (even empty ones) to reveal its — possibly empty — timeline;
 * the busy blocks classify booked days as busy (resident overlap wins) so they
 * inspect rather than paint. Used by the admin Bookings hub. (The account
 * calendar wants only booked days highlighted, so it builds its own data with no
 * blanket availability — booked days stay clickable via the `inspectable`
 * capability + their busy classification.)
 */
export function buildInspectSchedulerData(input: {
  blocks: BusyBlock[];
  monthStartIso: string;
  nowIso: string;
  dimmedDays?: Set<string>;
}): SchedulerData {
  const { blocks, monthStartIso, nowIso, dimmedDays } = input;
  return {
    overnightNights: inspectDayKeys(monthStartIso),
    windows: [],
    busy: blocks,
    busyResident: blocks,
    rules: {
      bookingOpenMinute: 0,
      bookingCloseMinute: 1440,
      minLeadTimeHours: 0,
      hardMaxAdvanceDays: 3650,
    },
    now: new Date(nowIso),
    dimmedDays,
  };
}
