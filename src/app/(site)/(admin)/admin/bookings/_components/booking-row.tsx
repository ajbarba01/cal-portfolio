"use client";

import Link from "next/link";
import { Check, Circle, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { paymentPill } from "@/features/payments/index.client";
import type { BookingCalendarRow } from "@/features/admin";

// ── helpers ───────────────────────────────────────────────────────────────────

const TIME_ZONE = "America/Denver";

function readableRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      timeZone: TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
  const dateLabel = new Date(startsAt).toLocaleDateString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dateLabel}, ${fmt(startsAt)} – ${fmt(endsAt)}`;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── status Badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "No-show",
};

function statusBadgeVariant(
  status: string,
): "pending" | "available" | "default" | "destructive" | "unavailable" {
  if (status === "pending_approval") return "pending";
  if (status === "confirmed") return "available";
  if (status === "cancelled" || status === "declined" || status === "no_show")
    return "destructive";
  return "default";
}

// ── payment pill ──────────────────────────────────────────────────────────────

type PillTone = "paid" | "partial" | "refunded" | "unpaid";

const PAYMENT_PILL_CLASSES: Record<PillTone, string> = {
  paid: "bg-status-available text-status-available-foreground",
  partial: "bg-warning text-warning-foreground",
  refunded: "bg-status-unavailable text-status-unavailable-foreground",
  unpaid: "bg-muted text-muted-foreground",
};

function PaymentPillIcon({ tone }: { tone: PillTone }) {
  if (tone === "paid") return <Check className="size-3" aria-hidden />;
  if (tone === "refunded") return <RotateCcw className="size-3" aria-hidden />;
  return <Circle className="size-3" aria-hidden />;
}

// ── props ─────────────────────────────────────────────────────────────────────

export interface BookingRowProps {
  booking: BookingCalendarRow;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
}

// ── component ─────────────────────────────────────────────────────────────────

export function BookingRow({
  booking,
  onApprove,
  onDecline,
  onCancel,
  pending,
}: BookingRowProps) {
  const {
    id,
    client_id,
    client_name,
    service_name,
    status,
    starts_at,
    ends_at,
    final_cents,
    payment_status,
  } = booking;

  const pill = paymentPill(payment_status);
  const pillClasses = PAYMENT_PILL_CLASSES[pill.tone];

  const isPendingApproval = status === "pending_approval";
  const isConfirmed = status === "confirmed";
  const canEdit = isPendingApproval || isConfirmed;
  const canCancel = isPendingApproval || isConfirmed;

  return (
    <Surface as="li" variant="plain" className="p-3 text-sm">
      {/* top row: name + pills + amount */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/clients/${client_id}`}
          className="text-brand-strong font-semibold hover:underline"
        >
          {client_name ?? "Unknown client"}
        </Link>

        <Badge variant={statusBadgeVariant(status)}>
          {STATUS_LABELS[status] ?? status}
        </Badge>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillClasses}`}
        >
          <PaymentPillIcon tone={pill.tone} />
          {pill.label}
        </span>

        <span className="ml-auto font-semibold">{dollars(final_cents)}</span>
      </div>

      {/* meta line */}
      <p className="text-muted-foreground mt-1 text-xs">
        {service_name ?? "Service"} · {readableRange(starts_at, ends_at)}
      </p>

      {/* actions */}
      <div className="mt-2 flex flex-wrap gap-2">
        {isPendingApproval && (
          <>
            <Button
              size="sm"
              variant="brand"
              disabled={pending}
              onClick={() => onApprove(id)}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onDecline(id)}
            >
              Decline
            </Button>
          </>
        )}

        {canEdit && (
          <Link
            href={`/admin/clients/${client_id}/bookings/${id}/edit`}
            className="border-border hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center rounded-lg border px-2.5 py-1 text-[0.8rem] font-medium transition-colors focus-visible:ring-3"
          >
            Edit
          </Link>
        )}

        {canCancel && (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => onCancel(id)}
          >
            Cancel
          </Button>
        )}
      </div>
    </Surface>
  );
}
