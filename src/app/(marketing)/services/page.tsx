/**
 * Services page — active services with headline pricing + booking links.
 * Server component.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { listActiveServices } from "@/features/booking/services-repo";
import {
  serviceCardDescription,
  serviceCardDurationLabel,
} from "@/features/booking/service-card-display";
import { headlineRate } from "@/features/pricing/display";
import type { PublicService } from "@/features/booking/services-repo";
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
      <Card className="hover:border-foreground/40 h-full transition-colors">
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
      <PageHeader
        title="Services & Booking"
        subtitle={<MarketingCopy id="services.overview" />}
      />

      {services.length === 0 ? (
        <p className="text-muted-foreground">
          Services coming soon — check back shortly.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2" role="list">
          {services.map((service) => (
            <li key={service.slug}>
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      )}

      <section
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
      </section>
    </PageContainer>
  );
}
