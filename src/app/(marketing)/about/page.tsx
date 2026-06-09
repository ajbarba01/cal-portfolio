/**
 * About page — hero + bio/approach/references in alternating section bands.
 * Server component.
 */
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { PageContainer } from "@/components/layout/page-container";

const approach = [
  {
    id: "a1",
    titleId: "about.approach.1.title",
    detailId: "about.approach.1.detail",
  },
  {
    id: "a2",
    titleId: "about.approach.2.title",
    detailId: "about.approach.2.detail",
  },
  {
    id: "a3",
    titleId: "about.approach.3.title",
    detailId: "about.approach.3.detail",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_0048.JPG"
        eyebrow={<MarketingCopy id="about.eyebrow" />}
        title="About"
        body={<MarketingCopy id="about.summary" />}
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
              <p>
                <MarketingCopy id="about.bio.p1" />
              </p>
              <p>
                <MarketingCopy id="about.bio.p2" />
              </p>
              <p>
                <MarketingCopy id="about.bio.p3" />
              </p>
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
                  <strong className="text-foreground">
                    <MarketingCopy id={a.titleId} />
                  </strong>{" "}
                  — <MarketingCopy id={a.detailId} />
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
              <MarketingCopy id="about.references" />
            </p>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
