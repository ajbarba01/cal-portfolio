import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicBusyRanges } from "./busy-ranges";
import {
  createSupabaseBookingRepository,
  type SettingsRow,
} from "./booking-repository";
import { toRuleSettings } from "./booking-service-shared";
import type { BookingRuleSettings } from "./availability";
import type { DriveBufferConfig } from "./drive-buffer";
import type { PublicBusyRange } from "./busy-ranges";
import type { LatLng } from "@/lib/haversine";

export interface BookingFormData {
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  /** Denver day-keys carrying a holiday surcharge — server-seeded so the client
   *  needs no settings round trip (holidays don't change mid-session). */
  initialPremiumDays: string[];
  /**
   * What the caller needs to compute one viewer's drive-time buffer: Cal's
   * origin plus the road parameters. Server-side only — the picker is handed
   * the resulting minutes, never the coordinates.
   */
  driveBuffer: { origin: LatLng; config: DriveBufferConfig };
}

export type LoadBookingFormDataResult =
  | { ok: true; data: BookingFormData }
  | { ok: false };

/**
 * Loads the booking-rule settings + initial public busy ranges for a service's
 * class. Shared by the /book page, the booking edit pages and the onboarding
 * meet-greet scheduler so the settings query isn't duplicated.
 */
export async function loadBookingFormData(
  serviceSlug: string,
): Promise<LoadBookingFormDataResult> {
  const repo = createSupabaseBookingRepository(createServiceClient());

  // The read is parsed and memoized per request in the repository, so the
  // numbers below are numbers and this shares its query with the other settings
  // readers on the same request.
  let settings: SettingsRow;
  try {
    settings = await repo.getSettings();
  } catch (e: unknown) {
    console.error("loadBookingFormData: settings read failed", e);
    return { ok: false };
  }

  const initialBusy = await getPublicBusyRanges(serviceSlug);
  return {
    ok: true,
    data: {
      rules: {
        ...toRuleSettings(settings),
        // The two policy numbers the booking flow quotes back to the client;
        // toRuleSettings covers only the fields the guards evaluate.
        cancellationFullRefundHours: settings.cancellation_full_refund_hours,
        lateCancelRefundPct: settings.late_cancel_refund_pct,
      },
      initialBusy,
      initialPremiumDays: settings.holiday_dates,
      driveBuffer: {
        origin: { lat: settings.origin_lat, lng: settings.origin_lng },
        config: {
          roadFactor: settings.road_factor,
          avgSpeedMph: settings.avg_speed_mph,
          pct: settings.drive_buffer_pct,
        },
      },
    },
  };
}
