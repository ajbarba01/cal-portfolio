"use client";

/**
 * WeekGrid — presentational slot picker for time-bounded services (walk /
 * check_in / training). Renders availability-derived slots grouped by Denver
 * calendar day; busy slots are disabled and busy ranges show pet thumbnails
 * (no owner identity). Owns NO business state — the caller derives `slots`
 * (via deriveOpenSlots + markSlotsBusy) and `busy`, and owns the selection.
 */

import { denverDayKey } from "../availability";
import type { TimeRange } from "../availability";
import type { MarkedSlot } from "../calendar-model";
import type { PublicBusyRange } from "../busy-ranges";
import { BusyPets } from "./busy-pets";

const DENVER_TZ = "America/Denver";

function dayHeading(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function timeLabel(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface WeekGridProps {
  /** Availability-derived slots, already busy-marked by the caller. */
  slots: MarkedSlot[];
  /** Busy ranges for the service's concurrency class (pet thumbnails only). */
  busy: PublicBusyRange[];
  /** Epoch ms of the selected slot start, or null. */
  selectedStart: number | null;
  onSelectSlot: (slot: TimeRange) => void;
}

interface DayColumn {
  dayKey: string;
  date: Date;
  open: MarkedSlot[];
  busy: PublicBusyRange[];
}

function groupByDay(slots: MarkedSlot[], busy: PublicBusyRange[]): DayColumn[] {
  const cols = new Map<string, DayColumn>();
  const col = (date: Date): DayColumn => {
    const dayKey = denverDayKey(date);
    let c = cols.get(dayKey);
    if (!c) {
      c = { dayKey, date, open: [], busy: [] };
      cols.set(dayKey, c);
    }
    return c;
  };

  for (const s of slots) col(s.slot.startsAt).open.push(s);
  for (const b of busy) col(new Date(b.startsAt)).busy.push(b);

  return [...cols.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export function WeekGrid({
  slots,
  busy,
  selectedStart,
  onSelectSlot,
}: WeekGridProps) {
  const columns = groupByDay(slots, busy);

  if (columns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No open times right now. Check back later or contact Cal directly.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((c) => {
        const openSlots = c.open.filter((s) => !s.busy);
        return (
          <div key={c.dayKey} className="min-w-32 shrink-0">
            <h3 className="text-foreground mb-2 text-xs font-medium">
              {dayHeading(c.date)}
            </h3>
            <div className="flex flex-col gap-1.5">
              {openSlots.length === 0 && c.busy.length === 0 && (
                <span className="text-muted-foreground text-xs">—</span>
              )}
              {openSlots.map((s, i) => {
                const isSelected = selectedStart === s.slot.startsAt.getTime();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelectSlot(s.slot)}
                    aria-pressed={isSelected}
                    className={
                      "focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-3 " +
                      (isSelected
                        ? "border-foreground bg-secondary text-secondary-foreground"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    {timeLabel(s.slot.startsAt)}
                  </button>
                );
              })}
              {c.busy.map((b, i) => (
                <div
                  key={`busy-${i}`}
                  className="border-border bg-muted text-muted-foreground flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                >
                  <span>{timeLabel(new Date(b.startsAt))} busy</span>
                  <BusyPets pets={b.pets} size={20} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
