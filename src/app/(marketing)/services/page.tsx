/**
 * Services page — active services with headline pricing + booking links.
 * Server component.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  listActiveServices,
  serviceCardDescription,
  serviceCardDurationLabel,
  type PublicService,
} from "@/features/booking";
import { headlineRate } from "@/features/pricing";
import { MarketingCopy } from "@/components/marketing/marketing-copy";

function ServiceCard({ service }: { service: PublicService }) {
  const rate = headlineRate(service.pricingType, service.pricingConfig);
  const description = serviceCardDescription(service);
  const durationLabel = serviceCardDurationLabel(service);
  return (
    <Link
      href={`/book/${service.slug}`}
      className="focus-visible:ring-ring/50 block h-full rounded-xl outline-none focus-visible:ring-3"
    >
      <Card className="hover:border-foreground/40 h-full transition-colors sm:p-5.5">
        <CardHeader>
          <CardTitle className="font-heading">{service.name}</CardTitle>
          <p className="text-brand-strong text-sm font-medium">{rate}</p>
        </CardHeader>
        <CardContent className="text-muted-foreground leading-relaxed">
          {description}
        </CardContent>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          {durationLabel !== null || service.max_pets !== null ? (
            <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {durationLabel !== null ? (
                <>
                  <dt className="sr-only">Default duration</dt>
                  <dd>{durationLabel}</dd>
                </>
              ) : null}
              {service.max_pets !== null ? (
                <>
                  <dt className="sr-only">Max pets</dt>
                  <dd>
                    Up to {service.max_pets} pet
                    {service.max_pets !== 1 ? "s" : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : (
            <span />
          )}
          <span className="text-brand-strong text-xs font-semibold">
            View availability →
          </span>
        </div>
      </Card>
    </Link>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase);

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <Reveal>
        <PageHeader
          title="Services & Booking"
          subtitle={<MarketingCopy id="services.overview" />}
        />
      </Reveal>

      {services.length === 0 ? (
        <Reveal as="p" className="text-muted-foreground">
          Services coming soon — check back shortly.
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2"
          role="list"
        >
          {services.map((service) => (
            <Reveal as="li" key={service.slug}>
              <ServiceCard service={service} />
            </Reveal>
          ))}
        </RevealGroup>
      )}

      <Reveal
        as="section"
        aria-labelledby="sliding-scale-heading"
        className="border-border bg-card mt-12 rounded-lg border p-6 sm:p-8"
      >
        <Eyebrow>Sliding cost scale</Eyebrow>
        <h2
          id="sliding-scale-heading"
          className="font-heading mt-2 mb-2 text-xl font-semibold"
        >
          <MarketingCopy id="services.pricing.header" />
        </h2>
        <p className="text-muted-foreground max-w-[60ch] text-sm leading-relaxed">
          <MarketingCopy id="services.pricing.body" />
        </p>
      </Reveal>
    </PageContainer>
  );
}
