import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { CardShimmer } from "@/components/effects/card-shimmer";
import { cn } from "@/lib/utils";

/**
 * Surface — the one card primitive. `variant` encodes whether the card is an
 * OUTER card or a nested one — the rule for the clay shimmer ring is structural:
 * **every outer card (one not nested inside another card) shimmers; nested cards
 * don't** (so only the outermost edge carries the signature).
 *
 * - `emphasis` — an **outer** card (not inside another card): the default choice
 *   for any top-level card. Carries the {@link CardShimmer} ring.
 * - `interactive` — an outer card that's also clickable: the shimmer ring AND a
 *   border + tint hover (no drop-shadow, per the house style).
 * - `plain` — a card **nested inside another card**, or a flat sub-section / data
 *   container. No shimmer.
 * - `floating` — a floating overlay (toast, dropdown menu): border + a sanctioned
 *   `shadow-elev-2` drop-shadow, **no shimmer**. The house no-shadow rule applies to
 *   page cards, not floating elements.
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
        // `relative` + `group` give the baked-in shimmer a positioned parent and
        // let inner elements react to hover.
        interactive:
          "group relative hover:border-brand/40 hover:bg-muted/40 transition-colors",
        emphasis: "group relative",
        // Floating overlays: sanctioned drop-shadow, no shimmer ring.
        floating: "shadow-elev-2",
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
    /** Button type, when rendered as `as="button"`. */
    type?: "button" | "submit" | "reset";
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
