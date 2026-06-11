import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  listBookingsInRange,
  listClients,
  listReviews,
} from "@/features/admin";
import { listInquiries } from "@/features/inquiries";

import { AttentionList } from "./_components/attention-list";
import { TodayTimeline } from "./_components/today-timeline";

const TIME_ZONE = "America/Denver";

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
  const clients = clientsResult.kind === "success" ? clientsResult.clients : [];
  const today = dayKey(now);

  // Pending approvals
  const pendingApprovals = bookings.filter(
    (b) => b.status === "pending_approval",
  ).length;

  // New inquiries
  const newInquiries =
    inquiriesResult.kind === "success"
      ? inquiriesResult.inquiries.filter((i) => i.status === "new").length
      : 0;

  // Owing clients context
  const owingClients = clients.filter((c) => c.outstandingCents > 0);
  const owingCount = owingClients.length;
  // Top owing client: highest balance
  const topOwing =
    owingClients.length > 0
      ? owingClients.reduce((best, c) =>
          c.outstandingCents > best.outstandingCents ? c : best,
        )
      : null;
  const totalOwingCents = owingClients.reduce(
    (sum, c) => sum + c.outstandingCents,
    0,
  );

  // Reviews to moderate
  const pendingReviews =
    reviewsResult.kind === "success"
      ? reviewsResult.reviews.filter((r) => r.status === "pending").length
      : 0;

  // Today's bookings (TodayTimeline orders them internally).
  const todaysBookings = bookings.filter(
    (b) => dayKey(new Date(b.starts_at)) === today,
  );

  return (
    <PageContainer width="app">
      <PageHeader title="Dashboard" subtitle="Here's what needs you." />

      <div className="flex flex-col gap-[18px]">
        <AttentionList
          pendingApprovals={pendingApprovals}
          newInquiries={newInquiries}
          owing={{
            count: owingCount,
            topName: topOwing?.full_name ?? topOwing?.email ?? null,
            topAmountCents: topOwing?.outstandingCents,
            totalCents: totalOwingCents,
          }}
          reviewsToModerate={pendingReviews}
        />

        <TodayTimeline bookings={todaysBookings} now={now} />
      </div>
    </PageContainer>
  );
}
