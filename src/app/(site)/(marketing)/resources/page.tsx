"use client";

import * as React from "react";
import { buildBreadcrumbJsonLd, JsonLd } from "@/features/seo";
import {
  TriangleAlert,
  HeartPulse,
  Stethoscope,
  ThermometerSun,
  Footprints,
  Syringe,
  Wheat,
  Waves,
  FlaskConical,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import {
  Multiswitch,
  type MultiswitchOption,
} from "@/components/ui/multiswitch";
import { BackToTop } from "@/components/ui/back-to-top";
import { copy, type CopyId } from "@/content/marketing";
import { cn } from "@/lib/utils";

// Scenario buckets group the Health resources by *when* they matter, driving the
// Multiswitch filter. Editorial classification (Cal's call to refine): Emergency
// = act now; Seasonal = warm-weather / Colorado-specific; Everyday = always worth
// knowing. Tag + icon are structural metadata, not copy — they live here, not in
// marketing.ts (which owns Cal's prose only).
type Scenario = "emergency" | "seasonal" | "everyday";
type Filter = "all" | Scenario;

const SCENARIO_LABEL: Record<Scenario, string> = {
  emergency: "Emergency",
  seasonal: "Seasonal",
  everyday: "Everyday",
};

// Tag tint per scenario — semantic tokens only (no hardcoded color): clay for
// emergency, amber "warning" for seasonal, neutral for everyday.
const SCENARIO_TAG_CLASS: Record<Scenario, string> = {
  emergency: "bg-sidebar-active text-brand-strong",
  seasonal: "bg-warning text-warning-foreground",
  everyday: "bg-secondary text-muted-foreground",
};

// Health & Safety — each topic links out to an external resource Cal supplied.
// The name renders raw inside the <a> (a link can't nest in MarketingCopy); the
// description renders through MarketingCopy. `detail` is verbatim contact info
// Cal attached to the entry (poison-control hotlines).
const healthResources: ReadonlyArray<{
  nameId: CopyId;
  descId: CopyId;
  href: string;
  detail?: string;
  Icon: LucideIcon;
  scenario: Scenario;
}> = [
  {
    nameId: "resources.health.1.name",
    descId: "resources.health.1.desc",
    href: "https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr",
    Icon: HeartPulse,
    scenario: "emergency",
  },
  {
    nameId: "resources.health.2.name",
    descId: "resources.health.2.desc",
    href: "https://www.aspca.org/pet-care/aspca-poison-control",
    detail: "(888) 426-4435 or (855) 764-7661",
    Icon: TriangleAlert,
    scenario: "emergency",
  },
  {
    nameId: "resources.health.3.name",
    descId: "resources.health.3.desc",
    href: "https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat",
    Icon: Stethoscope,
    scenario: "everyday",
  },
  {
    nameId: "resources.health.4.name",
    descId: "resources.health.4.desc",
    href: "https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke",
    Icon: ThermometerSun,
    scenario: "seasonal",
  },
  {
    nameId: "resources.health.5.name",
    descId: "resources.health.5.desc",
    href: "https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/",
    Icon: Footprints,
    scenario: "seasonal",
  },
  {
    nameId: "resources.health.6.name",
    descId: "resources.health.6.desc",
    href: "https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus",
    Icon: Syringe,
    scenario: "everyday",
  },
  {
    nameId: "resources.health.7.name",
    descId: "resources.health.7.desc",
    href: "https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/",
    Icon: Wheat,
    scenario: "seasonal",
  },
  {
    nameId: "resources.health.8.name",
    descId: "resources.health.8.desc",
    href: "https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html",
    Icon: Waves,
    scenario: "seasonal",
  },
  {
    nameId: "resources.health.9.name",
    descId: "resources.health.9.desc",
    href: "https://www.aspca.org/news/top-10-toxins-2025",
    Icon: FlaskConical,
    scenario: "everyday",
  },
];

const FILTER_OPTIONS: ReadonlyArray<MultiswitchOption<Filter>> = [
  { value: "all", label: "All" },
  { value: "emergency", label: SCENARIO_LABEL.emergency },
  { value: "seasonal", label: SCENARIO_LABEL.seasonal },
  { value: "everyday", label: SCENARIO_LABEL.everyday },
];

// Topic-only sections — names Cal listed without links/descriptions yet. Render
// through MarketingCopy so a future inline link "just works".
const toolsTopics: readonly CopyId[] = [
  "resources.tools.1.name",
  "resources.tools.2.name",
  "resources.tools.3.name",
  "resources.tools.4.name",
];

const enrichmentTopics: readonly CopyId[] = [
  "resources.enrichment.1.name",
  "resources.enrichment.2.name",
  "resources.enrichment.3.name",
  "resources.enrichment.4.name",
];

function ScenarioTag({ scenario }: { scenario: Scenario }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.08em] uppercase",
        SCENARIO_TAG_CLASS[scenario],
      )}
    >
      {SCENARIO_LABEL[scenario]}
    </span>
  );
}

