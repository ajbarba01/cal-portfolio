import Link from "next/link";
import { Clock, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Surface } from "@/components/ui/surface";
import type { BookingCalendarRow } from "@/features/admin";

const TIME_ZONE = "America/Denver";

function formatDenverTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function todayLabel(date: Date): string {
  // "Tue Jun 11"
  return date.toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Detect whether a booking is a "sit" by checking the service name for
 * common sit/drop-in keywords. Returns "sit" or "walk" for coloring.
 */
function serviceKind(serviceName: string | null): "sit" | "walk" {
  if (!serviceName) return "walk";
  const lower = serviceName.toLowerCase();
  if (
    lower.includes("sit") ||
    lower.includes("drop") ||
    lower.includes("house") ||
    lower.includes("overnight")
  ) {
    return "sit";
  }
  return "walk";
}

export interface TodayTimelineProps {
  /** Pre-filtered to today; ordering is handled internally. */
  bookings: BookingCalendarRow[];
  now: Date;
}

export function TodayTimeline({ bookings, now }: TodayTimelineProps) {
  const sorted = [...bookings].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
  const label = todayLabel(now);
  const count = sorted.length;

  return (
    <Surface as="section" variant="emphasis" aria-label="Today's bookings">
      {/* Inner clip wrapper rounds the header band; overflow-hidden can't sit on
          the emphasis Surface itself — it would clip the bleeding shimmer ring. */}
      <div className="rounded-card overflow-hidden">
        {/* Header */}
        <div className="bg-secondary text-secondary-foreground border-border flex items-center gap-2 border-b px-4 py-[11px] text-[11.5px] font-bold tracking-wider uppercase">
          <Clock className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
          Today · {label} · {count} {count === 1 ? "booking" : "bookings"}
        </div>

        {count === 0 ? (
          <p className="text-muted-foreground px-4 py-4 text-sm italic">
            No bookings today.
          </p>
        ) : (
          <ul role="list" className="flex flex-col gap-2 p-3">
            {sorted.map((booking) => {
              const kind = serviceKind(booking.service_name);
              const time = formatDenverTime(booking.starts_at);
              const isSit = kind === "sit";

              return (
                <li key={booking.id}>
                  <Link
                    href={`/admin/bookings?booking=${booking.id}`}
                    className={cn(
                      "focus-visible:ring-ring flex items-center gap-2 rounded-[9px] px-[11px] py-[9px] text-[13px] no-underline transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                      isSit
                        ? "bg-status-available text-status-available-foreground"
                        : "bg-status-booked text-status-booked-foreground",
                    )}
                  >
                    <span className="font-bold tabular-nums">{time}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {booking.client_name ?? "Unknown client"} —{" "}
                      {booking.service_name ?? "Service"}
                    </span>
                    <ChevronRight
                      className="ml-auto h-[15px] w-[15px] shrink-0 opacity-50"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-muted-foreground px-4 pb-3 text-[11.5px] italic">
          Read-only — click any booking to open it on the Bookings page.
        </p>
      </div>
    </Surface>
  );
}
