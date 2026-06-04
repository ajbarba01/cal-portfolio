/**
 * Admin availability windows page — server component.
 * Fetches windows, overnight nights, admin busy, and booking rules via service-role.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { listWindowsCore } from "@/features/admin/availability-actions";
import { getAdminBusyRanges } from "@/features/admin/admin-busy";
import { listOvernightNightsCore } from "@/features/admin/overnight-actions";
import { AvailabilityClient } from "./_components/availability-client";
import type { BookingRuleSettings } from "@/features/booking/availability";

export default async function AdminAvailabilityPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // Layout guards the route, so user is always present here.
  const serviceClient = createServiceClient();
  const [result, busyResult, nightsResult] = await Promise.all([
    listWindowsCore({ serviceClient, actorUserId: user!.id }),
    getAdminBusyRanges(),
    listOvernightNightsCore({ serviceClient, actorUserId: user!.id }),
  ]);

  if (
    result.kind === "forbidden" ||
    busyResult.kind === "forbidden" ||
    nightsResult.kind === "forbidden"
  ) {
    return <p className="text-destructive p-8">Access denied.</p>;
  }

  if (result.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load windows: {result.message}
      </p>
    );
  }

  if (nightsResult.kind === "error") {
    return (
      <p className="text-destructive p-8">
        Failed to load overnight nights: {nightsResult.message}
      </p>
    );
  }

  // Settings → booking rules (same query as the book page).
  const { data: settingsData, error: settingsError } = await serviceClient
    .from("settings")
    .select(
      "booking_open_minute, booking_close_minute, min_lead_time_hours, hard_max_advance_days",
    )
    .limit(1)
    .single();

  if (settingsError || !settingsData) {
    return (
      <p className="text-destructive p-8">
        Could not load booking settings. Please try again later.
      </p>
    );
  }

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
  };

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Availability & Bookings</h1>
      <AvailabilityClient
        initialWindows={result.windows}
        initialBusy={busyResult.ranges}
        initialNights={nightsResult.nights}
        rules={rules}
        nowIso={new Date().toISOString()}
      />
    </main>
  );
}
