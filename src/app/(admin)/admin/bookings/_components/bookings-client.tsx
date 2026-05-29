"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  approveBooking,
  declineBooking,
} from "@/features/admin/approval-actions";
import type { PendingBookingRow } from "@/features/admin/approval-actions";

export function BookingsClient({
  initialBookings,
}: {
  initialBookings: PendingBookingRow[];
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function removeBooking(id: string) {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleApprove(bookingId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveBooking(bookingId);
      if (result.kind === "success") {
        removeBooking(bookingId);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  async function handleDecline(bookingId: string) {
    setError(null);
    startTransition(async () => {
      const result = await declineBooking(bookingId);
      if (result.kind === "success") {
        removeBooking(bookingId);
      } else {
        setError(
          "message" in result
            ? result.message
            : `Action failed: ${result.kind}`,
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {bookings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No pending bookings.</p>
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <li
              key={b.id}
              className="flex items-start justify-between gap-4 rounded-md border px-4 py-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {new Date(b.starts_at).toLocaleString("en-US", {
                    timeZone: "America/Denver",
                  })}
                  {" — "}
                  {new Date(b.ends_at).toLocaleString("en-US", {
                    timeZone: "America/Denver",
                  })}
                </p>
                <p className="text-muted-foreground">Client: {b.client_id}</p>
                <p className="text-muted-foreground">
                  Total: ${(b.final_cents / 100).toFixed(2)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(b.id)}
                  disabled={isPending}
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDecline(b.id)}
                  disabled={isPending}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
