/**
 * Services page — a tabbed index, one tab per service. The centered tab strip
 * scrolls horizontally when it overflows (mobile); selecting a tab shows that
 * service's panel: photo placeholder, long-form description, "what's included",
 * and a priced-out receipt (the only white card). Each links to its /book/[slug]
 * page. The tab strip is a small client island; all copy is server-rendered and
 * passed through. Server component.
 */
import Link from "next/link";
import { Check, Info } from "lucide-react";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  JsonLd,
} from "@/features/seo";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { MarketingProse } from "@/components/marketing/marketing-prose";
import { ServicePhotoStrip } from "@/components/marketing/service-photo-strip";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { createStaticClient } from "@/lib/supabase/static";
import {
  listActiveServices,
  serviceDetailLedeCopyId,
  serviceDetailBodyCopyId,
  serviceIncludedCopyIds,
  type PublicService,
} from "@/features/booking";
import { headlineRate, pricingBreakdown } from "@/features/pricing";
import { getServiceImages, type ServiceImage } from "@/features/gallery";
import { copy, type CopyId } from "@/content/marketing";
import { cn } from "@/lib/utils";
import {
  FaqAccordion,
  type FaqItem,
} from "@/components/marketing/faq-accordion";
import { ServiceTabs, type ServiceTabItem } from "./_components/service-tabs";

// Scope questions buyers weigh while picking a service.
const FAQ_ITEMS: ReadonlyArray<FaqItem> = [
  {
    id: "boarding",
    questionId: "services.faq.1.q",
    answerId: "services.faq.1.a",
  },
];

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
          className="border-border bg-muted text-muted-foreground mb-7 grid h-48 place-items-center rounded-2xl border border-dashed text-xs tracking-[0.12em] uppercase sm:h-56"
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
                    <dt className="text-muted-foreground">{row.label}</dt>
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
  const photoLists = await Promise.all(
    services.map((service) => getServiceImages(service.slug)),
  );
  const items = services.map((service, index) =>
    toItem(service, photoLists[index]),
  );

  return (
    <>
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
              className="font-heading mx-auto mt-3 max-w-[18ch] text-4xl font-bold tracking-tight sm:text-5xl"
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

      {/* Time-bound availability notice — remove after 2026-09-01. Own
          full-width band (soft tint, hairline top/bottom); left-aligned
          stack — eyebrow, the reason + date, then dash-led constraints. */}
      <section
        aria-labelledby="availability-heading"
        className="bg-brand/6 border-brand/15 border-y"
      >
        <PageContainer width="app" className="py-7 sm:py-8">
          <Reveal>
            <h2
              id="availability-heading"
              className="text-brand-strong flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase"
            >
              <Info
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={2.2}
              />
              Limited availability
            </h2>
            <p className="text-foreground mt-2.5 max-w-[60ch] leading-relaxed">
              {copy["services.notice.lede"]}
            </p>
            <ul
              role="list"
              className="text-muted-foreground mt-2.5 max-w-[60ch] space-y-1.5 text-sm leading-relaxed"
            >
              {(
                [
                  "services.notice.1",
                  "services.notice.2",
                  "services.notice.3",
                ] as const
              ).map((id) => (
                <li key={id} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="text-brand/70 select-none"
                  >
                    –
                  </span>
                  <span>
                    <MarketingCopy id={id} />
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </PageContainer>
      </section>

      {/* Tabbed services */}
      <section aria-label="Services" className="bg-background">
        <PageContainer width="app" className="pt-12 pb-12 sm:pt-16 sm:pb-16">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center">
              Services coming soon — check back shortly.
            </p>
          ) : (
            <Reveal>
              <ServiceTabs items={items} />
            </Reveal>
          )}
        </PageContainer>
      </section>

      {/* Sliding cost scale — side-labelled statement on the alt band */}
      <section
        aria-labelledby="sliding-scale-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="app" className="py-12 sm:py-16">
          <RevealGroup className="flex flex-col gap-3 lg:flex-row lg:gap-12">
            <Reveal
              as="h2"
              id="sliding-scale-heading"
              className="text-brand-strong text-xs font-semibold tracking-[0.14em] uppercase lg:pt-2 lg:whitespace-nowrap"
            >
              Sliding scale
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

      {/* FAQ — base band (sliding scale is alt); centered title over a
          read-width accordion. Scope questions answered where buyers decide. */}
      <section
        aria-labelledby="services-faq-heading"
        className="bg-background panel-ombre"
      >
        <PageContainer width="read" className="py-12 sm:py-16">
          <RevealGroup>
            <Reveal
              as="h2"
              id="services-faq-heading"
              className="font-heading mx-auto max-w-[20ch] text-center text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Frequently Asked Questions
            </Reveal>
            <Reveal className="mt-6">
              <FaqAccordion items={FAQ_ITEMS} />
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>
    </>
  );
}
