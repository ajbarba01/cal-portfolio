import * as React from "react";

import { CardShimmer } from "@/components/effects/card-shimmer";
import { cn } from "@/lib/utils";

/**
 * ShimmerCard — the canonical marketing card surface.
 *
 * One source of truth for the outline treatment introduced by the home-page
 * trust cards: the semantic card surface (`bg-card` + `border-border` +
 * `rounded-2xl`) with a hover-revealed {@link CardShimmer} clay ring tracing the
 * edge. Every presentational marketing card (reviews, contact, services, the
 * booking step cards) renders this so the outline stays uniform — no bespoke
 * borders or shadows per card.
 *
 * Callers own padding and inner layout via `className`. `hoverLift` adds a soft
 * clay drop-shadow that fades in on hover (the individual service cards).
 *
 * The baked-in ring needs a positioned parent; this provides `relative`. `group`
 * is included so inner elements can react to hover (matching the trust cards).
 */
export function ShimmerCard({
  className,
  hoverLift = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Fade a soft clay drop-shadow in on hover (service cards). */
  hoverLift?: boolean;
}) {
  return (
    <div
      className={cn(
        "group bg-card text-card-foreground border-border relative rounded-2xl border",
        hoverLift &&
          "transition-shadow duration-300 ease-out hover:shadow-[0_12px_30px_-16px_rgba(60,40,20,0.45)]",
        className,
      )}
      {...props}
    >
      <CardShimmer />
      {children}
    </div>
  );
}
