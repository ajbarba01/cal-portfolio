"use client";

/**
 * Client-side published-reviews list: rating filter + numbered pagination.
 * Fed the full server-fetched review set; does no IO of its own, so /reviews
 * stays static. Mirrors the admin reviews bar (Multiswitch + ResultCount +
 * Pagination) for a consistent filter idiom across the app.
 */

import { useMemo, useState } from "react";
import { Star, PawPrint, ExternalLink } from "lucide-react";

import {
  Multiswitch,
  type MultiswitchOption,
} from "@/components/ui/multiswitch";
import { Pagination } from "@/components/ui/pagination";
import { ResultCount } from "@/components/ui/result-count";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { TextLink } from "@/components/ui/text-link";
import { paginate } from "@/lib/pagination";
import type { PublishedReview } from "@/features/reviews";
import { ROVER_PROFILE_URL } from "@/content/rover-reviews";
import { StarRating } from "./review-form";

const PAGE_SIZE = 6;

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";

// The acknowledgement band carries the only color cue for an imported review:
// a soft-green strip (the theme's status-available green, on-palette, no foreign
// brand color) full-bleeding to the card edges along the bottom. Theme-aware —
// mixes into the dark card on dark mode.
const ROVER_BAND =
  "bg-[color-mix(in_oklab,var(--status-available)_38%,var(--card))]";

/** Attribution footer for an imported Rover review: source line + the one link. */
function RoverAttribution() {
  return (
    <footer
      className={`rounded-b-card border-border/60 -mx-5 mt-1 -mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-5 py-3 ${ROVER_BAND}`}
    >
      <span className="text-foreground inline-flex items-center gap-1.5 text-xs font-medium">
        <PawPrint aria-hidden="true" className="size-3.5" />
        Originally reviewed on Rover
      </span>
      <TextLink
        href={ROVER_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs"
      >
        View on Rover
        <ExternalLink aria-hidden="true" className="size-3" />
      </TextLink>
    </footer>
  );
}

function ReviewCard({ review }: { review: PublishedReview }) {
  const isRover = review.source === "rover";
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
      {isRover ? <RoverAttribution /> : null}
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
          {view.items.map((review) => (
            // Render instantly — no mount fade — on first load and page switch.
            <li key={review.id}>
              <ReviewCard review={review} />
            </li>
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
