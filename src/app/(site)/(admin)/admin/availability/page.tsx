/**
 * Admin availability windows page — server component.
 * Fetches windows, overnight nights, admin busy, and booking rules via service-role.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { getCachedUser } from "@/lib/supabase/server-cache";
import {
  listWindowsCore,
  getAdminBusyRanges,
  listOvernightNightsCore,
  settingsRowSchema,
  settingsColumns,
} from "@/features/admin";
import { AvailabilityClient } from "./_components/availability-client";
import { ErrorState } from "@/components/feedback/error-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import type { BookingRuleSettings } from "@/features/booking";

/**
 * The settings columns this page reads. Picked from the one row schema so the
 * select list and the parse cannot drift, and so the numbers reach the
 * scheduler as numbers rather than as unchecked casts.
 */
const availabilitySettingsSchema = settingsRowSchema.pick({
  booking_open_minute: true,
  booking_close_minute: true,
  min_lead_time_hours: true,
  hard_max_advance_days: true,
  holiday_dates: true,
});

export default async function AdminAvailabilityPage() {
  const { user } = await getCachedUser();

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

  // Settings → booking rules + premium days (holiday_dates).
  const { data: settingsData, error: settingsError } = await serviceClient
    .from("settings")
    .select(settingsColumns(availabilitySettingsSchema))
    .limit(1)
    .single();

  // `.single()` returns either a row or an error, so a failed parse covers both
  // a read error and a row that is not the shape the scheduler needs.
  const settings = availabilitySettingsSchema.safeParse(settingsData);

  if (!settings.success) {
    console.error(
      "admin availability: settings read failed",
      settingsError ?? settings.error.issues,
    );
    return (
      <ErrorState
        title="Couldn't load this"
        message="We couldn't load this right now. Please try again."
      />
    );
  }

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settings.data.booking_open_minute,
    bookingCloseMinute: settings.data.booking_close_minute,
    minLeadTimeHours: settings.data.min_lead_time_hours,
    hardMaxAdvanceDays: settings.data.hard_max_advance_days,
  };

  const premiumDays = settings.data.holiday_dates;

  return (
    <PageContainer width="app">
      <PageHeader title="Availability" />
      <AvailabilityClient
        initialWindows={result.windows}
        initialBusy={busyResult.ranges}
        initialNights={nightsResult.nights}
        initialPremiumDays={premiumDays}
        rules={rules}
        nowIso={new Date().toISOString()}
      />
    </PageContainer>
  );
}
