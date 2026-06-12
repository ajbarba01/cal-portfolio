/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { ShieldCheck, Heart, MapPin } from "lucide-react";
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
    Icon: ShieldCheck,
    iconLabel: "Safety shield",
  },
  {
    id: "trust-2",
    titleId: "home.trust.2.title",
    bodyId: "home.trust.2.body",
    Icon: Heart,
    iconLabel: "Heart",
  },
  {
    id: "trust-3",
    titleId: "home.trust.3.title",
    bodyId: "home.trust.3.body",
    Icon: MapPin,
    iconLabel: "Location pin",
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
          <div className="mx-auto mb-8 max-w-[34ch] text-center sm:mb-10">
            <Eyebrow>Why Cal</Eyebrow>
            <h2
              id="why-heading"
              className="font-heading mt-2 text-2xl font-semibold sm:text-3xl"
            >
              <MarketingCopy id="home.why.header" />
            </h2>
          </div>

          {/* Trust cards — centered grid, max-w ~944px; 1-col on mobile */}
          <ul
            className="mx-auto grid max-w-[944px] grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6"
            role="list"
          >
            {trustPoints.map((p) => (
              <li
                key={p.id}
                className="bg-card border-border rounded-2xl border p-5 sm:p-[22px]"
              >
                {/* Icon disc + title row */}
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="bg-sidebar-active flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full"
                    aria-hidden="true"
                  >
                    <p.Icon
                      className="text-brand-strong h-[18px] w-[18px]"
                      strokeWidth={1.9}
                      aria-label={p.iconLabel}
                    />
                  </span>
                  <h3 className="font-heading text-foreground text-[17px] leading-snug font-semibold">
                    <MarketingCopy id={p.titleId} />
                  </h3>
                </div>

                {/* Long-form body — left-aligned, full width within card */}
                <p className="text-muted-foreground text-[13.5px] leading-[1.65]">
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
