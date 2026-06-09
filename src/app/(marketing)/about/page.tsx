/**
 * About page — hero + bio/approach/references in alternating section bands.
 * Server component.
 */
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { PageContainer } from "@/components/layout/page-container";
import { copy } from "@/content/marketing";

const approach = [
  {
    id: "a1",
    title: copy["about.approach.1.title"],
    detail: copy["about.approach.1.detail"],
  },
  {
    id: "a2",
    title: copy["about.approach.2.title"],
    detail: copy["about.approach.2.detail"],
  },
  {
    id: "a3",
    title: copy["about.approach.3.title"],
    detail: copy["about.approach.3.detail"],
  },
];

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_0048.JPG"
        eyebrow={copy["about.eyebrow"]}
        title="About"
        body={copy["about.summary"]}
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
              <p>{copy["about.bio.p1"]}</p>
              <p>{copy["about.bio.p2"]}</p>
              <p>{copy["about.bio.p3"]}</p>
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
              {copy["about.references.pre"]}{" "}
              <Link
                href="/reviews"
                className="text-brand-strong underline underline-offset-4 hover:opacity-70"
              >
                Reviews
              </Link>{" "}
              {copy["about.references.post"]}
            </p>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
