"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useAvailability,
  useBusyRanges,
  hourlySchedulerData,
  denverMidnight,
  denverDayKey,
  createBooking,
  rescheduleBooking,
  Scheduler,
  BOOK_WALK_CAPABILITIES,
} from "@/features/booking/index.client";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import type {
  SchedulerData,
  BusyBlock,
  ScheduleSelectionState,
  BookingRuleSettings,
  PublicBusyRange,
} from "@/features/booking/index.client";

const MEET_GREET_SLUG = "meet-greet";

/** UTC ISO → friendly America/Denver date+time. */
function formatDenver(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Slim meet-and-greet scheduler. Reuses the same <Scheduler> (week-slots, same
 * day/time UI as walks) + availability/busy hooks, but drops the paid-booking
 * machinery (pets, pricing/quote, recurring, deferred-auth gate). When `reschedule`
 * is passed it pre-selects the existing slot, shows the your-booking dot + a
 * from→to summary, and calls rescheduleBooking instead of createBooking.
 */
export function MeetGreetScheduler({
  rules,
  initialBusy,
  durationMin = 30,
  reschedule,
  onBooked,
}: {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  durationMin?: number;
  /** Reschedule mode: the existing booking id + its current start (ISO). */
  reschedule?: { bookingId: string; fromStartsAt: string };
  /** Called after a successful book/reschedule (parent re-renders into booked state). */
  onBooked?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const durationMs = durationMin * 60_000;

  const { openWindows, loading, error } = useAvailability({
    durationMs,
    rules,
  });
  const { busy, refresh: refreshBusy } = useBusyRanges(
    MEET_GREET_SLUG,
    initialBusy,
  );

  // Pre-select the existing slot when rescheduling: drives the Scheduler's
  // initial selection (muted/selected block) and the your-booking dot.
  const initialSlot = useMemo(() => {
    if (!reschedule) return undefined;
    const from = new Date(reschedule.fromStartsAt);
    const dayKey = denverDayKey(from);
    const minute = Math.round(
      (from.getTime() - denverMidnight(dayKey).getTime()) / 60_000,
    );
    return { dayKey, minute };
  }, [reschedule]);

  const busyRanges = useMemo<BusyBlock[]>(
    () =>
      busy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        id: `pub-${b.startsAt}-${b.endsAt}`,
      })),
    [busy],
  );

  const myBookings = useMemo(
    () => (initialSlot ? new Set([initialSlot.dayKey]) : new Set<string>()),
    [initialSlot],
  );

  const data = useMemo<SchedulerData>(
    () =>
      hourlySchedulerData({
        now,
        openWindows,
        busy: busyRanges,
        durationMin,
        rules,
        myBookings,
      }),
    [now, openWindows, busyRanges, durationMin, rules, myBookings],
  );

  const capabilities = useMemo(
    () => ({
      ...BOOK_WALK_CAPABILITIES,
      weekNavigable: false,
      intervalMinutes: durationMin,
    }),
    [durationMin],
  );

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const onSelectionChange = useCallback((state: ScheduleSelectionState) => {
    if (state.gridDraft.size === 0) {
      setSelectedStart(null);
      return;
    }
    const [cell] = state.gridDraft;
    const atIdx = cell.indexOf("@");
    if (atIdx === -1) return;
    const dayKey = cell.slice(0, atIdx);
    const minute = parseInt(cell.slice(atIdx + 1), 10);
    if (isNaN(minute)) return;
    setSelectedStart(
      new Date(denverMidnight(dayKey).getTime() + minute * 60_000),
    );
  }, []);

  function handleConfirm() {
    if (!selectedStart) return;
    const startsAt = selectedStart;
    const endsAt = new Date(startsAt.getTime() + durationMs);
    startSubmitting(async () => {
      const result = reschedule
        ? await rescheduleBooking({ bookingId: reschedule.bookingId, startsAt })
        : await createBooking({
            serviceSlug: MEET_GREET_SLUG,
            startsAt,
            endsAt,
            quantities: {},
            recurringRule: null,
          });
      if (result.kind === "success") {
        toast.add({
          type: "success",
          title: reschedule
            ? "Meet & greet rescheduled"
            : "Meet & greet booked",
        });
        void refreshBusy();
        onBooked?.();
        router.refresh();
      } else {
        toast.add({
          title: "Couldn't save your time",
          description: `Please try another slot (${result.kind}).`,
          type: "error",
        });
      }
    });
  }

  if (error) {
    return <ErrorState title="Couldn't load availability" message={error} />;
  }
  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">Loading availability…</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Scheduler
        capabilities={capabilities}
        data={data}
        onSelectionChange={onSelectionChange}
        initialSlot={initialSlot}
      >
        <Scheduler.MonthGrid />
        <Scheduler.Legend className="mt-5" />
        <div className="mt-6">
          <Scheduler.DayTimeline />
        </div>
        <Scheduler.BookingDetailsPanel />
      </Scheduler>

      {reschedule && selectedStart ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Rescheduling from{" "}
          <span className="text-foreground font-medium">
            {formatDenver(new Date(reschedule.fromStartsAt))}
          </span>{" "}
          to{" "}
          <span className="text-foreground font-medium">
            {formatDenver(selectedStart)}
          </span>
        </p>
      ) : null}

      <Button
        onClick={handleConfirm}
        disabled={!selectedStart || isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting
          ? reschedule
            ? "Rescheduling…"
            : "Booking…"
          : reschedule
            ? "Confirm"
            : "Confirm meet & greet"}
      </Button>
    </div>
  );
}
