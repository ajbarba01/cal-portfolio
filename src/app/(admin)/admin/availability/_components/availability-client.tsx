"use client";

/**
 * AvailabilityClient — Cal's availability + booking management via the
 * compound <Scheduler>. The Scheduler handles window creation/block-out and
 * overnight-night toggling. This client owns the wiring: it passes mutation
 * callbacks to the Scheduler, preserves booking moderation (cancel/approve/
 * decline/no-show) via the BusySidePanel, and uses router.refresh() to reload
 * server-rendered data after mutations.
 *
 * Server data (windows, busy, nights, rules) flows straight from props —
 * refresh re-renders the page and hands down fresh props, so there is no
 * client copy to drift.
 *
 * Scheduler callbacks deliberately do NOT route through run() — they return
 * the action result directly so panels can render conflicts/feedback. Booking
 * moderation still uses run() (fire-and-forget, result surfaced via error state).
 */

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createWindowsBatch,
  setWindowUnavailable,
} from "@/features/admin/availability-actions";
import { setOvernightNightsBatch } from "@/features/admin/overnight-actions";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import { cancelBooking, markNoShow } from "@/features/booking/actions";
import { Scheduler } from "@/features/booking/_components/scheduler";
import { ADMIN_CAPABILITIES } from "@/features/booking/schedule-capabilities";
import type {
  SchedulerData,
  SchedulerCallbacks,
} from "@/features/booking/_components/scheduler";
import type { AvailabilityWindow } from "@/features/admin/availability-actions";
import type { AdminBusyRangeView } from "@/features/admin/admin-busy";
import type { BookingRuleSettings } from "@/features/booking/availability";
import { BusySidePanel } from "./busy-side-panel";

type ActionResult = { kind: string } & Record<string, unknown>;

function resultError(result: ActionResult): string | null {
  if (result.kind === "success") return null;
  return typeof result.message === "string"
    ? result.message
    : `Action failed: ${result.kind}`;
}

const DENVER_TZ = "America/Denver";

function denverLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AvailabilityClient({
  initialWindows,
  initialBusy,
  initialNights,
  rules,
}: {
  initialWindows: AvailabilityWindow[];
  initialBusy: AdminBusyRangeView[];
  initialNights: string[];
  rules: BookingRuleSettings;
}) {
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedBooking =
    initialBusy.find((b) => b.bookingId === selectedBookingId) ?? null;

  /** Run a server action, surface any error, refresh on success. */
  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      const message = resultError(result);
      if (message) {
        setError(message);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  const data: SchedulerData = useMemo(
    () => ({
      overnightNights: new Set(initialNights),
      windows: initialWindows.map((w) => ({
        startsAt: new Date(w.starts_at),
        endsAt: new Date(w.ends_at),
      })),
      busy: initialBusy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
      })),
      // AdminBusyRangeView has no concurrency class, so we pass all admin busy
      // here too; this slightly over-marks non-resident days in the month
      // (cosmetic only; admin can still select them). A future enrichment can
      // add class to narrow this.
      busyResident: initialBusy.map((b) => ({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
      })),
      rules,
      now: new Date(),
    }),
    [initialWindows, initialBusy, initialNights, rules],
  );

  const callbacks: SchedulerCallbacks = useMemo(
    () => ({
      createWindowsBatch: async (input) => {
        const r = await createWindowsBatch(input);
        if (r.kind === "success") router.refresh();
        return r;
      },
      setWindowUnavailable: async (input) => {
        const r = await setWindowUnavailable(input);
        if (r.kind === "success") router.refresh();
        return r;
      },
      setOvernightNightsBatch: async (input) => {
        const r = await setOvernightNightsBatch(input);
        if (r.kind === "success") router.refresh();
        return r;
      },
    }),
    [router],
  );

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Scheduler
        capabilities={ADMIN_CAPABILITIES}
        data={data}
        callbacks={callbacks}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-3">
            <Scheduler.MonthGrid />
            <Scheduler.SelectionSummary />
          </div>
          <Scheduler.DayPanel />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_16rem]">
          <Scheduler.WeekGrid />
          <Scheduler.WeekActions />
        </div>
      </Scheduler>

      {/* Bookings — select a booking to open the moderation panel */}
      {initialBusy.length > 0 && (
        <section aria-label="Bookings">
          <h2 className="text-foreground mb-2 text-sm font-semibold">
            Bookings
          </h2>
          <ul className="flex flex-col gap-1">
            {initialBusy.map((b) => (
              <li key={b.bookingId}>
                <button
                  type="button"
                  onClick={() => setSelectedBookingId(b.bookingId)}
                  className="bg-card border-border hover:bg-accent text-foreground w-full rounded border px-3 py-2 text-left text-xs transition-colors"
                >
                  <span className="font-medium">
                    {b.clientName ?? "Unknown client"}
                  </span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="text-muted-foreground">{b.status}</span>
                  <span className="text-muted-foreground mx-1">·</span>
                  <span className="text-muted-foreground">
                    {denverLabel(b.startsAt)} — {denverLabel(b.endsAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedBooking && (
        <BusySidePanel
          booking={selectedBooking}
          pending={isPending}
          onClose={() => setSelectedBookingId(null)}
          onCancel={(id) =>
            run(
              () => cancelBooking({ bookingId: id }),
              () => setSelectedBookingId(null),
            )
          }
          onApprove={(id) => run(() => approveBooking(id))}
          onDecline={(id) =>
            run(
              () => declineBooking(id),
              () => setSelectedBookingId(null),
            )
          }
          onNoShow={(id) =>
            run(
              () => markNoShow(id),
              () => setSelectedBookingId(null),
            )
          }
        />
      )}
    </div>
  );
}
