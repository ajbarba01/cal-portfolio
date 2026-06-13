"use client";

/**
 * Client-side review submission form.
 * Submission requires auth — submitReview returns { ok: false } for anon.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/features/reviews";

interface ReviewFormProps {
  /** Pass false when the server knows the user is signed out — shows a sign-in prompt instead of the form. */
  isSignedIn: boolean;
}

export function ReviewForm({ isSignedIn }: ReviewFormProps) {
  const [rating, setRating] = useState<number>(5);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isSignedIn) {
    return (
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm sm:p-8">
        <p className="text-muted-foreground text-sm">
          <Link
            href="/login"
            className="text-brand-strong underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Sign in
          </Link>{" "}
          to leave a review.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-card border-border rounded-2xl border p-6 shadow-sm sm:p-8">
        <p role="status" className="text-foreground text-sm leading-relaxed">
          Thanks — your review is live!
        </p>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await submitReview({ rating, body });
      if (result.ok) {
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="bg-card border-border rounded-2xl border p-6 shadow-sm sm:p-8">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span id="review-rating-label" className="text-sm font-medium">
            Rating
          </span>
          <StarRatingInput
            value={rating}
            onChange={setRating}
            labelledBy="review-rating-label"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-body">Your review</Label>
          <Textarea
            id="review-body"
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            maxLength={2000}
            placeholder="Tell us about your experience…"
            className="bg-background"
          />
          <p className="text-muted-foreground text-right text-xs">
            {body.length} / 2000
          </p>
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div>
          <Button
            type="submit"
            variant="brand"
            disabled={isPending || body.trim().length === 0}
          >
            {isPending ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Sharp-pointed star icon (miter joins, no rounded vertices).
 * `filled` paints the body in the current text color; otherwise outline only.
 */
function SharpStar({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="miter"
      fill={filled ? "currentColor" : "none"}
      className={className}
    >
      <path d="M12 2.5 14.9 9.1 22 9.6 16.6 14.3 18.3 21.2 12 17.5 5.7 21.2 7.4 14.3 2 9.6 9.1 9.1 Z" />
    </svg>
  );
}

/**
 * Accessible interactive star rating input.
 * Radio-group semantics: arrow keys move selection, each star is a radio.
 * Committed rating shows as solid fill; hovering previews the run as outlines,
 * so the selected value stays distinct from what's merely under the cursor.
 */
function StarRatingInput({
  value,
  onChange,
  labelledBy,
}: {
  value: number;
  onChange: (rating: number) => void;
  labelledBy: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const previewing = hover !== null;
  const active = hover ?? value;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="inline-flex items-center gap-1.5"
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        const within = starValue <= active;
        // Direction A: solid = committed, outline = hover preview.
        const filled = within && !previewing;
        return (
          <button
            key={starValue}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue} ${starValue === 1 ? "star" : "stars"}`}
            tabIndex={value === starValue ? 0 : -1}
            onClick={() => {
              onChange(starValue);
              setHover(null);
            }}
            onMouseEnter={() => setHover(starValue)}
            onFocus={() => setHover(starValue)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                onChange(Math.min(5, value + 1));
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                onChange(Math.max(1, value - 1));
              }
            }}
            className="rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <SharpStar
              filled={filled}
              className={
                within
                  ? "text-brand-strong size-7"
                  : "text-muted-foreground size-7"
              }
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Accessible star rating display.
 * Icons are aria-hidden; the group carries the accessible label.
 */
export function StarRating({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} of 5 stars`}
      role="img"
      className="inline-flex items-center gap-0.5"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <SharpStar
          key={i}
          filled={i < rating}
          className={
            i < rating
              ? "text-brand-strong size-4"
              : "text-muted-foreground size-4"
          }
        />
      ))}
    </span>
  );
}
