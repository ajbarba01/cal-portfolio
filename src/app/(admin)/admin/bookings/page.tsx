import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { listBookingsInRange } from "@/features/admin";

import { BookingsCalendarClient } from "./_components/bookings-calendar-client";

function monthRange(now: Date): { startIso: string; endIso: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    startIso: new Date(Date.UTC(year, month, 1)).toISOString(),
    endIso: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

export default async function AdminBookingsPage() {
  const range = monthRange(new Date());
  const result = await listBookingsInRange(range);
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
        monthStartIso={range.startIso}
        nowIso={new Date().toISOString()}
      />
    </PageContainer>
  );
}
