import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * TextLink — the single inline textual link / CTA. Clay text, underline on
 * hover/focus, visible focus ring. Wraps `next/link`, so it prefetches and
 * accepts any Link prop; use it instead of hand-styling `text-brand-strong
 * hover:underline` per site.
 */
export function TextLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      data-slot="text-link"
      className={cn(
        "text-brand-strong focus-visible:ring-ring rounded-sm font-medium underline-offset-2 transition-colors hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