function TopicChips({ topics }: { topics: readonly CopyId[] }) {
  return (
    <ul className="flex flex-wrap gap-2" role="list">
      {topics.map((id) => (
        <li
          key={id}
          className="border-border bg-card text-foreground rounded-full border px-3 py-1 text-sm"
        >
          <MarketingCopy id={id} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One editorial band with a sticky side-label (the about/services pattern). The
 * old per-section eyebrow is gone; its descriptive text moves into `note` beside
 * the heading, where it informs rather than restates. `bandAlt` flips the band
 * to the section-alt surface so adjacent bands alternate color.
 */
function LedgerSection({
  id,
  title,
  note,
  bandAlt = false,
  width = "app",
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  bandAlt?: boolean;
  /** Container width — Health needs the full `app` measure; the lighter topic
   *  sections read better in the narrower `read` column. */
  width?: "app" | "read";
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn(
        bandAlt ? "bg-section-alt" : "bg-background",
        "panel-ombre",
      )}
    >
      <PageContainer width={width} className="py-12 sm:py-16">
        <RevealGroup className="flex flex-col gap-4 lg:flex-row lg:gap-12">
          <Reveal className="lg:sticky lg:top-8 lg:w-56 lg:shrink-0 lg:self-start">
            <h2
              id={`${id}-heading`}
              className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {title}
            </h2>
            {note ? (
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                {note}
              </p>
            ) : null}
          </Reveal>
          <div className="min-w-0 flex-1">{children}</div>
        </RevealGroup>
      </PageContainer>
    </section>
  );
}

export default function ResourcesPage() {
  const [filter, setFilter] = React.useState<Filter>("all");

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources" },
        ])}
      />
      {/* Masthead — centered editorial header, no eyebrow (it would restate
          "Resources"); the intro carries the framing. */}
      <section
        aria-labelledby="resources-heading"
        className="bg-background panel-ombre"
      >
        <PageContainer
          width="app"
          className="pt-10 pb-6 text-center sm:pt-14 sm:pb-8"
        >
          <RevealGroup>
            <Reveal
              as="h1"
              id="resources-heading"
              className="font-heading mx-auto max-w-[16ch] text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Resources
            </Reveal>
            <Reveal
              as="p"
              className="text-muted-foreground mx-auto mt-4 max-w-[62ch] leading-relaxed"
            >
              <MarketingCopy id="resources.intro" />
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>

      {/* Health & Safety — the core. Emergency contacts pinned first, then a
          scenario filter over the iconified resource ledger. */}
      <LedgerSection
        id="health"
        title="Health & Safety"
        note="First aid and prevention — the topics I discuss most. Each links to a trusted external guide."
      >
        {/* Emergency pin — time-critical numbers surfaced above the fold, tap-to-call. */}
        <Reveal className="bg-sidebar-active mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-4 py-3.5">
          <span className="text-brand-strong inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            In an emergency
          </span>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <a
              href="tel:+18884264435"
              className="font-heading text-foreground border-brand border-b-[1.5px] font-semibold hover:opacity-70"
            >
              (888) 426-4435
            </a>
            <a
              href="tel:+18557647661"
              className="font-heading text-foreground border-brand border-b-[1.5px] font-semibold hover:opacity-70"
            >
              (855) 764-7661
            </a>
            <span className="text-muted-foreground text-sm">
              ASPCA Animal Poison Control — tap to call
            </span>
          </div>
        </Reveal>

        {/* Scenario filter — the shared Multiswitch, mutually-exclusive. */}
        <Reveal className="mb-6">
          <Multiswitch
            ariaLabel="Filter health resources by scenario"
            options={FILTER_OPTIONS}
            value={filter}
            onValueChange={setFilter}
            className="flex-wrap"
          />
        </Reveal>

        <ul className="flex flex-col" role="list">
          {healthResources.map(
            ({ nameId, descId, href, detail, Icon, scenario }) => {
              const show = filter === "all" || scenario === filter;
              return (
                <Reveal
                  as="li"
                  key={nameId}
                  className={cn(
                    "border-border group relative -mx-3 flex gap-4 rounded-xl border-b px-3 py-4 transition-colors duration-200 last:border-0 hover:bg-[color-mix(in_oklab,var(--brand)_5%,transparent)]",
                    !show && "hidden",
                  )}
                >
                  <span
                    className="bg-sidebar-active text-brand-strong mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-shadow duration-300 ease-out group-hover:shadow-[0_0_0_5px_color-mix(in_oklab,var(--brand)_9%,transparent)]"
                    aria-hidden="true"
                  >
                    <Icon className="size-4.5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-strong inline-flex items-center gap-1 font-semibold after:absolute after:inset-0 hover:underline hover:underline-offset-4"
                      >
                        {copy[nameId]}
                        <ArrowUpRight
                          className="size-3.5 opacity-60"
                          aria-hidden="true"
                        />
                      </a>
                      <ScenarioTag scenario={scenario} />
                      {detail ? (
                        <span className="text-muted-foreground text-xs">
                          {detail}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      <MarketingCopy id={descId} />
                    </p>
                  </div>
                </Reveal>
              );
            },
          )}
        </ul>
      </LedgerSection>

      {/* Tools & Training — alt band (distinct color from Enrichment). */}
      <LedgerSection
        id="tools"
        title="Tools & Training"
        note="Gear and methods I get asked about most."
        bandAlt
        width="read"
      >
        <TopicChips topics={toolsTopics} />
        <p className="text-muted-foreground mt-4 text-sm italic">
          Write-ups in progress — these become links as I finish each one.
        </p>
      </LedgerSection>

      {/* Enrichment — base band (distinct from Tools). */}
      <LedgerSection
        id="enrichment"
        title="Enrichment & Well-Being"
        note="Beyond the walk — keeping dogs happy and stimulated."
        width="read"
      >
        <TopicChips topics={enrichmentTopics} />
        <p className="text-muted-foreground mt-4 text-sm italic">
          Write-ups in progress — these become links as I finish each one.
        </p>
      </LedgerSection>

      {/* Closing sign-off — alt band (Enrichment is base, so this keeps the
          alternation). Cal's invitation to suggest more resources. */}
      <section
        aria-label="A note from Cal"
        className="bg-section-alt panel-ombre"
      >
        <PageContainer width="read" className="py-12 sm:py-16">
          <RevealGroup>
            <Reveal
              as="p"
              className="text-muted-foreground mx-auto max-w-[60ch] text-center leading-relaxed"
            >
              <MarketingCopy id="resources.closing" />
            </Reveal>
          </RevealGroup>
        </PageContainer>
      </section>

      <BackToTop />
    </>
  );
}
