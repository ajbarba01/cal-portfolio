import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  createSupabaseBookingRepository,
  type BookingStatusDb,
} from "@/features/booking/booking-repository";
import { redirect } from "next/navigation";
import { PrepayButton } from "./_components/prepay-button";
import { EditCell } from "./_components/edit-cell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Maps a DB booking status to a human label + badge variant. */
function statusMeta(status: BookingStatusDb): {
  label: string;
  variant: "available" | "pending" | "unavailable" | "destructive" | "default";
} {
  switch (status) {
    case "confirmed":
      return { label: "Confirmed", variant: "available" };
    case "pending_approval":
      return { label: "Pending approval", variant: "pending" };
    case "completed":
      return { label: "Completed", variant: "unavailable" };
    case "no_show":
      return { label: "No-show", variant: "unavailable" };
    case "declined":
      return { label: "Declined", variant: "destructive" };
    case "cancelled":
      return { label: "Cancelled", variant: "destructive" };
  }
}

/** Money: integer cents → dollars string (e.g. 4500 → "$45.00"). */
function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** UTC ISO string → America/Denver local string. */
function formatDenver(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface PaymentRow {
  amount_cents: number;
  status: string;
}

interface BookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatusDb;
  final_cents: number;
  payments: PaymentRow[];
  services: { name: string; slug: string }[] | null;
}

/** Amount owed = final_cents − sum of succeeded payments. */
function amountOwed(booking: BookingRow): number {
  const paid = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + p.amount_cents, 0);
  return Math.max(0, booking.final_cents - paid);
}

export default async function BookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const nowIso = now.toISOString();

  const repo = createSupabaseBookingRepository(createServiceClient());
  const settings = await repo.getSettings();
  const cancellationFullRefundHours = settings.cancellation_full_refund_hours;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, final_cents, payments(amount_cents, status), services(name, slug)",
    )
    .eq("client_id", user.id)
    .order("starts_at", { ascending: false });

  const rows = (bookings as BookingRow[]) ?? [];
  const upcoming = rows.filter((b) => b.ends_at >= nowIso);
  const history = rows.filter((b) => b.ends_at < nowIso);

  return (
    <PageContainer width="app">
      <PageHeader
        title="Your bookings"
        subtitle="Upcoming and past bookings. Times shown in Mountain time."
      />

      <section className="mb-10">
        <h2 className="text-foreground mb-4 text-base font-medium">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyBookings message="No upcoming bookings." />
        ) : (
          <BookingTable
            bookings={upcoming}
            showPayButton
            now={now}
            cancellationFullRefundHours={cancellationFullRefundHours}
          />
        )}
      </section>

      <section>
        <h2 className="text-foreground mb-4 text-base font-medium">History</h2>
        {history.length === 0 ? (
          <EmptyBookings message="No past bookings." />
        ) : (
          <BookingTable
            bookings={history}
            showPayButton={false}
            now={now}
            cancellationFullRefundHours={cancellationFullRefundHours}
          />
        )}
      </section>
    </PageContainer>
  );
}

function EmptyBookings({ message }: { message: string }) {
  return (
    <div className="border-border bg-card rounded-xl border border-dashed p-8 text-center">
      <div aria-hidden="true" className="mb-2 text-3xl">
        🐾
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function BookingTable({
  bookings,
  showPayButton,
  now,
  cancellationFullRefundHours,
}: {
  bookings: BookingRow[];
  showPayButton: boolean;
  now: Date;
  cancellationFullRefundHours: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Service</TableHead>
          <TableHead>When</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Total</TableHead>
          {showPayButton && <TableHead className="text-right">Pay</TableHead>}
          {showPayButton && <TableHead className="text-right">Edit</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => {
          const owed = amountOwed(b);
          const paidCents = b.payments
            .filter((p) => p.status === "succeeded")
            .reduce((acc, p) => acc + p.amount_cents, 0);
          const { label, variant } = statusMeta(b.status);
          return (
            <TableRow key={b.id}>
              <TableCell
                data-label="Service"
                className="text-foreground font-medium"
              >
                {b.services?.[0]?.name ?? "Service"}
              </TableCell>
              <TableCell data-label="When" className="text-muted-foreground">
                {formatDenver(b.starts_at)} — {formatDenver(b.ends_at)}
              </TableCell>
              <TableCell data-label="Status">
                <Badge variant={variant}>{label}</Badge>
              </TableCell>
              <TableCell data-label="Total">
                <span className="text-foreground">
                  {formatDollars(b.final_cents)}
                </span>
                {owed > 0 && (
                  <span className="text-brand-strong ml-1.5 font-medium">
                    · owed {formatDollars(owed)}
                  </span>
                )}
              </TableCell>
              {showPayButton && (
                <TableCell data-label="" className="md:text-right">
                  <PrepayButton bookingId={b.id} owedCents={owed} />
                </TableCell>
              )}
              {showPayButton && (
                <TableCell data-label="Edit" className="md:text-right">
                  <EditCell
                    bookingId={b.id}
                    booking={{
                      status: b.status,
                      startsAt: new Date(b.starts_at),
                      paidCents,
                      serviceSlug: b.services?.[0]?.slug ?? "",
                    }}
                    now={now}
                    cancellationFullRefundHours={cancellationFullRefundHours}
                  />
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
