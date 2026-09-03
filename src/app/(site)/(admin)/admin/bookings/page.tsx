import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { listBookingsInRange } from "@/features/admin";

import { BookingsCalendarClient } from "./_components/bookings-calendar-client";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const monthParam = typeof sp.month === "string" ? sp.month : undefined;
  const result = await listBookingsInRange({ monthParam });
  if (result.kind !== "success") {
    return (
      <PageContainer width="app">
        <PageHeader title="Bookings" />
        <ErrorState
          title="Couldn't load bookings"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer width="app">
      <PageHeader
        title="Bookings"
        subtitle="Approve, edit, or cancel right from the row."
      />
      <BookingsCalendarClient
        bookings={result.bookings}
        monthStartIso={result.startIso}
        nowIso={new Date().toISOString()}
      />
    </PageContainer>
  );
}
