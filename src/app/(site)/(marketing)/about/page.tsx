/**
 * About page — photographic hero, a continuous stat ribbon, then an editorial
 * bio / approach / favorite-quote / references flow in alternating bands.
 * Authored mobile-first. Server component.
 */
import Image from "next/image";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import placeholders from "@/content/image-placeholders.json";
import {
  StatTicker,
  type StatTickerItem,
} from "@/components/marketing/stat-ticker";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { copy } from "@/content/marketing";

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

const bioParagraphs = [
  "about.bio.p1",
  "about.bio.p2",
  "about.bio.p3",
  "about.bio.p4",
] as const;

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_0048.JPG"
        blurDataURL={(placeholders as Record<string, string>)["IMG_0048.JPG"]}
        title="Meet Cal"
        body={<MarketingCopy id="about.summary" />}
        aspect="aspect-[2/1] lg:aspect-[5/2]"
      />

      <StatTicker items={tickerItems} label="Cal at a glance" />

      {/* Bio — editorial two-column with an offset photo */}
      <section
        aria-labelledby="bio-heading"
        className="bg-background panel-ombre"
      >
        <PageContainer width="app" className="py-12 sm:py-16">
          <RevealGroup className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-[1fr_280px] lg:items-center lg:gap-14">
            <div>
              <Reveal
                as="h2"
                id="bio-heading"
                className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                A life with animals
              </Reveal>
              <Reveal className="text-muted-foreground mt-5 flex flex-col gap-4 leading-relaxed">
                {bioParagraphs.map((id) => (
                  <p key={id}>
                    <MarketingCopy id={id} />
                  </p>
                ))}
              </Reveal>
            </div>
            <Reveal
              as="figure"
              className="mx-auto w-full max-w-xs lg:mx-0 lg:max-w-none"
            >
              {/* data-ring-exclude: keep the cursor glow off the bio photo,
                  same as hero / gallery imagery. */}
              <div
                data-ring-exclude
                className="relative aspect-[3/4] overflow-hidden shadow-xl"
              >
                <Image
                  src="/gallery/IMG_5455.JPG"
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 20rem, 280px"
                  className="object-cover"
                />
              </div>
              <figcaption className="text-muted-foreground font-heading mt-3 text-center text-sm italic">
                <MarketingCopy id="about.bio.photo.caption" />
              </figcaption>
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* Approach — side-labelled statement on the section-alt band */}
      <section
        aria-labelledby="approach-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="app" className="py-12 sm:py-16">
          <RevealGroup className="flex justify-center">
            {/* Label + body read as one centered element; the label sits at the
                top-left of the body on wide viewports, above it on mobile. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:gap-10">
              <Reveal
                as="h2"
                id="approach-heading"
                className="text-brand-strong text-xs font-semibold tracking-[0.14em] uppercase lg:pt-2 lg:whitespace-nowrap"
              >
                My approach
              </Reveal>
              <Reveal className="max-w-[58ch]">
                <p className="font-heading text-foreground text-xl leading-snug font-medium sm:text-2xl">
                  <MarketingCopy id="about.approach.p1" />
                </p>
                <p className="text-muted-foreground mt-5 leading-relaxed">
                  <MarketingCopy id="about.approach.p2" />
                </p>
              </Reveal>
            </div>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* Favorite quote — epigraph on the base band, right before references */}
      <section
        aria-label="A quote Cal loves"
        className="bg-background panel-ombre"
      >
        <PageContainer width="read" className="py-14 text-center sm:py-20">
          <RevealGroup>
            <Reveal
              as="span"
              aria-hidden="true"
              className="font-heading text-brand-strong block text-5xl leading-none"
            >
              &ldquo;
            </Reveal>
            <Reveal
              as="blockquote"
              className="font-heading text-foreground mt-2 text-2xl leading-relaxed font-medium italic sm:text-[1.8rem]"
            >
              <MarketingCopy id="about.quote.text" />
            </Reveal>
            <Reveal
              as="p"
              className="text-brand-strong mt-6 text-xs font-semibold tracking-[0.12em] uppercase"
            >
              &mdash; <MarketingCopy id="about.quote.author" />
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* References — section-alt band. The named-client list (about.references
          intro + about.references.1–8) stays withheld pending each client's
          permission to publish (2026-06-10); the copy is kept in marketing.ts.
          Restore the intro + real names in place of the placeholder chips once
          consent is granted. */}
      <section
        aria-labelledby="references-heading"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="read" className="py-12 sm:py-16">
          <RevealGroup>
            <Reveal
              as="h2"
              id="references-heading"
              className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              References
            </Reveal>
            <Reveal
              as="p"
              className="text-muted-foreground mt-3 leading-relaxed"
            >
              <MarketingCopy id="about.references.pending" />
            </Reveal>
            <ul role="list" className="mt-6 flex flex-wrap gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Reveal
                  as="li"
                  key={i}
                  className="bg-sidebar-active text-brand-strong rounded-full px-4 py-2 text-sm font-medium"
                >
                  Client reference
                </Reveal>
              ))}
            </ul>
          </RevealGroup>
        </PageContainer>
      </section>
    </>
  );
}
