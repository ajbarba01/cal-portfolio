"use client";

/**
 * Client-side review submission form.
 * Submission requires auth — submitReview returns { ok: false } for anon.
 */

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { TextLink } from "@/components/ui/text-link";
import { Textarea } from "@/components/ui/textarea";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { createClient } from "@/lib/supabase/client";
import { submitReview } from "@/features/reviews";

export function ReviewForm() {
  // Auth resolves browser-side so this page (and /reviews) can render statically.
  // null = unresolved; render nothing until known to avoid a wrong-state flash.
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    // getSession() is the local cookie read (no network on HS256).
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsSignedIn(data.session !== null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setIsSignedIn(session !== null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isSignedIn === null) {
    // Unresolved — reserve the card height so the layout doesn't jump.
    return <ShimmerCard aria-hidden="true" className="p-6 sm:p-8" />;
  }

  if (!isSignedIn) {
    return (
      <ShimmerCard className="p-6 sm:p-8">
        <p className="text-muted-foreground text-sm">
          <TextLink href="/login">Sign in</TextLink> to leave a review.
        </p>
      </ShimmerCard>
    );
  }

  if (submitted) {
    return (
      <ShimmerCard className="p-6 sm:p-8">
        <p role="status" className="text-foreground text-sm leading-relaxed">
          Thanks — your review is live!
        </p>
      </ShimmerCard>
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
    <ShimmerCard className="p-6 sm:p-8">
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

        <FormField
          label="Your review"
          name="body"
          hint={<span className="block text-right">{body.length} / 2000</span>}
        >
          <Textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            maxLength={2000}
            placeholder="Tell us about your experience…"
          />
        </FormField>

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
    </ShimmerCard>
  );
}

const SHARP_STAR_PATH =
  "M12 2.5 14.9 9.1 22 9.6 16.6 14.3 18.3 21.2 12 17.5 5.7 21.2 7.4 14.3 2 9.6 9.1 9.1 Z";

/**
 * Sharp-pointed star icon (miter joins, no rounded vertices).
 * Fill + body stroke are driven via Tailwind `fill-*` / `stroke-*` on `className`.
 *
 * `outlineClassName` draws a TRUE outside outline: SVG strokes are centered on
 * the path (no `stroke-alignment: outside` exists), so the outline is a second,
 * slightly-enlarged star painted *behind* the body. The body fill then masks its
 * inner area, leaving the outline tracing the star's outer edge.
 */
function SharpStar({
  className,
  outlineClassName,
}: {
  className?: string;
  outlineClassName?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="miter"
      // overflow-visible so the enlarged outline isn't clipped at the box edge.
      className={`overflow-visible ${className ?? ""}`}
    >
      {outlineClassName ? (
        <path
          d={SHARP_STAR_PATH}
          fill="none"
          // Scale ~18% about the star's center so every edge sits outside the body.
          transform="translate(12 12) scale(1.18) translate(-12 -12)"
          className={outlineClassName}
        />
      ) : null}
      <path d={SHARP_STAR_PATH} />
    </svg>
  );
}

/**
 * Accessible interactive star rating input.
 * Radio-group semantics: arrow keys move selection, each star is a radio.
 * Two independent dimensions: solid fill = committed rating (the clicked
 * value); a brand-colored outline = hover/focus preview of the run under the
 * cursor. Hovering never disturbs the fill, so the selection stays readable
 * while previewing a different value.
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

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="inline-flex items-center gap-1.5"
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        // Fill tracks the committed value only — independent of hover.
        const filled = starValue <= value;
        // Outline tracks the hover/focus run only.
        const previewed = hover !== null && starValue <= hover;
        const fillClass = filled ? "fill-brand-strong" : "fill-none";
        // Body stroke matches the fill state; the hover preview is layered on
        // top as a separate OUTSIDE outline (see SharpStar's outlineClassName),
        // so it never disturbs the committed fill.
        const bodyStrokeClass = filled
          ? "stroke-brand-strong"
          : "stroke-muted-foreground";
        return (
          <button
            key={starValue}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={`${starValue} ${starValue === 1 ? "star" : "stars"}`}
            tabIndex={value === starValue ? 0 : -1}
            onClick={() => onChange(starValue)}
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
            className="rounded-sm p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <SharpStar
              className={`size-7 ${fillClass} ${bodyStrokeClass}`}
              outlineClassName={
                previewed ? "stroke-rating-preview [stroke-width:1]" : undefined
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
          className={
            i < rating
              ? "fill-brand-strong stroke-brand-strong size-4"
              : "stroke-muted-foreground size-4 fill-none"
          }
        />
      ))}
    </span>
  );
}
