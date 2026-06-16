/**
 * Reviews — published reviews + submission form, read column.
 * Server component.
 */
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { EmptyState } from "@/components/feedback/empty-state";
import { createStaticClient } from "@/lib/supabase/static";
import { listPublishedReviews, type PublishedReview } from "@/features/reviews";
import { ReviewForm, StarRating } from "./_components/review-form";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { MarketingCopy } from "@/components/marketing/marketing-copy";
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildReviewsJsonLd,
  JsonLd,
} from "@/features/seo";

function ReviewCard({ review }: { review: PublishedReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <ShimmerCard className="flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-foreground font-semibold">
            {review.author_name}
          </p>
          <p className="text-muted-foreground text-sm">{date}</p>
        </div>
        <div className="shrink-0">
          <StarRating rating={review.rating} />
        </div>
      </header>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {review.body}
      </p>
    </ShimmerCard>
  );
}

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

        <RevealGroup
          as="section"
          aria-labelledby="reviews-list-heading"
          className="mb-12"
        >
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
            <ul className="flex flex-col gap-4" role="list">
              {reviews.map((review) => (
                <Reveal as="li" key={review.id}>
                  <ReviewCard review={review} />
                </Reveal>
              ))}
            </ul>
          )}
        </RevealGroup>

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
