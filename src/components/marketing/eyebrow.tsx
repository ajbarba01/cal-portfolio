import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Small uppercase clay label that sits above headings across marketing pages
 * (the "field journal" eyebrow). Defaults to brand-strong; pass `className` to
 * recolor (e.g. on the dark hero overlay).
 */
export function Eyebrow({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  /** Set when the eyebrow labels a region via `aria-labelledby` (e.g. FormSection). */
  id?: string;
}) {
  return (
    <p
      id={id}
      data-slot="eyebrow"
      className={cn(
        "text-brand-strong text-xs font-semibold tracking-[0.14em] uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
