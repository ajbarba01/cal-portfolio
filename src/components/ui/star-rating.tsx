"use client";

import { useRef, useState } from "react";

import { focusRing } from "@/components/ui/control-variants";
import { plural } from "@/lib/plural";

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

/**
 * Accessible interactive star rating input.
 * Radio-group semantics: arrow keys move selection, each star is a radio.
 * Two independent dimensions: solid fill = committed rating (the clicked
 * value); a brand-colored outline = hover/focus preview of the run under the
 * cursor. Hovering never disturbs the fill, so the selection stays readable
 * while previewing a different value.
 *
 * Only the selected star is tabbable (the roving-tabindex the radiogroup role
 * promises), so an arrow key has to carry focus onto its new target as well as
 * move the selection — hence the refs map.
 */
export function StarRatingInput({
  value,
  onChange,
  labelledBy,
}: {
  value: number;
  onChange: (rating: number) => void;
  labelledBy: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const starRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  function select(next: number) {
    onChange(next);
    starRefs.current[next]?.focus();
  }

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
            ref={(el) => {
              starRefs.current[starValue] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === starValue}
            aria-label={plural(starValue, "star")}
            tabIndex={value === starValue ? 0 : -1}
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHover(starValue)}
            onFocus={() => setHover(starValue)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                select(Math.min(5, value + 1));
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                select(Math.max(1, value - 1));
              }
            }}
            className={`rounded-sm p-0.5 ${focusRing}`}
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
