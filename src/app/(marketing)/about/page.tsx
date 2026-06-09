/**
 * About page — hero + bio/approach/references in alternating section bands.
 * Server component.
 */
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { PageContainer } from "@/components/layout/page-container";
import type { CopyId } from "@/content/marketing";

const references: readonly CopyId[] = [
  "about.references.1",
  "about.references.2",
  "about.references.3",
  "about.references.4",
  "about.references.5",
  "about.references.6",
  "about.references.7",
  "about.references.8",
];

export default function AboutPage() {
  return (
    <>
      <MarketingHero
        src="/bg/IMG_0048.JPG"
        eyebrow={<MarketingCopy id="about.eyebrow" />}
        title="Meet Cal"
        body={<MarketingCopy id="about.summary" />}
        aspect="aspect-[2/1] lg:aspect-[5/2]"
      />

      {/* Bio — section-alt band */}
      <section aria-labelledby="bio-heading" className="bg-section-alt">
        <PageContainer className="py-12 sm:py-16">
          <h2
            id="bio-heading"
            className="font-heading mb-3 text-xl font-semibold"
          >
            About Me
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
            <p>
              <MarketingCopy id="about.bio.p4" />
            </p>
          </div>
        </PageContainer>
      </section>

      {/* Approach — background band */}
      <section aria-labelledby="approach-heading" className="bg-background">
        <PageContainer className="py-12 sm:py-16">
          <h2
            id="approach-heading"
            className="font-heading mb-3 text-xl font-semibold"
          >
            My Approach
          </h2>
          <div className="text-muted-foreground flex flex-col gap-4 leading-relaxed">
            <p>
              <MarketingCopy id="about.approach.p1" />
            </p>
            <p>
              <MarketingCopy id="about.approach.p2" />
            </p>
          </div>
        </PageContainer>
      </section>

      {/* References — section-alt band. Contact details available on request,
          not published (privacy); the intro invites visitors to reach out. */}
      <section aria-labelledby="references-heading" className="bg-section-alt">
        <PageContainer className="py-12 sm:py-16">
          <h2
            id="references-heading"
            className="font-heading mb-3 text-xl font-semibold"
          >
            References
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            <MarketingCopy id="about.references" />
          </p>
          <ul className="text-foreground mt-4 flex flex-col gap-2 text-center leading-relaxed">
            {references.map((id) => (
              <li key={id}>
                <MarketingCopy id={id} />
              </li>
            ))}
          </ul>
        </PageContainer>
      </section>
    </>
  );
}
