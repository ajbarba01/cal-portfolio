"use client";

import { ChevronDown } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";

import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { copy, type CopyId } from "@/content/marketing";

// One Q&A row. The question is a raw string (it lives inside the trigger button,
// where a link can't nest); the answer renders through MarketingCopy so an inline
// link in Cal's copy "just works". `id` keys the accordion item.
export type FaqItem = {
  id: string;
  questionId: CopyId;
  answerId: CopyId;
};

/**
 * Shared FAQ accordion — each Q&A is a {@link ShimmerCard}, so the resting
 * surface and hover ring match every other marketing card exactly. Hovering warms
 * the card with a soft clay tint (open or closed, identical); opening rules the
 * answer off with a hairline and flips the chevron. Single-open. Scales as Cal
 * adds questions.
 */
export function FaqAccordion({ items }: { items: ReadonlyArray<FaqItem> }) {
  return (
    <Accordion.Root multiple={false} className="flex flex-col gap-3">
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          render={
            <ShimmerCard className="transition-colors duration-300 ease-out hover:bg-[color-mix(in_oklab,var(--sidebar-active)_28%,var(--card))]" />
          }
        >
          <Accordion.Header>
            <Accordion.Trigger className="focus-visible:outline-ring/50 flex w-full items-center gap-4 px-5 py-5 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-6">
              <span className="text-foreground flex-1 font-medium">
                {copy[item.questionId]}
              </span>
              <ChevronDown
                aria-hidden="true"
                className="text-muted-foreground group-data-open:text-brand-strong size-4 shrink-0 transition-[color,transform] duration-300 ease-out group-data-open:rotate-180"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-300 ease-out data-ending-style:h-0 data-starting-style:h-0">
            <p className="text-muted-foreground border-border/70 mx-5 mb-5 border-t pt-4 text-sm leading-relaxed sm:mx-6">
              <MarketingCopy id={item.answerId} />
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
