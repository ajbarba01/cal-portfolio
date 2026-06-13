/**
 * Gallery — real-photo masonry with lightbox. Server component reads the
 * photo set + intrinsic dimensions; the client grid owns the lightbox.
 */
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { getGalleryImages } from "@/features/gallery";
import { EmptyState } from "@/components/feedback/empty-state";
import { GalleryGrid } from "./_components/gallery-grid";
import { MarketingCopy } from "@/components/marketing/marketing-copy";

export default async function GalleryPage() {
  const images = await getGalleryImages();

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <RevealGroup className="mb-8">
        <Reveal>
          <Eyebrow>
            <MarketingCopy id="gallery.eyebrow" />
          </Eyebrow>
        </Reveal>
        <Reveal
          as="h1"
          className="font-heading mt-2 text-4xl font-semibold tracking-tight"
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
        <Reveal>
          <GalleryGrid images={images} />
        </Reveal>
      )}
    </PageContainer>
  );
}
