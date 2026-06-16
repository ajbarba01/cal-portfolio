import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { CardShimmer } from "@/components/effects/card-shimmer";
import { cn } from "@/lib/utils";

/**
 * Surface — the one card primitive. `variant` encodes *intent*, not styling, so
 * a caller picks meaning and the system owns the look:
 *
 * - `plain` — a flat content/data container (admin rows, fieldsets, list items).
 * - `interactive` — a clickable surface: carries the clay shimmer ring AND a
 *   border + tint hover (no drop-shadow, per the house style).
 * - `emphasis` — carries the clay shimmer ring; reserved for surfaces that
 *   **contain user input** or **emphasize an important** region (the contract
 *   formerly only honored by ShimmerCard, now enforceable).
 *
 * `interactive` and `emphasis` both render the {@link CardShimmer} outline; only
 * `interactive` adds the clickable hover affordance. One radius (`rounded-card`)
 * comes from the design tokens, killing the old rounded-xl/2xl split. Callers own
 * padding + inner layout via `className`.
 */
const surfaceVariants = cva(
  "bg-card text-card-foreground border-border rounded-card border",
  {
    variants: {
      variant: {
        plain: "",
        // `relative` + `group` give the baked-in shimmer a positioned parent and
        // let inner elements react to hover.
        interactive:
          "group relative hover:border-brand/40 hover:bg-muted/40 transition-colors",
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
  as: Comp = "div",
  variant = "plain",
  hoverLift = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    /** Render as a different element (e.g. `"fieldset"`, `"li"`, `"section"`) while keeping the surface styling + shimmer. */
    as?: React.ElementType;
    /** Fade a soft clay drop-shadow in on hover (independent of `variant`). */
    hoverLift?: boolean;
  }) {
  return (
    <Comp
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
      {variant === "emphasis" || variant === "interactive" ? (
        <CardShimmer />
      ) : null}
      {children}
    </Comp>
  );
}
