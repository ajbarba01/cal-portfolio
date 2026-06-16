import * as React from "react";

import { Surface } from "@/components/ui/surface";

/**
 * ShimmerCard — the canonical marketing card surface.
 *
 * Now a thin alias of {@link Surface} `variant="emphasis"` (the clay shimmer
 * ring). Kept as a named export so the many existing call sites keep working
 * while the codebase migrates to `<Surface variant="emphasis">` directly; new
 * code should prefer Surface. Output is identical to the previous hand-rolled
 * version (same `bg-card`/`border`/`rounded-card`, baked-in {@link CardShimmer},
 * optional `hoverLift` drop-shadow).
 *
 * Callers own padding and inner layout via `className`.
 */
export function ShimmerCard({
  hoverLift = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Fade a soft clay drop-shadow in on hover (the individual service cards). */
  hoverLift?: boolean;
}) {
  return (
    <Surface
      variant="emphasis"
      hoverLift={hoverLift}
      className={className}
      {...props}
    >
      {children}
    </Surface>
  );
}
