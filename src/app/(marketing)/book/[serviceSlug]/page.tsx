/**
 * /book/[serviceSlug] — per-service booking page (server component).
 *
 * Loads the one service + booking-rule settings + initial public busy ranges via
 * the service role, plus the viewer's auth state (guest | needs-info |
 * needs-meet-greet | ready) and — when ready — their pets (with signed photo URLs). The deferred-auth
 * gate itself lives in the client; this page only supplies the inputs and
 * rehydrates a returnTo selection from the query string.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import {
  loadBookingFormData,
  denverDayKey,
  type ServiceDetail,
  type AssignablePet,
  type OnboardingStatus,
  type PetSpecies,
} from "@/features/booking";
import {
  ServiceBookingClient,
  type AuthState,
} from "./_components/service-booking-client";
import type { PricingType } from "@/features/pricing";

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

  // Meet-and-greet is scheduled only within onboarding (see DESIGN.md).
  if (serviceSlug === "meet-greet") {
    redirect("/onboarding");
  }

  const sp = await searchParams;

  const svc = createServiceClient();

  // Service.
  const { data: serviceRow } = await svc
    .from("services")
    .select("id, slug, name, description, pricing_type, default_duration_min")
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

  // Booking-rule settings + initial public busy ranges (shared loader).
  const loaded = await loadBookingFormData(serviceSlug);
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }
  const { rules, initialBusy } = loaded.data;

  // Auth state + pets.
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  let authState: AuthState = "guest";
  let pets: AssignablePet[] = [];
  // Denver day-keys where this client already has an active booking for THIS
  // service — drives the "your booking" dot on the month grid (e.g. recurring walks).
  let myBookingDayKeys: string[] = [];

  if (user) {
    const { data: profile } = await svc
      .from("profiles")
      .select("onboarding_status")
      .eq("id", user.id)
      .single();

    const status = profile?.onboarding_status as OnboardingStatus | undefined;

    if (status === "approved") {
      authState = "ready";
    } else if (status === "meet_greet_pending") {
      authState = serviceSlug === "meet-greet" ? "ready" : "needs-meet-greet";
    } else if (status === "declined") {
      // Profile is complete but Cal declined — distinct panel, not "finish profile".
      authState = "declined";
    } else {
      // info_pending or undefined → send to the onboarding info step.
      authState = "needs-info";
    }

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

    const { data: myBookingRows } = await svc
      .from("bookings")
      .select("starts_at")
      .eq("client_id", user.id)
      .eq("service_id", serviceRow.id as string)
      .in("status", ["pending_approval", "confirmed"])
      .gte("ends_at", new Date().toISOString());

    myBookingDayKeys = (myBookingRows ?? []).map((r) =>
      denverDayKey(new Date(r.starts_at as string)),
    );
  }

  const petsParam = firstParam(sp.pets);
  const initialSelection = {
    start: firstParam(sp.start),
    end: firstParam(sp.end),
    petIds: petsParam ? petsParam.split(",").filter(Boolean) : [],
  };

  return (
    <main className="px-4 py-12">
      <RevealGroup className="mx-auto w-full max-w-xl">
        <Reveal>
          <Link
            href="/services"
            className="text-muted-foreground hover:text-foreground mb-6 inline-block text-sm"
          >
            ← All services
          </Link>
        </Reveal>
        <Reveal as="h1" className="mb-1 text-2xl font-semibold">
          {service.name}
        </Reveal>
        {service.description && (
          <Reveal as="p" className="text-muted-foreground mb-8 text-sm">
            {service.description}
          </Reveal>
        )}
      </RevealGroup>
      <ServiceBookingClient
        service={service}
        rules={rules}
        initialBusy={initialBusy}
        authState={authState}
        pets={pets}
        initialSelection={initialSelection}
        myBookingDayKeys={myBookingDayKeys}
      />
    </main>
  );
}
