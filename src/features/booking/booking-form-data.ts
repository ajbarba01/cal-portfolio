import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicBusyRanges } from "./busy-ranges";
import type { BookingRuleSettings } from "./availability";
import type { PublicBusyRange } from "./busy-ranges";

export interface BookingFormData {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  /** Denver day-keys carrying a holiday surcharge — server-seeded so the client
   *  needs no settings round trip (holidays don't change mid-session). */
  initialPremiumDays: string[];
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
      "booking_open_minute, booking_close_minute, min_lead_time_hours, hard_max_advance_days, cancellation_full_refund_hours, late_cancel_refund_pct, holiday_dates",
    )
    .limit(1)
    .single();

  if (error || !settingsData) return { ok: false };

  const rules: BookingRuleSettings = {
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
    cancellationFullRefundHours:
      settingsData.cancellation_full_refund_hours as number,
    lateCancelRefundPct: settingsData.late_cancel_refund_pct as number,
  };

  const rawHolidays: unknown = settingsData.holiday_dates;
  const initialPremiumDays = Array.isArray(rawHolidays)
    ? rawHolidays.filter((v): v is string => typeof v === "string")
    : [];

  const initialBusy = await getPublicBusyRanges(serviceSlug);
  return { ok: true, data: { rules, initialBusy, initialPremiumDays } };
}
