import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import type { ClientDetailView } from "@/features/admin/index.client";
import {
  bookingStatusPill,
  QuoteLines,
  type StoredQuoteBreakdown,
} from "@/features/booking/index.client";
import { centsToDollars } from "@/features/pricing";
import { denverDateTime } from "@/lib/time-of-day";
import { BookingPaymentBadges, RetainedHalfNotice } from "./booking-payment";
import { SECTION, LEGEND } from "./shared";

const EDITABLE = new Set(["pending_approval", "confirmed"]);

interface ClientBookingsProps {
  clientId: string;
  clientName: string | null;
  bookings: ClientDetailView["bookings"];
  isPending: boolean;
  onApprove: (bookingId: string) => void;
  onDecline: (bookingId: string) => void;
  onCancel: (bookingId: string) => void;
}

/** The client's bookings: itemized price, status, and the admin actions per row. */
export function ClientBookings({
  clientId,
  clientName,
  bookings,
  isPending,
  onApprove,
  onDecline,
  onCancel,
}: ClientBookingsProps) {
  return (
    <Surface as="section" variant="emphasis" className={SECTION}>
      <p className={LEGEND}>Bookings</p>
      {bookings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No bookings.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookings.map((booking) => {
            const isDisputed = Boolean(booking.disputed_at);
            const statusPill = bookingStatusPill(booking.status);

            const rowInner = (
              <>
                {/* Top row: service + pills + amount */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {booking.service_name ?? "Service"}
                  </span>
                  <BookingPaymentBadges
                    finalCents={booking.final_cents}
                    paymentStatus={booking.payment_status}
                    disputed={isDisputed}
                    disputeStatus={booking.dispute_status}
                  />
                  <span className="ml-auto font-semibold">
                    {centsToDollars(booking.final_cents)}
                  </span>
                </div>

                {/* Date + status row */}
                <div className="text-muted-foreground text-xs">
                  {denverDateTime(new Date(booking.starts_at))} &ndash;{" "}
                  {denverDateTime(new Date(booking.ends_at))} &middot;{" "}
                  <Badge variant={statusPill.variant}>{statusPill.label}</Badge>
                </div>

                {/* Itemized price, so a discount Cal applied is visible on
                    the booking itself. Self-guarding: a booking with no
                    stored lines renders no divider either. */}
                <QuoteLines
                  breakdown={booking.quote_breakdown as StoredQuoteBreakdown}
                  className="border-border border-t border-dashed pt-1.5"
                />

                <RetainedHalfNotice
                  finalCents={booking.final_cents}
                  refundedCents={booking.refunded_cents}
                />

                {/* Actions row */}
                <div className="flex flex-wrap gap-2">
                  {EDITABLE.has(booking.status) ? (
                    <Link
                      href={`/admin/clients/${clientId}/bookings/${booking.id}/edit`}
                      className="border-border hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:ring-3"
                    >
                      Edit
                    </Link>
                  ) : null}
                  {booking.status === "pending_approval" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => onApprove(booking.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => onDecline(booking.id)}
                      >
                        Decline
                      </Button>
                    </>
                  ) : null}
                  {booking.status === "pending_approval" ||
                  booking.status === "confirmed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => onCancel(booking.id)}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {/* Dispute: Stripe link */}
                  {isDisputed && booking.payment_intent_id ? (
                    <a
                      href={`https://dashboard.stripe.com/payments/${booking.payment_intent_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border-destructive text-destructive hover:bg-destructive/5 focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium focus-visible:ring-3"
                    >
                      View dispute in Stripe
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </>
            );

            // Disputed rows become a highlighted nested card (plain Surface +
            // destructive ring); normal rows stay flat border-bottom list items.
            return isDisputed ? (
              <Surface
                as="li"
                key={booking.id}
                variant="plain"
                className="border-destructive ring-destructive flex flex-col gap-1.5 p-3 text-sm ring-1"
              >
                {rowInner}
              </Surface>
            ) : (
              <li
                key={booking.id}
                className="border-border/60 flex flex-col gap-1.5 border-b py-2 text-sm last:border-b-0"
              >
                {rowInner}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={`/admin/clients/${clientId}/book`}
        className="bg-brand text-brand-foreground focus-visible:border-ring focus-visible:ring-ring/50 mt-1 inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:ring-3"
      >
        + New booking for {clientName ?? "this client"}
      </Link>
    </Surface>
  );
}
