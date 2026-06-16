/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { ShieldCheck, Heart, MapPin } from "lucide-react";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import placeholders from "@/content/image-placeholders.json";
import {
  StatTicker,
  type StatTickerItem,
} from "@/components/marketing/stat-ticker";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Surface } from "@/components/ui/surface";
import { buttonVariants } from "@/components/ui/button";
import { copy } from "@/content/marketing";
import { cn } from "@/lib/utils";
import { buildPageMetadata } from "@/features/seo";

// Cal's date of birth — age is derived so the ribbon never goes stale.
const CAL_DOB = "2002-12-10";

function yearsSince(isoDate: string): number {
  const dob = new Date(isoDate);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}

// Stat ribbon order (Cal's call): college · age · Rover · clients · experience · training · peaks.
const tickerItems: StatTickerItem[] = [
  {
    kind: "logo",
    src: "/brand/colorado-college.svg",
    alt: "Colorado College",
    width: 150,
    height: 32,
    label: copy["about.stat.cc.label"],
  },
  {
    kind: "stat",
    value: String(yearsSince(CAL_DOB)),
    label: copy["about.stat.age.label"],
  },
  {
    kind: "badge",
    value: copy["about.stat.rover.value"],
    label: copy["about.stat.rover.label"],
  },
  {
    kind: "stat",
    value: copy["about.stat.clients.value"],
    label: copy["about.stat.clients.label"],
  },
  {
    kind: "stat",
    value: copy["about.stat.experience.value"],
    label: copy["about.stat.experience.label"],
  },
  {
    kind: "stat",
    value: copy["about.stat.training.value"],
    label: copy["about.stat.training.label"],
  },
  {
    kind: "stat",
    value: copy["about.stat.fourteeners.value"],
    label: copy["about.stat.fourteeners.label"],
  },
];

const trustPoints = [
  {
    id: "trust-1",
    titleId: "home.trust.1.title",
    bodyId: "home.trust.1.body",
    Icon: ShieldCheck,
  },
  {
    id: "trust-2",
    titleId: "home.trust.2.title",
    bodyId: "home.trust.2.body",
    Icon: Heart,
  },
  {
    id: "trust-3",
    titleId: "home.trust.3.title",
    bodyId: "home.trust.3.body",
    Icon: MapPin,
  },
] as const;

// Static with daily ISR so the derived age ribbon (yearsSince) refreshes without
// a redeploy; the page reads no per-request data, so it stays cached static HTML.
export const revalidate = 86400;

export const metadata = buildPageMetadata({
  title: "Cal Barba — Dog Walking & House Sitting on the Front Range",
  description:
    "Reliable dog walking and house sitting across Colorado's Front Range. Caring, dependable pet care tailored to your dog.",
  path: "/",
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_7869.JPG"
        blurDataURL={(placeholders as Record<string, string>)["IMG_7869.JPG"]}
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

      <StatTicker items={tickerItems} label="Cal at a glance" />

      {/* Why Cal — section-alt band (alternates with the sand-50 CTA below) */}
      <section
        aria-labelledby="why-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="app" className="py-12 sm:py-16">
          {/* Section reveals as a unit; header then cards cascade by position. */}
          <RevealGroup>
            <Reveal className="mx-auto mb-8 max-w-[34ch] text-center sm:mb-10">
              <Eyebrow>Why Cal</Eyebrow>
              <h2
                id="why-heading"
                className="font-heading mt-2 text-2xl font-bold sm:text-3xl"
              >
                <MarketingCopy id="home.why.header" />
              </h2>
            </Reveal>

            {/* Trust cards — centered grid, max-w ~944px; 1-col on mobile */}
            <ul
              className="mx-auto grid max-w-236 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6"
              role="list"
            >
              {trustPoints.map((p) => (
                <Reveal as="li" key={p.id} className="list-none">
                  <Surface variant="emphasis" className="h-full p-5 sm:p-5.5">
                    {/* Icon disc + title row */}
                    <div className="mb-3 flex items-center gap-3">
                      <span
                        className="bg-sidebar-active flex size-9.5 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-300 ease-out group-hover:bg-[color-mix(in_oklab,var(--brand)_12%,var(--sidebar-active))] group-hover:shadow-[0_0_0_5px_color-mix(in_oklab,var(--brand)_9%,transparent)]"
                        aria-hidden="true"
                      >
                        <p.Icon
                          className="text-brand-strong group-hover:text-brand size-4.5 transition-colors duration-300 ease-out"
                          strokeWidth={1.9}
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
                  </Surface>
                </Reveal>
              ))}
            </ul>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* Closing CTA — sand-50 band */}
      <section aria-label="Get started" className="bg-background panel-ombre">
        <PageContainer width="read" className="py-12 text-center sm:py-16">
          <RevealGroup>
            <Reveal
              as="h2"
              className="font-heading text-2xl font-bold sm:text-3xl"
            >
              <MarketingCopy id="home.cta.header" />
            </Reveal>
            <Reveal
              as="p"
              className="text-muted-foreground mx-auto mt-3 max-w-[44ch] leading-relaxed"
            >
              <MarketingCopy id="home.cta.body" />
            </Reveal>
            <Reveal className="mt-6">
              <Link
                href="/services"
                className={cn(buttonVariants({ variant: "brand", size: "lg" }))}
              >
                Services &amp; booking
              </Link>
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>
    </>
  );
}
