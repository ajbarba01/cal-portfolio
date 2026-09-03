"use client";

/**
 * BookingDayTimeline — read-only timeline of one day's booking blocks.
 *
 * A planner-style strip: hour gutter + vertically-positioned blocks for each
 * booking that day. Non-matching blocks are greyed; clicking a block isolates
 * it. This is deliberately NOT the shared `Scheduler.DayTimeline` (which renders
 * availability windows + a single selectable slot, not arbitrary booking
 * blocks) — keeping it separate guarantees the public booking timeline is
 * untouched.
 */

import { useMemo } from "react";
import { Home } from "lucide-react";

import { Surface } from "@/components/ui/surface";
// Imported from the shared lib rather than the booking barrel on purpose: this
// component is re-exported from the admin client barrel, which the site header
// pulls into every public page — reaching the booking barrel here would drag
// the Scheduler (and react-day-picker) into those pages' client bundles.
import {
  denverMidnight,
  denverMinutesSinceMidnight,
  denverTime,
  minutesToClock,
} from "@/lib/time-of-day";
import { cn } from "@/lib/utils";
import type { BookingCalendarRow } from "@/features/admin/bookings-calendar-actions";

// The timeline always shows the full day (00:00–24:00) so it stays stable
// regardless of which bookings fall on the selected day. ~0.45px/min keeps a
// full 24h ≈ 648px tall.
const PX_PER_MIN = 0.45;
const DAY_START_MIN = 0;
const DAY_END_MIN = 1440;
const DAY_MS = 86_400_000;

function hourLabel(min: number): string {
  const { hour12, meridiem } = minutesToClock(min);
  return `${hour12} ${meridiem}`;
}

export interface BookingDayTimelineProps {
  /** Denver day key ("YYYY-MM-DD") the timeline covers. */
  dayKey: string;
  /** That day's heading ("Sat, Jun 7"), reused verbatim in the empty state. */
  dayLabel: string;
  /** Every booking overlapping the day, including multi-day stays. */
  dayBookings: BookingCalendarRow[];
  matchedIds: Set<string>;
  searching: boolean;
  onIsolate: (id: string) => void;
}

export function BookingDayTimeline({
  dayKey,
  dayLabel,
  dayBookings,
  matchedIds,
  searching,
  onIsolate,
}: BookingDayTimelineProps) {
  // A booking that bleeds beyond this calendar day (starts earlier or ends later)
  // is a multi-day resident stay — it occupies the whole day, so it renders as an
  // all-day banner above the hour track rather than an hour-positioned block.
  // Bookings contained within the day (walks, check-ins) keep their hour slot.
  const { stays, placed } = useMemo(() => {
    const dayStartMs = denverMidnight(dayKey).getTime();
    const dayEndMs = dayStartMs + DAY_MS;
    const stays: {
      booking: BookingCalendarRow;
      role: string;
      nights: number;
    }[] = [];
    const placed: {
      booking: BookingCalendarRow;
      startMin: number;
      endMin: number;
    }[] = [];
    for (const b of dayBookings) {
      const s = new Date(b.starts_at).getTime();
      const e = new Date(b.ends_at).getTime();
      if (s < dayStartMs || e > dayEndMs) {
        const nights = Math.max(1, Math.round((e - s) / DAY_MS));
        // Which part of the stay this day is — encodes real info for Cal.
        const role =
          s >= dayStartMs
            ? "Check-in"
            : e <= dayEndMs
              ? "Check-out"
              : "Staying over";
        stays.push({ booking: b, role, nights });
      } else {
        const startMin = denverMinutesSinceMidnight(new Date(b.starts_at));
        let endMin = denverMinutesSinceMidnight(new Date(b.ends_at));
        if (endMin <= startMin) endMin = 1440; // defensive: same-day midnight cross
        placed.push({ booking: b, startMin, endMin });
      }
    }
    placed.sort((a, b) => a.startMin - b.startMin);
    return { stays, placed };
  }, [dayBookings, dayKey]);

  // Always render the full-day track (even when the day has no bookings) so the
  // timeline is a stable, complete clock under the month grid.
  const trackTop = DAY_START_MIN;
  const trackBottom = DAY_END_MIN;
  const trackHeight = (trackBottom - trackTop) * PX_PER_MIN;

  const hours: number[] = [];
  for (let h = trackTop; h < trackBottom; h += 60) hours.push(h);

  return (
    <div className="flex flex-col gap-2">
      {/* All-day resident stays (house-sitting) — a labeled banner per stay,
          shown on every day the stay covers, not positioned by hour. */}
      {stays.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {stays.map(({ booking, role, nights }) => {
            const isMatch = !searching || matchedIds.has(booking.id);
            return (
              <li key={booking.id}>
                <button
                  type="button"
                  onClick={() => onIsolate(booking.id)}
                  className={cn(
                    "focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    isMatch
                      ? "bg-status-booked text-status-booked-foreground hover:brightness-95"
                      : "bg-muted text-muted-foreground hover:brightness-95",
                  )}
                  title="Click to isolate this booking"
                >
                  <Home aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="truncate font-semibold">
                    {booking.client_name ?? "Unknown client"}
                  </span>
                  <span className="truncate opacity-80">
                    · {role} · {nights} night{nights === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Surface
        variant="plain"
        className="grid grid-cols-[3.25rem_1fr] overflow-hidden"
      >
        {/* hour gutter */}
        <div
          className="border-border relative border-r py-2"
          style={{ height: trackHeight }}
          aria-hidden="true"
        >
          {hours.map((min) => {
            const top = (min - trackTop) * PX_PER_MIN;
            return (
              <div
                key={min}
                className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[10px] font-medium"
                style={{ top: top + 8 }}
              >
                {hourLabel(min)}
              </div>
            );
          })}
        </div>

        {/* blocks */}
        <div className="relative p-2" style={{ height: trackHeight }}>
          {/* ruled hour lines */}
          {hours.map((min) => {
            const top = (min - trackTop) * PX_PER_MIN;
            return (
              <div
                key={min}
                className="border-border/50 pointer-events-none absolute inset-x-0 border-t"
                style={{ top: top + 8 }}
                aria-hidden="true"
              />
            );
          })}

          {placed.length === 0 && (
            <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
              {stays.length > 0
                ? "No time-specific bookings this day."
                : `No bookings on ${dayLabel}.`}
            </div>
          )}

          {placed.map(({ booking, startMin, endMin }) => {
            const top = (startMin - trackTop) * PX_PER_MIN;
            const height = Math.max((endMin - startMin) * PX_PER_MIN, 24);
            const isMatch = !searching || matchedIds.has(booking.id);
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => onIsolate(booking.id)}
                className={cn(
                  "focus-visible:ring-ring absolute inset-x-2 flex flex-col justify-center rounded-md px-2.5 py-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isMatch
                    ? "bg-status-booked text-status-booked-foreground hover:brightness-95"
                    : "bg-muted text-muted-foreground hover:brightness-95",
                )}
                style={{ top: top + 8, height }}
                title="Click to isolate this booking"
              >
                <span className="truncate font-semibold">
                  {denverTime(new Date(booking.starts_at))} ·{" "}
                  {booking.client_name ?? "Unknown client"}
                </span>
                {height >= 34 && (
                  <span className="truncate opacity-80">
                    {booking.service_name ?? "Service"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Surface>
    </div>
  );
}
