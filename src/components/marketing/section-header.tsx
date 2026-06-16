import * as React from "react";

import { Eyebrow } from "@/components/marketing/eyebrow";
import { cn } from "@/lib/utils";

const HEADING_SIZES = {
  h1: "font-heading text-3xl font-semibold tracking-tight sm:text-4xl",
  h2: "font-heading text-2xl font-semibold tracking-tight sm:text-3xl",
  h3: "font-heading text-xl leading-tight font-semibold tracking-tight",
} as const;

/**
 * SectionHeader — the one editorial header cluster (optional eyebrow + heading +
 * optional description) used to introduce a page section, replacing ad-hoc
 * eyebrow/`<h2>` pairs. Reuses {@link Eyebrow}. Pick the heading level with `as`
 * (drives both the tag and the size step) so headings stay on the type scale.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  as = "h2",
  align = "left",
  id,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  as?: keyof typeof HEADING_SIZES;
  align?: "left" | "center";
  id?: string;
  className?: string;
}) {
  const Heading = as;
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading id={id} className={HEADING_SIZES[as]}>
        {title}
      </Heading>
      {description ? (
        <p className="text-muted-foreground max-w-[65ch] leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
  );
}
