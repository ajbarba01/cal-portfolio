/**
 * Reviews — published reviews + submission form, read column.
 * Server component.
 */
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { createClient } from "@/lib/supabase/server";
import { listPublishedReviews, type PublishedReview } from "@/features/reviews";
import { ReviewForm, StarRating } from "./_components/review-form";
import { MarketingCopy } from "@/components/marketing/marketing-copy";

function ReviewCard({ review }: { review: PublishedReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="bg-card border-border flex flex-col gap-4 rounded-xl border p-5">
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
    </div>
  );
}

export default async function ReviewsPage() {
  const supabase = await createClient();
  const [
    reviews,
    {
      data: { user },
    },
  ] = await Promise.all([
    listPublishedReviews(supabase),
    supabase.auth.getUser(),
  ]);

  return (
    <PageContainer width="read" className="py-12 sm:py-16">
      <PageHeader
        title="Reviews"
        subtitle={<MarketingCopy id="reviews.purpose" />}
      />

      <section aria-labelledby="reviews-list-heading" className="mb-12">
        <h2 id="reviews-list-heading" className="sr-only">
          Published reviews
        </h2>
        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            message="Be the first to share your experience."
          />
        ) : (
          <ul className="flex flex-col gap-4" role="list">
            {reviews.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="submit-review-heading">
        <h2
          id="submit-review-heading"
          className="font-heading mb-4 text-xl font-semibold"
        >
          Leave a review
        </h2>
        <ReviewForm isSignedIn={user !== null} />
      </section>
    </PageContainer>
  );
}
