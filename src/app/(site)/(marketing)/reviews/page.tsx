/**
 * Reviews — published reviews + submission form, read column.
 * Server component.
 */
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { EmptyState } from "@/components/feedback/empty-state";
import { createStaticClient } from "@/lib/supabase/static";
import { listPublishedReviews } from "@/features/reviews";
import { ReviewForm } from "./_components/review-form";
import { ReviewsList } from "./_components/reviews-list";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildReviewsJsonLd,
  JsonLd,
} from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Reviews",
  description:
    "What Front Range clients say about Cal Barba's dog walking and house sitting.",
  path: "/reviews",
});

// Static with daily ISR; new/moderated reviews reflect immediately via
// revalidatePath("/reviews") in submitReview / moderateReview. The "leave a
// review" control resolves auth browser-side inside ReviewForm, so this page
// reads no cookies.
export const revalidate = 86400;

export default async function ReviewsPage() {
  const reviews = await listPublishedReviews(createStaticClient());
  const reviewsLd = buildReviewsJsonLd(reviews);

  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Reviews", path: "/reviews" },
        ])}
      />
      {reviewsLd ? <JsonLd data={reviewsLd} /> : null}
      <PageContainer width="read" className="py-12 sm:py-16">
        <Reveal>
          <PageHeader
            title="Reviews"
            subtitle={<MarketingCopy id="reviews.purpose" />}
          />
        </Reveal>

        <section aria-labelledby="reviews-list-heading" className="mb-12">
          <h2 id="reviews-list-heading" className="sr-only">
            Published reviews
          </h2>
          {reviews.length === 0 ? (
            <Reveal>
              <EmptyState
                title="No reviews yet"
                message="Be the first to share your experience."
              />
            </Reveal>
          ) : (
            <ReviewsList reviews={reviews} />
          )}
        </section>

        <RevealGroup as="section" aria-labelledby="submit-review-heading">
          <Reveal
            as="h2"
            id="submit-review-heading"
            className="font-heading mb-4 text-xl font-semibold"
          >
            Leave a review
          </Reveal>
          <Reveal>
            <ReviewForm />
          </Reveal>
        </RevealGroup>
      </PageContainer>
    </>
  );
}
