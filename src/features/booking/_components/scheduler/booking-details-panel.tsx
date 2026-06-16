"use client";

/**
 * BookingDetailsPanel — read-only inspector for the currently inspected booking.
 *
 * Appears only when selection.inspectedBookingId is non-null and matches a
 * block in data.busy or data.busyResident. Renders a card with the booking
 * label (if present) and a Denver-formatted date/time range. Provides a
 * dismiss button to call selection.clearInspection().
 *
 * Token-only colors. No date-fns dependency; uses Intl/toLocaleString with
 * timeZone "America/Denver". Whole-day detection reuses denverMinutesSinceMidnight
 * from @/features/booking/availability (DST-correct).
 */

import { X } from "lucide-react";
import { useScheduler } from "@/features/booking/scheduler-context";
import { denverMinutesSinceMidnight } from "@/features/booking/availability";
import type { BusyBlock } from "@/features/booking/scheduler-context";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface BookingDetailsPanelProps {
  className?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const DENVER_TZ = "America/Denver";

/** True when both ends of the block land on Denver midnight (whole-day block). */
function isWholeDayBlock(block: BusyBlock): boolean {
  return (
    denverMinutesSinceMidnight(block.startsAt) === 0 &&
    denverMinutesSinceMidnight(block.endsAt) === 0
  );
}

/** "Jun 7" */
function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    month: "short",
    day: "numeric",
  });
}

/** "9:00 AM" */
function fmtTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Formats the booking range as a human-readable string.
 *
 * Whole-day: "Jun 7 – Jun 10"
 * Intraday:  "Jun 7, 9:00 AM – 10:00 AM"
 */
function formatRange(block: BusyBlock): string {
  if (isWholeDayBlock(block)) {
    return `${fmtDate(block.startsAt)} – ${fmtDate(block.endsAt)}`;
  }
  const startTime = fmtTime(block.startsAt);
  const endTime = fmtTime(block.endsAt);
  return `${fmtDate(block.startsAt)}, ${startTime} – ${endTime}`;
}

/** Finds the block by id, checking busy then busyResident. */
function findBlock(
  id: string,
  busy: BusyBlock[],
  busyResident: BusyBlock[],
): BusyBlock | undefined {
  return busy.find((b) => b.id === id) ?? busyResident.find((b) => b.id === id);
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function BookingDetailsPanel({ className }: BookingDetailsPanelProps) {
  const { selection, data } = useScheduler();
  const id = selection.inspectedBookingId;

  if (id === null) return null;

  const block = findBlock(id, data.busy, data.busyResident);

  if (block === undefined) return null;

  return (
    <Surface
      as="section"
      variant="plain"
      aria-label="Booking details"
      className={cn("p-3", className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Booking</h3>
          {block.label !== undefined && (
            <p className="text-muted-foreground text-sm">{block.label}</p>
          )}
          <p className="text-muted-foreground text-xs">{formatRange(block)}</p>
        </div>
        <button
          type="button"
          aria-label="Close booking details"
          onClick={selection.clearInspection}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </Surface>
  );
}
