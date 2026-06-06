/**
 * Home page — photographic hero + lean document body.
 * Server component.
 */
import Link from "next/link";
import { Hero } from "./_components/hero";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const trustPoints = [
  {
    title: "[[HEADER: trust point 1]]",
    body: "[[BODY: trust point 1 detail]]",
  },
  {
    title: "[[HEADER: trust point 2]]",
    body: "[[BODY: trust point 2 detail]]",
  },
  {
    title: "[[HEADER: trust point 3]]",
    body: "[[BODY: trust point 3 detail]]",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      <PageContainer width="app" className="py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-[34ch] text-center">
          <Eyebrow>Why Cal</Eyebrow>
          <h2 className="font-heading mt-2 text-2xl font-semibold sm:text-3xl">
            [[HEADER: why-Cal section]]
          </h2>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3" role="list">
          {trustPoints.map((p) => (
            <li
              key={p.title}
              className="flex flex-col gap-2 text-center sm:text-left"
            >
              <span className="font-heading text-foreground text-lg font-semibold">
                {p.title}
              </span>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      </PageContainer>

      <section aria-label="Get started" className="border-border border-t">
        <PageContainer width="read" className="py-12 text-center sm:py-16">
          <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
            [[HEADER: closing CTA]]
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-[44ch] leading-relaxed">
            [[BODY: short prompt to book]]
          </p>
          <Link
            href="/book"
            className={cn(
              buttonVariants({ variant: "brand", size: "lg" }),
              "mt-6",
            )}
          >
            Book a service
          </Link>
        </PageContainer>
      </section>
    </>
  );
}
