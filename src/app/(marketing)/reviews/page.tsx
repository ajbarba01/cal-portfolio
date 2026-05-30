/**
 * Reviews page — published reviews list + submission form.
 * Server component.
 */

import { createClient } from "@/lib/supabase/server";
import { listPublishedReviews } from "@/features/reviews/reviews-repo";
import { ReviewForm } from "./_components/review-form";
import type { PublishedReview } from "@/features/reviews/reviews-repo";

function StarRating({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} role="img">
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

function ReviewCard({ review }: { review: PublishedReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="bg-card text-card-foreground border-border rounded-lg border p-6">
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-foreground font-semibold">{review.author_name}</p>
          <p className="text-muted-foreground text-sm">{date}</p>
        </div>
        <p className="text-foreground shrink-0 text-base">
          <StarRating rating={review.rating} />
        </p>
      </header>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {review.body}
      </p>
    </article>
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
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Reviews
        </h1>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          What clients say about working with Cal.
        </p>
      </header>

      {/* Published reviews */}
      <section aria-labelledby="reviews-list-heading" className="mb-14">
        <h2 id="reviews-list-heading" className="sr-only">
          Published reviews
        </h2>

        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No reviews yet — be the first to share your experience!
          </p>
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

      {/* Submit a review */}
      <section aria-labelledby="submit-review-heading">
        <h2
          id="submit-review-heading"
          className="text-foreground mb-4 text-xl font-semibold"
        >
          Leave a review
        </h2>
        <ReviewForm isSignedIn={user !== null} />
      </section>
    </div>
  );
}
