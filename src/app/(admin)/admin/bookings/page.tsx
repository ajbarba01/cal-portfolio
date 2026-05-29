/**
 * Admin booking approvals queue — server component.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listPendingBookingsCore } from "@/features/admin/approval-actions";
import { BookingsClient } from "./_components/bookings-client";

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
    return <p className="text-destructive p-8">Access denied.</p>;
  }

  if (result.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load bookings: {result.message}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">
        Pending Booking Approvals ({result.bookings.length})
      </h1>
      <BookingsClient initialBookings={result.bookings} />
    </main>
  );
}
