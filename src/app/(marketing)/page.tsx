/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const trustPoints = [
  {
    id: "trust-1",
    titleId: "home.trust.1.title",
    bodyId: "home.trust.1.body",
  },
  {
    id: "trust-2",
    titleId: "home.trust.2.title",
    bodyId: "home.trust.2.body",
  },
  {
    id: "trust-3",
    titleId: "home.trust.3.title",
    bodyId: "home.trust.3.body",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_7869.JPG"
        eyebrow="Dog walking · house sitting · Colorado"
        title={<MarketingCopy id="home.hero.hook" />}
        body={<MarketingCopy id="home.hero.body" />}
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
              <MarketingCopy id="home.why.header" />
            </h2>
          </div>
          <ul className="grid gap-10 sm:grid-cols-3" role="list">
            {trustPoints.map((p) => (
              <li
                key={p.id}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span className="font-heading text-foreground text-lg font-semibold">
                  <MarketingCopy id={p.titleId} />
                </span>
                <p className="text-muted-foreground max-w-[28ch] text-sm leading-relaxed">
                  <MarketingCopy id={p.bodyId} />
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
            <MarketingCopy id="home.cta.header" />
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch] leading-relaxed">
            <MarketingCopy id="home.cta.body" />
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
