/**
 * Home page — the main marketing landing page.
 * Server component.
 */

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section
        aria-labelledby="hero-heading"
        className="bg-background px-6 py-24 text-center"
      >
        <div className="mx-auto max-w-2xl">
          {/* TODO: real copy before launch */}
          <h1
            id="hero-heading"
            className="text-foreground mb-4 text-4xl font-bold tracking-tight sm:text-5xl"
          >
            [[HEADER: hero hook]]
          </h1>
          <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
            [[BODY: services overview and key differentiators]]
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/book" className={cn(buttonVariants({ size: "lg" }))}>
              Book a service
            </Link>
            <Link
              href="/services"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See all services
            </Link>
          </div>
        </div>
      </section>

      {/* Quick-trust strip */}
      <section aria-label="Why choose Cal" className="bg-muted px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-foreground mb-10 text-center text-2xl font-semibold">
            {/* TODO: real copy before launch */}
            Why choose Cal?
          </h2>
          <ul className="grid gap-8 sm:grid-cols-3">
            <li className="flex flex-col gap-2 text-center">
              <span className="text-foreground font-semibold">
                [[HEADER: trust point 1]]
              </span>
              <p className="text-muted-foreground text-sm leading-relaxed">
                [[BODY: trust point 1 detail]]
              </p>
            </li>
            <li className="flex flex-col gap-2 text-center">
              <span className="text-foreground font-semibold">
                [[HEADER: trust point 2]]
              </span>
              <p className="text-muted-foreground text-sm leading-relaxed">
                [[BODY: trust point 2 detail]]
              </p>
            </li>
            <li className="flex flex-col gap-2 text-center">
              <span className="text-foreground font-semibold">
                [[HEADER: trust point 3]]
              </span>
              <p className="text-muted-foreground text-sm leading-relaxed">
                [[BODY: trust point 3 detail]]
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* CTA strip */}
      <section
        aria-label="Get started"
        className="bg-background px-6 py-16 text-center"
      >
        <div className="mx-auto max-w-xl">
          {/* TODO: real copy before launch */}
          <h2 className="text-foreground mb-3 text-2xl font-semibold">
            Looking to book?
          </h2>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Create a free account, fill in your dog&apos;s details, and request
            a service.
          </p>
          <Link href="/book" className={cn(buttonVariants())}>
            Booking
          </Link>
        </div>
      </section>
    </>
  );
}
