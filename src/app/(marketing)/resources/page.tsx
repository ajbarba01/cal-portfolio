"use client";

import { ChevronDown } from "lucide-react";
import { Accordion } from "@base-ui/react/accordion";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";

const localResources = [
  {
    id: "r1",
    title: "[[Resource 1: name]]",
    description: "[[Resource 1: one-line description]]",
    href: "#",
  },
  {
    id: "r2",
    title: "[[Resource 2: name]]",
    description: "[[Resource 2: one-line description]]",
    href: "#",
  },
  {
    id: "r3",
    title: "Animal Emergency & Referral Center of Northern Colorado",
    description: "24/7 emergency veterinary care in Colorado.",
    href: "https://aercnc.com",
  },
  {
    id: "r4",
    title: "ASPCA Poison Control Hotline",
    description: "(888) 426-4435 — available 24/7 for pet poison emergencies.",
    href: "https://www.aspca.org/pet-care/animal-poison-control",
  },
];

const faqItems = [
  {
    id: "faq-1",
    question: "[[FAQ 1: question]]",
    answer: "[[FAQ 1: answer]]",
  },
  {
    id: "faq-2",
    question: "[[FAQ 2: question]]",
    answer: "[[FAQ 2: answer]]",
  },
  {
    id: "faq-3",
    question: "[[FAQ 3: question]]",
    answer: "[[FAQ 3: answer]]",
  },
  {
    id: "faq-4",
    question: "[[FAQ 4: question]]",
    answer: "[[FAQ 4: answer]]",
  },
  {
    id: "faq-5",
    question: "[[FAQ 5: question]]",
    answer: "[[FAQ 5: answer]]",
  },
];

export default function ResourcesPage() {
  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader title="Resources" />

      <section aria-labelledby="local-resources-heading" className="mb-12">
        <h2
          id="local-resources-heading"
          className="font-heading mb-4 text-xl font-semibold"
        >
          Local dog resources
        </h2>
        <ul className="flex flex-col gap-4" role="list">
          {localResources.map(({ id, title, description, href }) => (
            <li key={id} className="border-border border-b pb-4 last:border-0">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-strong font-medium underline underline-offset-4 hover:opacity-70"
              >
                {title}
              </a>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="font-heading mb-4 text-xl font-semibold"
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
                {item.answer}
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </section>
    </PageContainer>
  );
}
