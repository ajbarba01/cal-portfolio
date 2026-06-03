"use client";

/**
 * MonthGrid — presentational check-in/check-out date picker for house_sitting.
 * Wraps the Calendar primitive in range mode; non-`available` days (derived by
 * the caller via deriveBookableDays) are disabled. Busy stays are listed below
 * with pet thumbnails (no owner identity). Owns NO business state — the caller
 * provides `days`/`busy` and owns the selected range + visible month.
 *
 * DAY-KEY BRIDGE: the Calendar yields local-midnight Dates; we key them by their
 * LOCAL Y-M-D (the cell's displayed calendar day) so they line up with the
 * Denver day keys the caller built via `denverMidnight`. date-fns is layout-only
 * here (formatting), never business rules.
 */

import { format } from "date-fns";
import { Calendar, type DateRange } from "@/components/ui/calendar";
import type { DayAvailability } from "../calendar-model";
import type { PublicBusyRange } from "../busy-ranges";
import { BusyPets } from "./busy-pets";

const DENVER_TZ = "America/Denver";

/** Local Y-M-D of a calendar cell Date ("YYYY-MM-DD"), matching the caller's keys. */
function localDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function rangeLabel(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    month: "short",
    day: "numeric",
  });
}

export interface MonthGridProps {
  /** Per-day classification for the visible month (caller-derived). */
  days: DayAvailability[];
  /** Resident busy stays (pet thumbnails only). */
  busy: PublicBusyRange[];
  /** Selected range (rdp Date pair). */
  range: DateRange | undefined;
  onRangeChange: (range: DateRange | undefined) => void;
  /** Visible month (rdp Date). */
  month: Date;
  onMonthChange: (month: Date) => void;
}

export function MonthGrid({
  days,
  busy,
  range,
  onRangeChange,
  month,
  onMonthChange,
}: MonthGridProps) {
  const byKey = new Map(days.map((d) => [d.dayKey, d]));

  // A day is selectable only when classified `available`. Unknown days (e.g. the
  // calendar shows leading/trailing days of adjacent months not in `days`) are
  // disabled until the user navigates and the caller re-derives them.
  const isDisabled = (date: Date): boolean => {
    const da = byKey.get(localDayKey(date));
    return !da || da.state !== "available";
  };

  return (
    <div className="flex flex-col gap-4">
      <Calendar
        mode="range"
        month={month}
        onMonthChange={onMonthChange}
        selected={range}
        onSelect={onRangeChange}
        disabled={isDisabled}
        className="border-border rounded-lg border"
      />

      {busy.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">
            Already booked
          </h3>
          <ul className="flex flex-col gap-1.5">
            {busy.map((b, i) => (
              <li
                key={i}
                className="border-border bg-muted text-muted-foreground flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <span>
                  {rangeLabel(new Date(b.startsAt))} –{" "}
                  {rangeLabel(new Date(b.endsAt))}
                </span>
                <BusyPets pets={b.pets} size={20} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
