/**
 * Reviews — published reviews + submission form, read column.
 * Server component.
 */
import { PageContainer } from "@/components/layout/page-container";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { EmptyState } from "@/components/feedback/empty-state";
import { createStaticClient } from "@/lib/supabase/static";
import { listPublishedReviews } from "@/features/reviews";
import { ReviewForm } from "./_components/review-form";
import { ReviewsList } from "./_components/reviews-list";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import { SectionHeader } from "@/components/marketing/section-header";
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
          {/* The masthead runs on the marketing display step, like /services,
              /gallery and /resources — PageHeader is the account/admin scale. */}
          <SectionHeader
            as="h1"
            size="display"
            title="Reviews"
            description={<MarketingCopy id="reviews.purpose" />}
            className="mb-8"
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
          <Reveal>
            <SectionHeader
              as="h2"
              size="h3"
              id="submit-review-heading"
              title="Leave a review"
              className="mb-4"
            />
          </Reveal>
          <Reveal>
            <ReviewForm />
          </Reveal>
        </RevealGroup>
      </PageContainer>
    </>
  );
}
