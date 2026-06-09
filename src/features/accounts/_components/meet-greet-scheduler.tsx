"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvailability } from "@/features/booking/use-availability";
import { useBusyRanges } from "@/features/booking/use-busy-ranges";
import { hourlySchedulerData } from "@/features/booking/hourly-scheduler-data";
import { denverMidnight } from "@/features/booking/availability";
import { createBooking } from "@/features/booking/actions";
import { Scheduler } from "@/features/booking/_components/scheduler";
import { BOOK_WALK_CAPABILITIES } from "@/features/booking/schedule-capabilities";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import type {
  SchedulerData,
  BusyBlock,
} from "@/features/booking/_components/scheduler";
import type { ScheduleSelectionState } from "@/features/booking/schedule-selection";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PublicBusyRange } from "@/features/booking/busy-ranges";

const MEET_GREET_SLUG = "meet-greet";

/**
 * Slim meet-and-greet scheduler. Reuses the same <Scheduler> (week-slots, same
 * day/time UI as walks) + availability/busy hooks + createBooking, but drops the
 * paid-booking machinery (pets, pricing/quote, recurring, deferred-auth gate) —
 * the meet-and-greet is free. Used inside onboarding step 2.
 */
export function MeetGreetScheduler({
  rules,
  initialBusy,
  durationMin = 30,
  onBooked,
}: {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  durationMin?: number;
  /** Called after a successful booking (parent re-renders into booked state). */
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

  const busyRanges = useMemo<BusyBlock[]>(
    () =>
      busy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        id: `pub-${b.startsAt}-${b.endsAt}`,
      })),
    [busy],
  );

  const data = useMemo<SchedulerData>(
    () =>
      hourlySchedulerData({
        now,
        openWindows,
        busy: busyRanges,
        durationMin,
        rules,
        myBookings: new Set<string>(),
      }),
    [now, openWindows, busyRanges, durationMin, rules],
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
      const result = await createBooking({
        serviceSlug: MEET_GREET_SLUG,
        startsAt,
        endsAt,
        quantities: {},
        recurringRule: null,
      });
      if (result.kind === "success") {
        toast.add({ title: "Meet & greet booked" });
        void refreshBusy();
        onBooked?.();
        router.refresh();
      } else {
        toast.add({
          title: "Couldn't book",
          description: `Please try another time (${result.kind}).`,
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
      >
        <Scheduler.MonthGrid />
        <Scheduler.Legend className="mt-5" />
        <div className="mt-6">
          <Scheduler.DayTimeline />
        </div>
        <Scheduler.BookingDetailsPanel />
      </Scheduler>
      <Button
        onClick={handleConfirm}
        disabled={!selectedStart || isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "Booking…" : "Confirm meet & greet"}
      </Button>
    </div>
  );
}
