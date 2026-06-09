import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicBusyRanges } from "./busy-ranges";
import type { BookingRuleSettings } from "./availability";
import type { PublicBusyRange } from "./busy-ranges";

export interface BookingFormData {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
}

export type LoadBookingFormDataResult =
  | { ok: true; data: BookingFormData }
  | { ok: false };

/**
 * Loads the booking-rule settings + initial public busy ranges for a service's
 * class. Shared by the /book page and the onboarding meet-greet scheduler so the
 * settings query isn't duplicated.
 */
export async function loadBookingFormData(
  serviceSlug: string,
): Promise<LoadBookingFormDataResult> {
  const svc = createServiceClient();

  const { data: settingsData, error } = await svc
    .from("settings")
    .select(
      "booking_open_minute, booking_close_minute, min_lead_time_hours, hard_max_advance_days",
    )
    .limit(1)
    .single();

  if (error || !settingsData) return { ok: false };

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
  };

  const initialBusy = await getPublicBusyRanges(serviceSlug);
  return { ok: true, data: { rules, initialBusy } };
}
