/**
 * Admin booking approvals queue — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listPendingBookingsCore } from "@/features/admin/approval-actions";
import { BookingsClient } from "./_components/bookings-client";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

export default async function AdminBookingsPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const serviceClient = createServiceClient();
  const result = await listPendingBookingsCore({
    serviceClient,
    actorUserId: user!.id,
  });

  if (result.kind === "forbidden") {
    return (
      <ErrorState
        title="Access denied"
        message="You don't have permission to view this."
      />
    );
  }

  if (result.kind === "error") {
    return (
      <ErrorState
        title="Couldn't load this"
        message="We couldn't load this right now. Please try again."
      />
    );
  }

  return (
    <PageContainer width="app">
      <PageHeader
        title={`Pending Booking Approvals (${result.bookings.length})`}
      />
      <BookingsClient initialBookings={result.bookings} />
    </PageContainer>
  );
}
