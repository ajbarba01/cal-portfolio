import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { listBookingsInRange } from "@/features/admin/bookings-calendar-actions";
import { listClients } from "@/features/admin/clients-actions";
import { listReviews } from "@/features/admin/reviews-actions";
import { listInquiries } from "@/features/inquiries/inquiry-actions";

const TIME_ZONE = "America/Denver";

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function DashboardCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string | number;
}) {
  return (
    <Link
      href={href}
      className="bg-card border-border hover:bg-accent flex flex-col gap-1 rounded-xl border p-4 transition-colors"
    >
      <span className="text-foreground text-2xl font-semibold">{value}</span>
      <span className="text-muted-foreground text-sm">{label}</span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const range = {
    startIso: new Date(Date.UTC(year, month, 1)).toISOString(),
    endIso: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };

  const [clientsResult, inquiriesResult, bookingsResult, reviewsResult] =
    await Promise.all([
      listClients(),
      listInquiries(),
      listBookingsInRange(range),
      listReviews(),
    ]);

  const bookings =
    bookingsResult.kind === "success" ? bookingsResult.bookings : [];
  const today = dayKey(now);
  const todayCount = bookings.filter(
    (booking) => dayKey(new Date(booking.starts_at)) === today,
  ).length;
  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending_approval",
  ).length;
  const newInquiries =
    inquiriesResult.kind === "success"
      ? inquiriesResult.inquiries.filter((inquiry) => inquiry.status === "new")
          .length
      : 0;
  const owingClients =
    clientsResult.kind === "success"
      ? clientsResult.clients.filter((client) => client.outstandingCents > 0)
          .length
      : 0;
  const pendingReviews =
    reviewsResult.kind === "success"
      ? reviewsResult.reviews.filter((review) => review.status === "pending")
          .length
      : 0;

  return (
    <PageContainer width="app">
      <PageHeader title="Dashboard" subtitle="At a glance." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DashboardCard
          href="/admin/bookings"
          label="Bookings today"
          value={todayCount}
        />
        <DashboardCard
          href="/admin/bookings"
          label="Pending approval"
          value={pendingCount}
        />
        <DashboardCard
          href="/admin/reviews"
          label="Pending reviews"
          value={pendingReviews}
        />
        <DashboardCard
          href="/admin/inquiries"
          label="New inquiries"
          value={newInquiries}
        />
        <DashboardCard
          href="/admin/clients"
          label="Clients owing a balance"
          value={owingClients}
        />
      </div>
    </PageContainer>
  );
}
