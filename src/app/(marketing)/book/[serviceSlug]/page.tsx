/**
 * /book/[serviceSlug] — per-service booking page (server component).
 *
 * Loads the one service + booking-rule settings + initial public busy ranges via
 * the service role, plus the viewer's auth state (guest | needs-onboarding |
 * ready) and — when ready — their pets (with signed photo URLs). The deferred-auth
 * gate itself lives in the client; this page only supplies the inputs and
 * rehydrates a returnTo selection from the query string.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPublicBusyRanges } from "@/features/booking/busy-ranges";
import {
  ServiceBookingClient,
  type AuthState,
  type ServiceDetail,
} from "./_components/service-booking-client";
import type { AssignablePet } from "./_components/pet-assignment";
import type { BookingRuleSettings } from "@/features/booking/availability";
import type { PricingType } from "@/features/pricing/types";
import type { PetSpecies } from "@/features/booking/_components/pet-avatar";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function ServiceBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { serviceSlug } = await params;
  const sp = await searchParams;

  const svc = createServiceClient();

  // Service.
  const { data: serviceRow } = await svc
    .from("services")
    .select("slug, name, description, pricing_type, default_duration_min")
    .eq("slug", serviceSlug)
    .eq("active", true)
    .single();

  if (!serviceRow) notFound();

  const service: ServiceDetail = {
    slug: serviceRow.slug as string,
    name: serviceRow.name as string,
    description:
      typeof serviceRow.description === "string"
        ? serviceRow.description
        : null,
    pricingType: serviceRow.pricing_type as PricingType,
    defaultDurationMin:
      typeof serviceRow.default_duration_min === "number"
        ? serviceRow.default_duration_min
        : null,
  };

  // Settings → booking rules.
  const { data: settingsData, error: settingsError } = await svc
    .from("settings")
    .select(
      "booking_open_minute, booking_close_minute, min_lead_time_hours, hard_max_advance_days",
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
    bookingOpenMinute: settingsData.booking_open_minute as number,
    bookingCloseMinute: settingsData.booking_close_minute as number,
    minLeadTimeHours: settingsData.min_lead_time_hours as number,
    hardMaxAdvanceDays: settingsData.hard_max_advance_days as number,
  };

  // Initial public busy ranges (identity-free) for this service's class.
  const initialBusy = await getPublicBusyRanges(serviceSlug);

  // Auth state + pets.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  let authState: AuthState = "guest";
  let pets: AssignablePet[] = [];

  if (user) {
    const { data: profile } = await svc
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", user.id)
      .single();

    authState = profile?.onboarding_complete ? "ready" : "needs-onboarding";

    if (authState === "ready") {
      const { data: petRows } = await svc
        .from("pets")
        .select("id, name, species, breed, notes, photo_url")
        .eq("client_id", user.id)
        .order("created_at", { ascending: true });

      pets = await Promise.all(
        (petRows ?? []).map(async (p) => {
          let photoUrl: string | null = null;
          if (p.photo_url) {
            const { data } = await svc.storage
              .from("pet-photos")
              .createSignedUrl(p.photo_url as string, SIGNED_URL_TTL_SECONDS);
            photoUrl = data?.signedUrl ?? null;
          }
          return {
            id: p.id as string,
            name: p.name as string,
            species: p.species as PetSpecies,
            breed: typeof p.breed === "string" ? p.breed : null,
            notes: typeof p.notes === "string" ? p.notes : null,
            photoUrl,
          };
        }),
      );
    }
  }

  const petsParam = firstParam(sp.pets);
  const initialSelection = {
    start: firstParam(sp.start),
    end: firstParam(sp.end),
    petIds: petsParam ? petsParam.split(",").filter(Boolean) : [],
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/book"
        className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
      >
        ← All services
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">{service.name}</h1>
      {service.description && (
        <p className="text-muted-foreground mb-8 text-sm">
          {service.description}
        </p>
      )}
      <ServiceBookingClient
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        authState={authState}
        pets={pets}
        initialSelection={initialSelection}
      />
    </main>
  );
}
