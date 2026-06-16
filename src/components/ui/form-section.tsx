"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Surface, type SurfaceVariant } from "@/components/ui/surface";
import { Eyebrow } from "@/components/marketing/eyebrow";

/**
 * FormSection — a titled group of fields. Replaces native `<fieldset>`/`<legend>`,
 * which render a notched border + offset legend that misaligns with the Surface
 * shimmer ring. Instead this is a {@link Surface} (default `emphasis` → an outer,
 * shimmering form card) titled by an {@link Eyebrow}, grouped for assistive tech
 * via `role="group"` + `aria-labelledby` so the ring stays flush.
 *
 * Multi-section forms stack several FormSections (each its own emphasis card).
 * Pass `variant="plain"` for a group nested inside another card (e.g. a step
 * shell) so rings never nest.
 */
export function FormSection({
  title,
  description,
  variant = "emphasis",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Surface>, "variant"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  variant?: SurfaceVariant;
}) {
  const id = React.useId();

  return (
    <Surface
      as="section"
      variant={variant}
      role="group"
      aria-labelledby={id}
      className={cn("flex flex-col gap-4 p-6", className)}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow id={id}>{title}</Eyebrow>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </Surface>
  );
}
