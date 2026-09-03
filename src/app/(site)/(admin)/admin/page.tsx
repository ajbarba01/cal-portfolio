import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getAttentionCounts,
  listBookingsInRange,
  listClients,
} from "@/features/admin";
import { denverDayKey } from "@/lib/time-of-day";

import { AttentionList } from "./_components/attention-list";
import { TodayTimeline } from "./_components/today-timeline";

export default async function AdminDashboardPage() {
  const now = new Date();

  // The counts are the same reads the nav badges make, memoized per request.
  // The bookings are only for today's timeline; the month window is what the
  // hub reads too, so the two pages share the shape of the query.
  const [attention, clientsResult, bookingsResult] = await Promise.all([
    getAttentionCounts(),
    listClients(),
    listBookingsInRange({}),
  ]);

  const bookings =
    bookingsResult.kind === "success" ? bookingsResult.bookings : [];
  const clients = clientsResult.kind === "success" ? clientsResult.clients : [];
  const today = denverDayKey(now);

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

  // Today's bookings (TodayTimeline orders them internally).
  const todaysBookings = bookings.filter(
    (b) => denverDayKey(new Date(b.starts_at)) === today,
  );

  return (
    <PageContainer width="app">
      <PageHeader title="Dashboard" subtitle="Here's what needs you." />

      <div className="flex flex-col gap-[18px]">
        <AttentionList
          pendingApprovals={attention.pendingApprovals}
          newInquiries={attention.newInquiries}
          owing={{
            count: owingCount,
            topName: topOwing?.full_name ?? topOwing?.email ?? null,
            topAmountCents: topOwing?.outstandingCents,
            totalCents: totalOwingCents,
          }}
          recentReviews={attention.recentReviews}
        />

        <TodayTimeline bookings={todaysBookings} now={now} />
      </div>
    </PageContainer>
  );
}
