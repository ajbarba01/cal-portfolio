"use client";

/**
 * BusySidePanel — admin booking management for one selected booking. Shows the
 * client name, assigned pets (photos + names), status, and the actions valid for
 * that status. Presentational: every action dispatches a caller callback that
 * wraps the existing server actions (cancel / approve / decline / no-show); this
 * panel reimplements no booking logic.
 *
 * Status → actions:
 *   pending_approval → Approve / Decline / Cancel
 *   confirmed        → Mark no-show / Cancel
 *   (terminal states never reach here — enriched busy carries active bookings.)
 */

import { Button } from "@/components/ui/button";
import { PetAvatar } from "@/features/booking/_components/pet-avatar";
import type { AdminBusyRangeView } from "@/features/admin/admin-busy";

const DENVER_TZ = "America/Denver";

function denverLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface BusySidePanelProps {
  booking: AdminBusyRangeView;
  onClose: () => void;
  onCancel: (bookingId: string) => void;
  onApprove: (bookingId: string) => void;
  onDecline: (bookingId: string) => void;
  onNoShow: (bookingId: string) => void;
  pending: boolean;
}

export function BusySidePanel({
  booking,
  onClose,
  onCancel,
  onApprove,
  onDecline,
  onNoShow,
  pending,
}: BusySidePanelProps) {
  const isPending = booking.status === "pending_approval";
  const isConfirmed = booking.status === "confirmed";

  return (
    <aside
      aria-label="Booking details"
      className="border-border bg-background flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            {booking.clientName ?? "Unknown client"}
          </h2>
          <p className="text-muted-foreground text-xs">{booking.status}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        {denverLabel(booking.startsAt)} — {denverLabel(booking.endsAt)}
      </p>

      {booking.pets.length > 0 && (
        <ul className="flex flex-col gap-2">
          {booking.pets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <PetAvatar
                name={p.name}
                species={p.species}
                photoUrl={p.photoUrl}
                size={28}
              />
              <span className="text-foreground">{p.name}</span>
              <span className="text-muted-foreground">({p.species})</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {isPending && (
          <>
            <Button
              size="sm"
              onClick={() => onApprove(booking.bookingId)}
              disabled={pending}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecline(booking.bookingId)}
              disabled={pending}
            >
              Decline
            </Button>
          </>
        )}
        {isConfirmed && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNoShow(booking.bookingId)}
            disabled={pending}
          >
            Mark no-show
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onCancel(booking.bookingId)}
          disabled={pending}
        >
          Cancel booking
        </Button>
      </div>
    </aside>
  );
}
