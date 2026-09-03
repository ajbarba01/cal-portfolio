/**
 * Resources — an editorial ledger of the guidance Cal hands out most. Server
 * component: every card, tag and copy string is rendered here, and the only
 * client island is the scenario filter (see `_components/scenario-filter`).
 */
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

import {
  buildBreadcrumbJsonLd,
  buildPageMetadata,
  JsonLd,
} from "@/features/seo";
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import {
  headingClass,
  SectionHeader,
} from "@/components/marketing/section-header";
import { BackToTop } from "@/components/ui/back-to-top";
import { copy, type CopyId } from "@/content/marketing";
import { cn } from "@/lib/utils";
import { ScenarioFilter } from "./_components/scenario-filter";
import { SCENARIO_LABEL, type Scenario } from "./_components/scenarios";

export const metadata = buildPageMetadata({
  title: "Resources",
  description:
    "Pet-care guidance and Colorado-specific safety notes — heat, foxtails, algae blooms — from Cal Barba.",
  path: "/resources",
});

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
    // Two separate hotlines — attribute each number to its own org.
    detail: "ASPCA (888) 426-4435 · Pet Poison Helpline (855) 764-7661",
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
 * old per-section eyebrow is gone; its descriptive text moves into the note
 * beside the heading, where it informs rather than restates. The note is a copy
 * slot rather than a literal, so it carries a registry ID and can be reviewed and
 * revised by ID like the rest of the site's prose. `bandAlt` flips the band to
 * the section-alt surface so adjacent bands alternate color.
 */
function LedgerSection({
  id,
  title,
  noteId,
  bandAlt = false,
  width = "app",
  children,
}: {
  id: string;
  title: string;
  noteId?: CopyId;
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
          <Reveal className="lg:sticky lg:top-[calc(var(--site-header-h)+2rem)] lg:w-56 lg:shrink-0 lg:self-start">
            <SectionHeader as="h2" id={`${id}-heading`} title={title} />
            {/* The note is a side-column caption, so it stays at `text-sm`
                rather than using SectionHeader's full-measure description. */}
            {noteId ? (
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                <MarketingCopy id={noteId} />
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
              className={cn(headingClass.display, "mx-auto max-w-[16ch]")}
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
        noteId="resources.health.note"
      >
        {/* Emergency pin — time-critical numbers surfaced above the fold, tap-to-call. */}
        <Reveal className="bg-sidebar-active rounded-card mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5">
          <Eyebrow as="span" className="inline-flex items-center gap-1.5">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            In an emergency
          </Eyebrow>
          {/* Two distinct hotlines — each number attributed to its own org
              (they are separate services; the 855 number is NOT ASPCA). */}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <a
                href="tel:+18884264435"
                className="font-heading text-foreground border-brand border-b-[1.5px] font-semibold hover:opacity-70"
              >
                (888) 426-4435
              </a>
              <span className="text-muted-foreground text-sm">
                ASPCA Poison Control
              </span>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <a
                href="tel:+18557647661"
                className="font-heading text-foreground border-brand border-b-[1.5px] font-semibold hover:opacity-70"
              >
                (855) 764-7661
              </a>
              <span className="text-muted-foreground text-sm">
                Pet Poison Helpline
              </span>
            </span>
            <span className="text-muted-foreground text-sm">— tap to call</span>
          </div>
        </Reveal>

        <ScenarioFilter
          rows={healthResources.map(
            ({ nameId, descId, href, detail, Icon, scenario }) => ({
              id: nameId,
              scenario,
              content: (
                <>
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
                </>
              ),
            }),
          )}
        />
      </LedgerSection>

      {/* Tools & Training — alt band (distinct color from Enrichment). */}
      <LedgerSection
        id="tools"
        title="Tools & Training"
        noteId="resources.tools.note"
        bandAlt
        width="read"
      >
        <TopicChips topics={toolsTopics} />
      </LedgerSection>

      {/* Enrichment — base band (distinct from Tools). */}
      <LedgerSection
        id="enrichment"
        title="Enrichment & Well-Being"
        noteId="resources.enrichment.note"
        width="read"
      >
        <TopicChips topics={enrichmentTopics} />
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
