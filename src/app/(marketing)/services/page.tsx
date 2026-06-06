/**
 * Services page — active services with headline pricing + sliding-scale CTA.
 * Server component.
 */
import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { listActiveServices } from "@/features/booking/services-repo";
import { headlineRate } from "@/features/pricing/display";
import type { PublicService } from "@/features/booking/services-repo";

function ServiceCard({ service }: { service: PublicService }) {
  const rate = headlineRate(service.pricingType, service.pricingConfig);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-heading">{service.name}</CardTitle>
        <p className="text-brand-strong text-sm font-medium">{rate}</p>
      </CardHeader>
      {service.description ? (
        <CardContent className="text-muted-foreground leading-relaxed">
          {service.description}
        </CardContent>
      ) : null}
      {service.default_duration_min !== null || service.max_pets !== null ? (
        <dl className="text-muted-foreground mt-auto flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {service.default_duration_min !== null ? (
            <>
              <dt className="sr-only">Default duration</dt>
              <dd>{service.default_duration_min} min</dd>
            </>
          ) : null}
          {service.max_pets !== null ? (
            <>
              <dt className="sr-only">Max pets</dt>
              <dd>
                Up to {service.max_pets} pet{service.max_pets !== 1 ? "s" : ""}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </Card>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase);

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <PageHeader title="Services" subtitle="[[BODY: services overview]]" />

      {services.length === 0 ? (
        <p className="text-muted-foreground">
          Services coming soon — check back shortly.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
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
          [[HEADER: pricing flexibility section]]
        </h2>
        <p className="text-muted-foreground mb-6 max-w-[60ch] text-sm leading-relaxed">
          [[BODY: pricing accessibility statement]]
        </p>
        <Link
          href="/book"
          className={cn(buttonVariants({ variant: "brand", size: "lg" }))}
        >
          Book a service
        </Link>
      </section>
    </PageContainer>
  );
}
