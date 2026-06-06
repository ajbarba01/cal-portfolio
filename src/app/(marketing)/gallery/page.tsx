/**
 * Gallery — real-photo masonry with lightbox. Server component reads the
 * photo set + intrinsic dimensions; the client grid owns the lightbox.
 */
import { PageContainer } from "@/components/layout/page-container";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { getGalleryImages } from "@/features/gallery/gallery-images";
import { EmptyState } from "@/components/feedback/empty-state";
import { GalleryGrid } from "./_components/gallery-grid";

export default async function GalleryPage() {
  const images = await getGalleryImages();

  return (
    <PageContainer width="app" className="py-12 sm:py-16">
      <div className="mb-8">
        <Eyebrow>Out on the trail</Eyebrow>
        <h1 className="font-heading mt-2 text-4xl font-semibold tracking-tight">
          Gallery
        </h1>
        <p className="text-muted-foreground mt-2 max-w-[60ch] leading-relaxed">
          [[BODY: one line about the photos]]
        </p>
      </div>

      {images.length === 0 ? (
        <EmptyState title="Photos coming soon" message="Check back shortly." />
      ) : (
        <GalleryGrid images={images} />
      )}
    </PageContainer>
  );
}
