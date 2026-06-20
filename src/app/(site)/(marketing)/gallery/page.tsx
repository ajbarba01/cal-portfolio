/**
 * Gallery — real-photo masonry with lightbox. Server component reads the
 * photo set + intrinsic dimensions; the client grid owns the lightbox.
 */
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { getGalleryImages } from "@/features/gallery";
import { EmptyState } from "@/components/feedback/empty-state";
import { GalleryGrid } from "./_components/gallery-grid";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { BackToTop } from "@/components/ui/back-to-top";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  JsonLd,
} from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Gallery",
  description:
    "Photos from walks, sits, and Colorado adventures with the dogs in Cal Barba's care.",
  path: "/gallery",
});

export default async function GalleryPage() {
  const images = await getGalleryImages();

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Gallery", path: "/gallery" },
        ])}
      />
      <PageContainer width="app" className="py-12 sm:py-16">
        <RevealGroup className="mb-8">
          <Reveal
            as="h1"
            className="font-heading mt-2 text-4xl font-bold tracking-tight"
          >
            Gallery
          </Reveal>
          <Reveal
            as="p"
            className="text-muted-foreground mt-2 max-w-[60ch] leading-relaxed"
          >
            <MarketingCopy id="gallery.body" />
          </Reveal>
        </RevealGroup>

        {images.length === 0 ? (
          <Reveal>
            <EmptyState
              title="Photos coming soon"
              message="Check back shortly."
            />
          </Reveal>
        ) : (
          <>
            {/* Meta row — frames the wall and gives a sense of scale. */}
            <Reveal className="border-border mb-5 flex items-baseline gap-2 border-b pb-3">
              <span className="font-heading text-foreground text-lg font-medium tabular-nums">
                {images.length}
              </span>
              <span className="text-muted-foreground text-sm">photos</span>
            </Reveal>
            <GalleryGrid images={images} />
          </>
        )}
        <BackToTop />
      </PageContainer>
    </>
  );
}
