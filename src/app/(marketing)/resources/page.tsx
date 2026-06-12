"use client";

import { ChevronDown } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { copy, type CopyId } from "@/content/marketing";

// Health & Safety — each topic links out to an external resource Cal supplied.
// The name renders raw inside the <a> (a link can't nest in MarketingCopy); the
// description renders through MarketingCopy. `detail` is verbatim contact info
// Cal attached to the entry (poison-control hotlines).
const healthResources: ReadonlyArray<{
  nameId: CopyId;
  descId: CopyId;
  href: string;
  detail?: string;
}> = [
  {
    nameId: "resources.health.1.name",
    descId: "resources.health.1.desc",
    href: "https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr",
  },
  {
    nameId: "resources.health.2.name",
    descId: "resources.health.2.desc",
    href: "https://www.aspca.org/pet-care/aspca-poison-control",
    detail: "(888) 426-4435 or (855) 764-7661",
  },
  {
    nameId: "resources.health.3.name",
    descId: "resources.health.3.desc",
    href: "https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat",
  },
  {
    nameId: "resources.health.4.name",
    descId: "resources.health.4.desc",
    href: "https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke",
  },
  {
    nameId: "resources.health.5.name",
    descId: "resources.health.5.desc",
    href: "https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/",
  },
  {
    nameId: "resources.health.6.name",
    descId: "resources.health.6.desc",
    href: "https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus",
  },
  {
    nameId: "resources.health.7.name",
    descId: "resources.health.7.desc",
    href: "https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/",
  },
  {
    nameId: "resources.health.8.name",
    descId: "resources.health.8.desc",
    href: "https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html",
  },
  {
    nameId: "resources.health.9.name",
    descId: "resources.health.9.desc",
    href: "https://www.aspca.org/news/top-10-toxins-2025",
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

// Answers render through MarketingCopy (may carry inline links); questions live
// inside the accordion trigger button, so they stay raw strings — a link can't
// nest in a button.
const faqItems = [
  {
    id: "faq-1",
    question: copy["resources.faq.1.q"],
    answerId: "resources.faq.1.a",
  },
  {
    id: "faq-2",
    question: copy["resources.faq.2.q"],
    answerId: "resources.faq.2.a",
  },
] as const;

function TopicChips({ topics }: { topics: readonly CopyId[] }) {
  return (
    <ul className="flex flex-wrap gap-2" role="list">
      {topics.map((id) => (
        <li
          key={id}
          className="border-border text-foreground rounded-full border px-3 py-1 text-sm"
        >
          <MarketingCopy id={id} />
        </li>
      ))}
    </ul>
  );
}

export default function ResourcesPage() {
  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader
        title="Resources"
        subtitle={<MarketingCopy id="resources.intro" />}
      />

      <section aria-labelledby="health-heading" className="mb-12">
        <Eyebrow>First aid &amp; prevention</Eyebrow>
        <h2
          id="health-heading"
          className="font-heading mt-2 mb-4 text-xl font-semibold"
        >
          Health &amp; Safety
        </h2>
        <ul className="flex flex-col gap-4" role="list">
          {healthResources.map(({ nameId, descId, href, detail }) => (
            <li
              key={nameId}
              className="border-border border-b pb-4 last:border-0"
            >
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-strong font-medium underline underline-offset-4 hover:opacity-70"
              >
                {copy[nameId]}
              </a>
              {detail ? (
                <span className="text-muted-foreground ml-2 text-sm">
                  {detail}
                </span>
              ) : null}
              <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                <MarketingCopy id={descId} />
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools-heading" className="mb-12">
        <Eyebrow>Gear &amp; methods</Eyebrow>
        <h2
          id="tools-heading"
          className="font-heading mt-2 mb-4 text-xl font-semibold"
        >
          Tools &amp; Training
        </h2>
        <TopicChips topics={toolsTopics} />
      </section>

      <section aria-labelledby="enrichment-heading" className="mb-12">
        <Eyebrow>Beyond the walk</Eyebrow>
        <h2
          id="enrichment-heading"
          className="font-heading mt-2 mb-4 text-xl font-semibold"
        >
          Enrichment &amp; Well-Being
        </h2>
        <TopicChips topics={enrichmentTopics} />
      </section>

      <p className="text-muted-foreground mb-12 leading-relaxed">
        <MarketingCopy id="resources.closing" />
      </p>

      <section aria-labelledby="faq-heading">
        <Eyebrow>Common questions</Eyebrow>
        <h2
          id="faq-heading"
          className="font-heading mt-2 mb-4 text-xl font-semibold"
        >
          Frequently asked questions
        </h2>
        <Accordion.Root className="flex flex-col">
          {faqItems.map((item) => (
            <Accordion.Item
              key={item.id}
              value={item.id}
              className="border-border border-b"
            >
              <Accordion.Header>
                <Accordion.Trigger className="group focus-visible:outline-ring/50 flex w-full items-center justify-between gap-4 py-4 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2">
                  <span className="text-foreground font-medium">
                    {item.question}
                  </span>
                  <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform group-data-panel-open:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel className="text-muted-foreground pb-4 text-sm leading-relaxed">
                <MarketingCopy id={item.answerId} />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </section>
    </PageContainer>
  );
}
