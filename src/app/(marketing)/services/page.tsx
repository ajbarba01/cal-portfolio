/**
 * Services page — lists active services with headline pricing.
 * Server component.
 */

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { listActiveServices } from "@/features/booking/services-repo";
import { headlineRate } from "@/features/pricing/display";
import type { PublicService } from "@/features/booking/services-repo";

function ServiceCard({ service }: { service: PublicService }) {
  const rate = headlineRate(service.pricingType, service.pricingConfig);

  return (
    <article className="bg-card text-card-foreground border-border flex flex-col gap-3 rounded-lg border p-6">
      <header>
        <h2 className="text-foreground text-xl font-semibold">
          {service.name}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm font-medium">
          {rate}
        </p>
      </header>

      {service.description && (
        <p className="text-muted-foreground text-sm leading-relaxed">
          {service.description}
        </p>
      )}

      {(service.default_duration_min !== null || service.max_pets !== null) && (
        <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {service.default_duration_min !== null && (
            <>
              <dt className="sr-only">Default duration</dt>
              <dd>{service.default_duration_min} min</dd>
            </>
          )}
          {service.max_pets !== null && (
            <>
              <dt className="sr-only">Max pets</dt>
              <dd>
                Up to {service.max_pets} pet{service.max_pets !== 1 ? "s" : ""}
              </dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* TODO: real copy before launch */}
      <header className="mb-10">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Services
        </h1>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Every service is personal and flexible — drop-in, daily walks, or full
          house sits while you&apos;re away.
        </p>
      </header>

      {services.length === 0 ? (
        <p className="text-muted-foreground">
          Services coming soon — check back shortly.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2" role="list">
          {services.map((service) => (
            <li key={service.slug}>
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      )}

      {/* Sliding-scale CTA — this is a CTA, not a pricing feature */}
      <section
        aria-labelledby="sliding-scale-heading"
        className="bg-muted mt-12 rounded-lg px-6 py-8"
      >
        <h2
          id="sliding-scale-heading"
          className="text-foreground mb-2 text-lg font-semibold"
        >
          Pricing flexibility matters to me.
        </h2>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          {/* TODO: real copy before launch */}
          If cost is a barrier, reach out. I offer a sliding scale for clients
          who need it — I&apos;d rather work something out than have a great dog
          go without good care.
        </p>
        <Link href="/book" className={cn(buttonVariants())}>
          Book a service
        </Link>
      </section>
    </div>
  );
}
