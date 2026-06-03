"use client";

/**
 * AvailabilityClient — Cal's availability + booking management on the shared
 * BookingCalendar (mode="manage-windows"). The calendar is presentational; this
 * client owns the wiring: it dispatches window CRUD (create/trim/delete) and
 * booking moderation (cancel/approve/decline/no-show) to the existing server
 * actions, then `router.refresh()` re-loads the server-rendered windows + busy.
 *
 * Server data (windows, busy) flows straight from props — refresh re-renders the
 * page and hands down fresh props, so there is no client copy to drift.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingCalendar } from "@/features/booking/_components/booking-calendar";
import {
  createWindow,
  trimWindow,
  deleteWindow,
} from "@/features/admin/availability-actions";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import { cancelBooking, markNoShow } from "@/features/booking/actions";
import type { AvailabilityWindow } from "@/features/admin/availability-actions";
import type { AdminBusyRangeView } from "@/features/admin/admin-busy";
import { BusySidePanel } from "./busy-side-panel";

type ActionResult = { kind: string } & Record<string, unknown>;

function resultError(result: ActionResult): string | null {
  if (result.kind === "success") return null;
  return typeof result.message === "string"
    ? result.message
    : `Action failed: ${result.kind}`;
}

export function AvailabilityClient({
  initialWindows,
  initialBusy,
}: {
  initialWindows: AvailabilityWindow[];
  initialBusy: AdminBusyRangeView[];
}) {
  const router = useRouter();
  const [month, setMonth] = useState<Date>(() => new Date());
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

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <BookingCalendar
        mode="manage-windows"
        windows={initialWindows}
        busy={initialBusy}
        month={month}
        onMonthChange={setMonth}
        onCreateWindow={(startsAt, endsAt, note) =>
          run(() => createWindow({ startsAt, endsAt, note }))
        }
        onTrimWindow={(windowId, newStartsAt, newEndsAt) =>
          run(() => trimWindow({ windowId, newStartsAt, newEndsAt }))
        }
        onDeleteWindow={(windowId) => run(() => deleteWindow({ windowId }))}
        onSelectBooking={setSelectedBookingId}
        pending={isPending}
      />

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
