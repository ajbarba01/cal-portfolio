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
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { buttonVariants } from "@/components/ui/button";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { createStaticClient } from "@/lib/supabase/static";
import {
  listActiveServices,
  serviceCategoryCopyId,
  serviceDetailLedeCopyId,
  serviceDetailBodyCopyId,
  serviceIncludedCopyIds,
  type PublicService,
} from "@/features/booking";
import { headlineRate, pricingBreakdown } from "@/features/pricing";
import { copy, type CopyId } from "@/content/marketing";
import { cn } from "@/lib/utils";
import { ServiceTabs, type ServiceTabItem } from "./_components/service-tabs";

/** The panel body for one service (server-rendered, passed to the tab island). */
function ServiceDetail({ service }: { service: PublicService }) {
  const ledeId = serviceDetailLedeCopyId(service.pricingType);
  const bodyId = serviceDetailBodyCopyId(service.pricingType);
  const includedIds: readonly CopyId[] = serviceIncludedCopyIds(
    service.pricingType,
  );
  const rate = headlineRate(service.pricingType, service.pricingConfig);
  const breakdown = pricingBreakdown(
    service.pricingType,
    service.pricingConfig,
  );

  return (
    <>
      {/* Photo placeholder — swap for real service imagery later. */}
      <div
        aria-hidden="true"
        className="border-border bg-muted text-muted-foreground mb-7 grid h-48 place-items-center rounded-2xl border border-dashed text-xs tracking-[0.12em] uppercase sm:h-56"
      >
        Photo placeholder
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:gap-12">
        <div>
          {ledeId ? (
            <p className="font-heading text-foreground text-xl leading-relaxed font-medium">
              <MarketingCopy id={ledeId} />
            </p>
          ) : null}
          {bodyId ? (
            <p className="text-muted-foreground mt-4 leading-relaxed">
              <MarketingCopy id={bodyId} />
            </p>
          ) : null}
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
        <aside className="lg:sticky lg:top-6 lg:self-start">
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

function toItem(service: PublicService, index: number): ServiceTabItem {
  const categoryId = serviceCategoryCopyId(service.pricingType);
  return {
    slug: service.slug,
    name: service.name,
    category: categoryId ? copy[categoryId] : null,
    badge: index === 0 ? copy["services.featured.badge"] : null,
    detail: <ServiceDetail service={service} />,
  };
}

// Static with daily ISR; admin service edits reflect immediately via
// revalidatePath("/services") in updateService.
export const revalidate = 86400;

export default async function ServicesPage() {
  const services = await listActiveServices(createStaticClient());
  const items = services.map(toItem);

  return (
    <>
      {/* Masthead — editorial header band */}
      <section
        aria-labelledby="services-heading"
        className="bg-background panel-ombre"
      >
        <PageContainer width="app" className="pt-10 pb-6 sm:pt-14 sm:pb-8">
          <RevealGroup className="text-center">
            <Reveal>
              <Eyebrow>
                <MarketingCopy id="services.hero.eyebrow" />
              </Eyebrow>
            </Reveal>
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

      {/* Tabbed services */}
      <section aria-label="Services" className="bg-background">
        <PageContainer width="app" className="pb-12 sm:pb-16">
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
    </>
  );
}
