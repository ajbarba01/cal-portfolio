import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { CardShimmer } from "@/components/effects/card-shimmer";
import { cn } from "@/lib/utils";

/**
 * Surface — the one card primitive. `variant` encodes *intent*, not styling, so
 * a caller picks meaning and the system owns the look:
 *
 * - `plain` — a flat content/data container (admin rows, fieldsets, list items).
 * - `interactive` — a clickable surface; highlights on hover via border + tint
 *   (no drop-shadow, per the house style).
 * - `emphasis` — carries the clay shimmer ring; reserved for surfaces that
 *   **contain user input** or **emphasize an important** region (the contract
 *   formerly only honored by ShimmerCard, now enforceable).
 *
 * One radius (`rounded-card`) comes from the design tokens, killing the old
 * rounded-xl/2xl split. Callers own padding + inner layout via `className`.
 */
const surfaceVariants = cva(
  "bg-card text-card-foreground border-border rounded-card border",
  {
    variants: {
      variant: {
        plain: "",
        interactive:
          "group hover:border-brand/40 hover:bg-muted/40 transition-colors",
        // `relative` + `group` give the baked-in shimmer a positioned parent and
        // let inner elements react to hover.
        emphasis: "group relative",
      },
    },
    defaultVariants: { variant: "plain" },
  },
);

export type SurfaceVariant = NonNullable<
  VariantProps<typeof surfaceVariants>["variant"]
>;

export function Surface({
  variant = "plain",
  hoverLift = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    /** Fade a soft clay drop-shadow in on hover (independent of `variant`). */
    hoverLift?: boolean;
  }) {
  return (
    <div
      data-slot="surface"
      data-variant={variant}
      className={cn(
        surfaceVariants({ variant }),
        hoverLift &&
          "hover:shadow-elev-2 transition-shadow duration-300 ease-out",
        className,
      )}
      {...props}
    >
      {variant === "emphasis" ? <CardShimmer /> : null}
      {children}
    </div>
  );
}
