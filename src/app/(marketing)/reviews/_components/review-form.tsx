"use client";

/**
 * Client-side review submission form.
 * Submission requires auth — submitReview returns { ok: false } for anon.
 */

import { useState, useTransition } from "react";
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
      <p className="text-muted-foreground text-sm">
        <a
          href="/login"
          className="text-foreground underline underline-offset-4 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in
        </a>{" "}
        to leave a review.
      </p>
    );
  }

  if (submitted) {
    return (
      <p role="status" className="text-foreground text-sm leading-relaxed">
        Thank you for your review! It&apos;s been submitted and will appear
        after moderation.
      </p>
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-rating">Rating</Label>
        <select
          id="review-rating"
          name="rating"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="bg-background text-foreground border-border w-32 rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <option value="5">★★★★★ (5)</option>
          <option value="4">★★★★☆ (4)</option>
          <option value="3">★★★☆☆ (3)</option>
          <option value="2">★★☆☆☆ (2)</option>
          <option value="1">★☆☆☆☆ (1)</option>
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
  );
}
