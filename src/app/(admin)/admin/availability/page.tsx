/**
 * Admin availability windows page — server component.
 * Fetches windows via service-role and renders the client form.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listWindowsCore } from "@/features/admin/availability-actions";
import { getAdminBusyRanges } from "@/features/admin/admin-busy";
import { AvailabilityClient } from "./_components/availability-client";

export default async function AdminAvailabilityPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // Layout guards the route, so user is always present here.
  const serviceClient = createServiceClient();
  const [result, busyResult] = await Promise.all([
    listWindowsCore({ serviceClient, actorUserId: user!.id }),
    getAdminBusyRanges(),
  ]);

  if (result.kind === "forbidden" || busyResult.kind === "forbidden") {
    return <p className="text-destructive p-8">Access denied.</p>;
  }

  if (result.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load windows: {result.message}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Availability & Bookings</h1>
      <AvailabilityClient
        initialWindows={result.windows}
        initialBusy={busyResult.ranges}
      />
    </main>
  );
}
