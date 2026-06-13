"use client";

/**
 * Client-side review submission form.
 * Submission requires auth — submitReview returns { ok: false } for anon.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitReview } from "@/features/reviews";

interface ReviewFormProps {
  /** Pass false when the server knows the user is signed out — shows a sign-in prompt instead of the form. */
  isSignedIn: boolean;
}

export function ReviewForm({ isSignedIn }: ReviewFormProps) {
  const [rating, setRating] = useState<string>("5");
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

    const ratingNum = parseInt(rating, 10);

    startTransition(async () => {
      const result = await submitReview({ rating: ratingNum, body });
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
          <Label htmlFor="review-rating">Rating</Label>
          <select
            id="review-rating"
            name="rating"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="bg-background text-foreground border-border w-36 rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
          </select>
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
        <Star
          key={i}
          aria-hidden="true"
          className={
            i < rating
              ? "text-brand-strong size-4 fill-current"
              : "text-muted-foreground size-4"
          }
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}
