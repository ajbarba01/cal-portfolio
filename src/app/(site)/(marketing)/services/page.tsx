/**
 * Services page — a tabbed index, one tab per service. The centered tab strip
 * scrolls horizontally when it overflows (mobile); selecting a tab shows that
 * service's panel: photo placeholder, long-form description, "what's included",
 * and a priced-out receipt (the only white card). Each links to its /book/[slug]
 * page. The tab strip is a small client island; all copy is server-rendered and
 * passed through. Server component.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildBusinessOffersJsonLd,
  JsonLd,
} from "@/features/seo";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { EmptyState } from "@/components/feedback/empty-state";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { MarketingProse } from "@/components/marketing/marketing-prose";
import { headingClass } from "@/components/marketing/section-header";
import { ServicePhotoStrip } from "@/components/marketing/service-photo-strip";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { InfoTooltip } from "@/components/ui/tooltip";
import { createStaticClient } from "@/lib/supabase/static";
import {
  listActiveServices,
  type PublicService,
} from "@/features/booking/services-repo";
import {
  serviceDetailLedeCopyId,
  serviceDetailBodyCopyId,
  serviceIncludedCopyIds,
} from "@/features/booking/service-card-display";
import { headlineRate, pricingBreakdown } from "@/features/pricing";
import { getServiceImages, type ServiceImage } from "@/features/gallery";
import { type CopyId } from "@/content/marketing";
import { cn } from "@/lib/utils";
import { ServiceTabs, type ServiceTabItem } from "./_components/service-tabs";

/** The panel body for one service (server-rendered, passed to the tab island). */
function ServiceDetail({
  service,
  photos,
}: {
  service: PublicService;
  photos: readonly ServiceImage[];
}) {
  const ledeId = serviceDetailLedeCopyId(service.pricingType);
  const bodyId = serviceDetailBodyCopyId(service.pricingType);
  const includedIds: readonly CopyId[] = serviceIncludedCopyIds(
    service.pricingType,
  );
  const rate = headlineRate(service.pricingConfig);
  const breakdown = pricingBreakdown(service.pricingConfig);

  return (
    <>
      {photos.length > 0 ? (
        <ServicePhotoStrip
          photos={photos.map((photo) => ({
            ...photo,
            alt: `${service.name} with Cal`,
          }))}
          className="mb-7"
        />
      ) : (
        // No photos for this service yet — keep a quiet placeholder.
        <div
          aria-hidden="true"
          className="border-border bg-muted text-muted-foreground rounded-card mb-7 grid h-48 place-items-center border border-dashed text-xs tracking-[0.12em] uppercase sm:h-56"
        >
          Photo placeholder
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:gap-12">
        <div>
          {ledeId ? (
            <p className="font-heading text-foreground text-xl leading-relaxed font-medium">
              <MarketingCopy id={ledeId} />
            </p>
          ) : null}
          {bodyId ? <MarketingProse id={bodyId} className="mt-4" /> : null}
          {includedIds.length > 0 ? (
            <div className="mt-7">
              <Eyebrow>What&apos;s included</Eyebrow>
              <ul role="list" className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {includedIds.map((id) => (
                  <li
                    key={id}
                    className="text-foreground/85 flex items-start gap-2 text-sm"
                  >
                    <Check
                      className="text-brand mt-0.5 size-4 shrink-0"
                      strokeWidth={2.4}
                      aria-hidden="true"
                    />
                    <span>
                      <MarketingCopy id={id} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Receipt — the only white card; clay outline ring on hover, no shadow. */}
        <aside className="lg:sticky lg:top-[calc(var(--site-header-h)+1.5rem)] lg:self-start">
          <ShimmerCard className="p-5">
            <p className="font-heading text-foreground text-2xl leading-none">
              {rate}
            </p>
            {breakdown.length > 0 ? (
              <dl className="border-border mt-4 border-t pt-3 text-sm">
                {breakdown.map((row) => (
                  <div
                    key={row.label}
                    className="border-border flex items-baseline justify-between gap-3 border-b border-dotted py-1.5 last:border-b-0"
                  >
                    <dt className="text-muted-foreground inline-flex items-center gap-1">
                      {row.label}
                      {row.description && (
                        <InfoTooltip
                          label={`What is "${row.label}"?`}
                          content={row.description}
                        />
                      )}
                    </dt>
                    <dd className="font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <Link
              href={`/book/${service.slug}`}
              className={cn(
                buttonVariants({ variant: "brand" }),
                "mt-4 w-full",
              )}
            >
              Book {service.name.toLowerCase()}
            </Link>
            <p className="text-muted-foreground mt-3 text-center text-xs">
              Exact total is confirmed when you book.
            </p>
          </ShimmerCard>
        </aside>
      </div>
    </>
  );
}

function toItem(
  service: PublicService,
  photos: readonly ServiceImage[],
): ServiceTabItem {
  return {
    slug: service.slug,
    name: service.name,
    detail: <ServiceDetail service={service} photos={photos} />,
  };
}

export const metadata = buildPageMetadata({
  title: "Services",
  description:
    "Dog walking, house sitting, drop-in check-ins, and training across the Front Range — what's offered and how pricing works.",
  path: "/services",
});

// Static with daily ISR; admin service edits reflect immediately via
// revalidatePath("/services") in updateService.
export const revalidate = 86400;

export default async function ServicesPage() {
  const services = await listActiveServices(createStaticClient());
  const items = await Promise.all(
    services.map(async (service) =>
      toItem(service, await getServiceImages(service.slug)),
    ),
  );
  const offersLd = buildBusinessOffersJsonLd(services);

  return (
    <>
      {/* The only page that reads the live service list, so it is the one that
          adds the offers to the sitewide LocalBusiness node the marketing
          layout emits. */}
      {offersLd ? <JsonLd data={offersLd} /> : null}
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
        ])}
      />
      {/* Masthead — editorial header band */}
      <section
        aria-labelledby="services-heading"
        className="bg-background panel-ombre"
      >
        <PageContainer width="app" className="pt-10 pb-6 sm:pt-14 sm:pb-8">
          <RevealGroup className="text-center">
            <Reveal
              as="h1"
              id="services-heading"
              className={cn(headingClass.display, "mx-auto mt-3 max-w-[18ch]")}
            >
              <MarketingCopy id="services.hero.title" />
            </Reveal>
            <Reveal
              as="p"
              className="text-muted-foreground mx-auto mt-4 max-w-[56ch] leading-relaxed"
            >
              <MarketingCopy id="services.overview" />
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* Tabbed services */}
      <section aria-label="Services" className="bg-background">
        <PageContainer width="app" className="pt-12 pb-12 sm:pt-16 sm:pb-16">
          {items.length === 0 ? (
            <Reveal>
              <EmptyState
                title="Services coming soon"
                message="Check back shortly."
              />
            </Reveal>
          ) : (
            <Reveal>
              <ServiceTabs items={items} />
            </Reveal>
          )}
        </PageContainer>
      </section>

      {/* Sliding cost scale — side-labelled statement on the alt band; last
          band before the footer. FAQ lives on /contact only. */}
      <section
        aria-labelledby="sliding-scale-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="app" className="py-12 sm:py-16">
          <RevealGroup className="flex flex-col gap-3 lg:flex-row lg:gap-12">
            {/* The side label IS this band's heading, so the eyebrow renders as
                the h2 that `aria-labelledby` points at. */}
            <Reveal className="lg:pt-2 lg:whitespace-nowrap">
              <Eyebrow as="h2" id="sliding-scale-heading">
                Sliding scale
              </Eyebrow>
            </Reveal>
            <Reveal className="max-w-[58ch]">
              <p className="font-heading text-foreground text-xl leading-snug font-medium sm:text-2xl">
                <MarketingCopy id="services.pricing.header" />
              </p>
              <p className="text-muted-foreground mt-5 leading-relaxed">
                <MarketingCopy id="services.pricing.body" />
              </p>
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>
    </>
  );
}
