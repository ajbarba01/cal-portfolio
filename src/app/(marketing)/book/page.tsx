/**
 * /book — public-facing booking page (server component).
 *
 * Loads active services and booking-rule settings server-side via the service
 * role client (anon cannot read `settings` via RLS). Passes both as props to
 * the client component so the browser never makes raw DB calls for this data.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { BookClient } from "./_components/book-client";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PricingType } from "@/features/pricing/types";

// ── Service shape passed to the client ────────────────────────────────────────

export interface ServiceOption {
  slug: string;
  name: string;
  pricing_type: PricingType;
  /** Minutes. Null means the service has no fixed default (e.g. house_sitting). */
  default_duration_min: number | null;
  max_pets: number | null;
  description: string | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BookPage() {
  const svc = createServiceClient();

  // Load active services (filter active=true, order by sort_order).
  const { data: servicesData, error: servicesError } = await svc
    .from("services")
    .select(
      "slug, name, pricing_type, default_duration_min, max_pets, description",
    )
    .eq("active", true)
    .order("sort_order");

  if (servicesError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load services. Please try again later.
        </p>
      </main>
    );
  }

  const services: ServiceOption[] = (servicesData ?? []).map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    pricing_type: row.pricing_type as PricingType,
    default_duration_min:
      typeof row.default_duration_min === "number"
        ? row.default_duration_min
        : null,
    max_pets: typeof row.max_pets === "number" ? row.max_pets : null,
    description: typeof row.description === "string" ? row.description : null,
  }));

  // Load booking-rule settings (anon cannot read via RLS → must use service role).
  const { data: settingsData, error: settingsError } = await svc
    .from("settings")
    .select(
      "booking_open_hour, booking_close_hour, min_lead_time_hours, max_advance_days",
    )
    .limit(1)
    .single();

  if (settingsError || !settingsData) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }

  const rules: BookingRuleSettings = {
    bookingOpenHour: settingsData.booking_open_hour as number,
    bookingCloseHour: settingsData.booking_close_hour as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    maxAdvanceDays: settingsData.max_advance_days as number,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">Book a service</h1>
      <BookClient services={services} rules={rules} />
    </main>
  );
}
