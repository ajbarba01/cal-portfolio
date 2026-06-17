"use client";

/**
 * Client-side published-reviews list: rating filter + numbered pagination.
 * Fed the full server-fetched review set; does no IO of its own, so /reviews
 * stays static. Mirrors the admin reviews bar (Multiswitch + ResultCount +
 * Pagination) for a consistent filter idiom across the app.
 */

import { useMemo, useState } from "react";
import { Star } from "lucide-react";

import {
  Multiswitch,
  type MultiswitchOption,
} from "@/components/ui/multiswitch";
import { Pagination } from "@/components/ui/pagination";
import { ResultCount } from "@/components/ui/result-count";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { Reveal } from "@/components/effects/reveal";
import { paginate } from "@/lib/pagination";
import type { PublishedReview } from "@/features/reviews";
import { StarRating } from "./review-form";

const PAGE_SIZE = 6;

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";

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

export function ReviewsList({ reviews }: { reviews: PublishedReview[] }) {
  const [activeRating, setActiveRating] = useState<RatingFilter>("all");
  const [page, setPage] = useState(1);

  // Only surface rating segments that actually have reviews — no dead filters.
  const filterOptions = useMemo<MultiswitchOption<RatingFilter>[]>(() => {
    const present = new Set(reviews.map((r) => r.rating));
    const options: MultiswitchOption<RatingFilter>[] = [
      { value: "all", label: "All" },
    ];
    for (let rating = 5; rating >= 1; rating--) {
      if (present.has(rating)) {
        options.push({
          value: String(rating) as RatingFilter,
          label: String(rating),
          icon: Star,
        });
      }
    }
    return options;
  }, [reviews]);

  const filtered =
    activeRating === "all"
      ? reviews
      : reviews.filter((r) => r.rating === Number(activeRating));

  const view = paginate(filtered, page, PAGE_SIZE);

  function changeRating(next: RatingFilter) {
    setActiveRating(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar: rating multiswitch + reserved-width count. Search-free —
          a star filter is the standard one-tap control for a reviews wall. */}
      <div className="flex flex-wrap items-center gap-3">
        <Multiswitch
          options={filterOptions}
          value={activeRating}
          onValueChange={changeRating}
          ariaLabel="Filter reviews by rating"
        />
        <ResultCount count={filtered.length} noun="review" />
      </div>

      {view.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No reviews match that rating.
        </p>
      ) : (
        <ul className="flex flex-col gap-4" role="list">
          {view.items.map((review, i) => (
            // Standalone Reveal (not a group): the list changes per page, so each
            // card fades in on mount with a small source-order stagger.
            <Reveal as="li" key={review.id} delay={i * 40}>
              <ReviewCard review={review} />
            </Reveal>
          ))}
        </ul>
      )}

      <Pagination
        page={view.page}
        pageCount={view.pageCount}
        onPageChange={setPage}
      />
    </div>
  );
}
