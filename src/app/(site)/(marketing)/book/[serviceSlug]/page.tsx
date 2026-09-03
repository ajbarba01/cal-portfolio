/**
 * /book/[serviceSlug] — per-service booking page (server component).
 *
 * Routing only: every read, guard and mapping lives in `loadServiceBookingPage`.
 * This resolves the route's params, rehydrates a returnTo selection from the
 * query string, and renders the page shell around the client flow.
 */

import { notFound, redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/server-cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createStaticClient } from "@/lib/supabase/static";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { ErrorState } from "@/components/feedback/error-state";
import { BackToSite } from "@/components/layout/back-to-site";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { ServiceSwitcher } from "@/components/ui/service-switcher";
import { listActiveServices, loadServiceBookingPage } from "@/features/booking";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  JsonLd,
} from "@/features/seo";
import { ServiceBookingClient } from "./_components/service-booking-client";

/**
 * The booking flow's own column width (see booking-flow.tsx layout contract),
 * plus the band padding the marketing layout leaves to the page.
 */
const BOOKING_SHELL = "max-w-2xl py-12";

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

  // The viewer's id is handed over unresolved so the auth round trip overlaps
  // the service, settings and sibling reads.
  const [sp, page] = await Promise.all([
    searchParams,
    loadServiceBookingPage(
      createServiceClient(),
      serviceSlug,
      getCachedUser().then(({ user }) => user?.id ?? null),
    ),
  ]);

  if (!page.ok) {
    if (page.reason === "not-found") notFound();
    return (
      <PageContainer className={BOOKING_SHELL}>
        <BackToSite href="/services" label="All services" className="mb-6" />
        <ErrorState
          title="Couldn't load this"
          message="Please try again shortly."
        />
      </PageContainer>
    );
  }

  const { service, siblingServices, formData, viewer } = page.data;

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
          { name: "Services", path: "/services" },
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
      <PageContainer className={BOOKING_SHELL}>
        <RevealGroup>
          <Reveal className="mb-6">
            <BackToSite href="/services" label="All services" />
          </Reveal>
          {/* Cross-nav: hop between services without going back to the index. */}
          {siblingServices.length > 1 && (
            <Reveal className="mb-6">
              <ServiceSwitcher
                services={siblingServices}
                activeSlug={service.slug}
              />
            </Reveal>
          )}
          <Reveal>
            <PageHeader title={service.name} subtitle={service.description} />
          </Reveal>
        </RevealGroup>
        <ServiceBookingClient
          service={service}
          rules={formData.rules}
          initialBusy={formData.initialBusy}
          initialPremiumDays={formData.initialPremiumDays}
          authState={viewer.authState}
          pets={viewer.pets}
          initialSelection={initialSelection}
          myBookingDayKeys={viewer.myBookingDayKeys}
          formResponses={viewer.formResponses}
          acceptedAuthVersion={viewer.acceptedAuthVersion}
          acceptedAuthAt={viewer.acceptedAuthAt}
          viewerDriveBufferMin={viewer.driveBufferMin}
        />
      </PageContainer>
    </>
  );
}
