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
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import {
  loadBookingFormData,
  denverDayKey,
  listActiveServices,
  type ServiceDetail,
  type AssignablePet,
  type OnboardingStatus,
  type PetSpecies,
} from "@/features/booking";
import {
  ServiceBookingClient,
  type AuthState,
} from "./_components/service-booking-client";
import { EXPENSE_AUTH_KIND } from "@/features/accounts";
import type { PricingType } from "@/features/pricing";
import { createStaticClient } from "@/lib/supabase/static";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  JsonLd,
} from "@/features/seo";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const services = await listActiveServices(createStaticClient());
  const service = services.find((s) => s.slug === serviceSlug);
  const title = service?.name ?? "Book";
  return buildPageMetadata({
    title,
    description:
      service?.description ??
      "Check availability and book with Cal Barba across Colorado's Front Range.",
    path: `/book/${serviceSlug}`,
  });
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

  // Service, booking-form data, viewer auth, and the sibling-service list (for
  // the cross-nav switcher) are independent — fetch in parallel.
  const [{ data: serviceRow }, loaded, { user }, siblingServices] =
    await Promise.all([
      svc
        .from("services")
        .select(
          "id, slug, name, description, pricing_type, default_duration_min",
        )
        .eq("slug", serviceSlug)
        .eq("active", true)
        .single(),
      loadBookingFormData(serviceSlug),
      getCachedUser(),
      listActiveServices(svc),
    ]);

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
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-destructive">
          Could not load booking settings. Please try again later.
        </p>
      </main>
    );
  }
  const { rules, initialBusy, initialPremiumDays } = loaded.data;

  let authState: AuthState = "guest";
  let pets: AssignablePet[] = [];
  // Denver day-keys where this client already has an active booking for THIS
  // service — drives the "your booking" dot on the month grid (e.g. recurring walks).
  let myBookingDayKeys: string[] = [];
  const formResponses: Record<string, { data: Record<string, unknown> }> = {};
  let acceptedAuthVersion: string | null = null;
  let acceptedAuthAt: string | null = null;

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

    // Pets (only when ready) and this client's active bookings for this service
    // are independent — fetch in parallel.
    const loadReadyPets = async (): Promise<AssignablePet[]> => {
      if (authState !== "ready") return [];
      const { data: petRows } = await svc
        .from("pets")
        .select("id, name, species, breed, notes, photo_url")
        .eq("client_id", user.id)
        .order("created_at", { ascending: true });

      return Promise.all(
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
    };

    const [
      resolvedPets,
      { data: myBookingRows },
      { data: formRows },
      { data: authRows },
    ] = await Promise.all([
      loadReadyPets(),
      svc
        .from("bookings")
        .select("starts_at")
        .eq("client_id", user.id)
        .eq("service_id", serviceRow.id as string)
        .in("status", ["pending_approval", "confirmed"])
        .gte("ends_at", new Date().toISOString()),
      authState === "ready"
        ? svc
            .from("form_responses")
            .select("form_key, pet_id, data")
            .eq("client_id", user.id)
        : Promise.resolve({ data: null, error: null }),
      authState === "ready"
        ? svc
            .from("authorizations")
            .select("version, accepted_at")
            .eq("client_id", user.id)
            .eq("kind", EXPENSE_AUTH_KIND)
            .order("accepted_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null, error: null }),
    ]);

    pets = resolvedPets;
    myBookingDayKeys = (myBookingRows ?? []).map((r) =>
      denverDayKey(new Date(r.starts_at as string)),
    );

    for (const r of formRows ?? []) {
      const key = r.pet_id
        ? `${r.form_key as string}:${r.pet_id as string}`
        : (r.form_key as string);
      formResponses[key] = {
        data: (r.data ?? {}) as Record<string, unknown>,
      };
    }

    const latestAuth = (
      authRows as { version: string; accepted_at: string }[] | null
    )?.[0];
    acceptedAuthVersion = latestAuth?.version ?? null;
    acceptedAuthAt = latestAuth?.accepted_at ?? null;
  }

  const petsParam = firstParam(sp.pets);
  const initialSelection = {
    start: firstParam(sp.start),
    end: firstParam(sp.end),
    petIds: petsParam ? petsParam.split(",").filter(Boolean) : [],
  };

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Book", path: "/book" },
          { name: service.name, path: `/book/${service.slug}` },
        ])}
      />
      <JsonLd
        data={buildServiceJsonLd({
          name: service.name,
          slug: service.slug,
          description: service.description,
        })}
      />
      <main className="px-4 py-12">
        <RevealGroup className="mx-auto mb-8 w-full max-w-xl">
          <Reveal>
            <Link
              href="/services"
              className="text-muted-foreground hover:text-foreground inline-block text-sm"
            >
              ← All services
            </Link>
          </Reveal>
          {/* Cross-nav: hop between services without going back to the index. */}
          {siblingServices.length > 1 ? (
            <Reveal
              as="nav"
              aria-label="Other services"
              className="mt-3 mb-6 flex flex-wrap gap-2"
            >
              {siblingServices.map((s) =>
                s.slug === service.slug ? (
                  <span
                    key={s.slug}
                    aria-current="page"
                    className="bg-brand text-brand-foreground rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {s.name}
                  </span>
                ) : (
                  <Link
                    key={s.slug}
                    href={`/book/${s.slug}`}
                    className="bg-sidebar-active text-brand-strong rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ease-out hover:bg-[color-mix(in_oklab,var(--brand)_14%,var(--sidebar-active))]"
                  >
                    {s.name}
                  </Link>
                ),
              )}
            </Reveal>
          ) : (
            <div className="mb-6" />
          )}
          <Reveal as="h1" className="mb-1 text-2xl font-semibold">
            {service.name}
          </Reveal>
          {service.description && (
            <Reveal as="p" className="text-muted-foreground text-sm">
              {service.description}
            </Reveal>
          )}
        </RevealGroup>
        <ServiceBookingClient
          service={service}
          rules={rules}
          initialBusy={initialBusy}
          initialPremiumDays={initialPremiumDays}
          authState={authState}
          pets={pets}
          initialSelection={initialSelection}
          myBookingDayKeys={myBookingDayKeys}
          formResponses={formResponses}
          acceptedAuthVersion={acceptedAuthVersion}
          acceptedAuthAt={acceptedAuthAt}
        />
      </main>
    </>
  );
}
