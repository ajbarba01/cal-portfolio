/**
 * Admin availability windows page — server component.
 * Fetches windows, overnight nights, admin busy, and booking rules via service-role.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  listWindowsCore,
  getAdminBusyRanges,
  listOvernightNightsCore,
} from "@/features/admin";
import { AvailabilityClient } from "./_components/availability-client";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import type { BookingRuleSettings } from "@/features/booking";

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

  if (nightsResult.kind === "error") {
    return (
      <ErrorState
        title="Couldn't load this"
        message="We couldn't load this right now. Please try again."
      />
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
      <ErrorState
        title="Couldn't load this"
        message="We couldn't load this right now. Please try again."
      />
    );
  }

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
  };

  return (
    <PageContainer width="app">
      <PageHeader title="Availability & Bookings" />
      <AvailabilityClient
        initialWindows={result.windows}
        initialBusy={busyResult.ranges}
        initialNights={nightsResult.nights}
        rules={rules}
        nowIso={new Date().toISOString()}
      />
    </PageContainer>
  );
}
