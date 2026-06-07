/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const trustPoints = [
  {
    id: "trust-1",
    title: "[[HEADER: trust point 1]]",
    body: "[[BODY: trust point 1 detail]]",
  },
  {
    id: "trust-2",
    title: "[[HEADER: trust point 2]]",
    body: "[[BODY: trust point 2 detail]]",
  },
  {
    id: "trust-3",
    title: "[[HEADER: trust point 3]]",
    body: "[[BODY: trust point 3 detail]]",
  },
];

export default function HomePage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_7869.JPG"
        eyebrow="Dog walking · house sitting · Colorado"
        title="[[HEADER: hero hook]]"
        body="[[BODY: services overview and what sets Cal apart]]"
        actions={
          <>
            <Link
              href="/services"
              className={cn(
                buttonVariants({ variant: "brand", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              Services &amp; booking
            </Link>
          </>
        }
      />

      {/* Why Cal — section-alt band (alternates with the sand-50 CTA below) */}
      <section aria-labelledby="why-heading" className="bg-section-alt">
        <PageContainer width="app" className="py-12 sm:py-16">
          <div className="mx-auto mb-10 max-w-[34ch] text-center">
            <Eyebrow>Why Cal</Eyebrow>
            <h2
              id="why-heading"
              className="font-heading mt-2 text-2xl font-semibold sm:text-3xl"
            >
              [[HEADER: why-Cal section]]
            </h2>
          </div>
          <ul className="grid gap-10 sm:grid-cols-3" role="list">
            {trustPoints.map((p) => (
              <li
                key={p.id}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span className="font-heading text-foreground text-lg font-semibold">
                  {p.title}
                </span>
                <p className="text-muted-foreground max-w-[28ch] text-sm leading-relaxed">
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
        </PageContainer>
      </section>

      {/* Closing CTA — sand-50 band */}
      <section aria-label="Get started" className="bg-background">
        <PageContainer width="read" className="py-12 text-center sm:py-16">
          <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
            [[HEADER: closing CTA]]
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch] leading-relaxed">
            [[BODY: short prompt to book]]
          </p>
          <Link
            href="/services"
            className={cn(
              buttonVariants({ variant: "brand", size: "lg" }),
              "mt-6",
            )}
          >
            Services &amp; booking
          </Link>
        </PageContainer>
      </section>
    </>
  );
}
