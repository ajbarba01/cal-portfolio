/**
 * About page — hero + bio/approach/references in alternating section bands.
 * Server component.
 */
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { PageContainer } from "@/components/layout/page-container";

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
        <PageContainer width="read" className="py-12 sm:py-16">
          <Eyebrow>Background</Eyebrow>
          <h2
            id="bio-heading"
            className="font-heading mt-2 mb-3 text-xl font-semibold"
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
        <PageContainer width="read" className="py-12 sm:py-16">
          <Eyebrow>Philosophy</Eyebrow>
          <h2
            id="approach-heading"
            className="font-heading mt-2 mb-3 text-xl font-semibold"
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

      {/* References — section-alt band. Named-client list (about.references intro +
          about.references.1–8) is withheld from the site pending each client's
          permission to publish (2026-06-10). Copy stays in marketing.ts / cal-source.md;
          restore the intro + <ul> here once consent is granted. Placeholder for now. */}
      <section aria-labelledby="references-heading" className="bg-section-alt">
        <PageContainer width="read" className="py-12 sm:py-16">
          <Eyebrow>Testimonials</Eyebrow>
          <h2
            id="references-heading"
            className="font-heading mt-2 mb-3 text-xl font-semibold"
          >
            References
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            References from past clients are coming soon. In the meantime,
            please feel free to reach out and I&rsquo;ll gladly put you in
            touch.
          </p>
        </PageContainer>
      </section>
    </>
  );
}
