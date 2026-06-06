/**
 * About page — hero + bio/approach/references in alternating section bands.
 * Server component.
 */
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { PageContainer } from "@/components/layout/page-container";

const approach = [
  {
    id: "a1",
    title: "[[Item 1: approach principle]]",
    detail: "[[Item 1: detail]]",
  },
  {
    id: "a2",
    title: "[[Item 2: approach principle]]",
    detail: "[[Item 2: detail]]",
  },
  {
    id: "a3",
    title: "[[Item 3: approach principle]]",
    detail: "[[Item 3: detail]]",
  },
];

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_0048.JPG"
        eyebrow="[[HEADER: about eyebrow]]"
        title="About"
        body="[[BODY: one-line about summary]]"
        aspect="aspect-[2/1] lg:aspect-[5/2]"
      />

      {/* Bio — section-alt band */}
      <section aria-labelledby="bio-heading" className="bg-section-alt">
        <PageContainer width="app" className="py-12 sm:py-16">
          <div className="max-w-[65ch]">
            <h2
              id="bio-heading"
              className="font-heading mb-3 text-xl font-semibold"
            >
              What I do
            </h2>
            <div className="text-muted-foreground flex flex-col gap-4 leading-relaxed">
              <p>[[BODY: bio paragraph 1 — background/experience]]</p>
              <p>[[BODY: bio paragraph 2 — services offered]]</p>
              <p>[[BODY: bio paragraph 3 — additional context]]</p>
            </div>
          </div>
        </PageContainer>
      </section>

      {/* Approach — background band */}
      <section aria-labelledby="approach-heading" className="bg-background">
        <PageContainer width="app" className="py-12 sm:py-16">
          <div className="max-w-[65ch]">
            <h2
              id="approach-heading"
              className="font-heading mb-3 text-xl font-semibold"
            >
              My approach
            </h2>
            <ul className="text-muted-foreground flex flex-col gap-3 leading-relaxed">
              {approach.map((a) => (
                <li key={a.id}>
                  <strong className="text-foreground">{a.title}</strong> —{" "}
                  {a.detail}
                </li>
              ))}
            </ul>
          </div>
        </PageContainer>
      </section>

      {/* References — section-alt band */}
      <section aria-labelledby="references-heading" className="bg-section-alt">
        <PageContainer width="app" className="py-12 sm:py-16">
          <div className="max-w-[65ch]">
            <h2
              id="references-heading"
              className="font-heading mb-3 text-xl font-semibold"
            >
              References
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              [[BODY: pointer to references — see the]]{" "}
              <Link
                href="/reviews"
                className="text-brand-strong underline underline-offset-4 hover:opacity-70"
              >
                Reviews
              </Link>{" "}
              [[page]].
            </p>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
