import * as React from "react";

import { Eyebrow } from "@/components/marketing/eyebrow";
import { cn } from "@/lib/utils";

/**
 * The marketing heading scale — one class string per step. Exported so a
 * heading that cannot use {@link SectionHeader} (typically one that must itself
 * be the animated `Reveal` element) still renders on the scale instead of a
 * hand-rolled copy of it. `display` is the page masthead; `h1`–`h3` descend
 * from it. The step is a *size*, not a level: pick the level for the document
 * outline and the step for the visual weight.
 */
export const headingClass = {
  display: "font-heading text-4xl font-bold tracking-tight sm:text-5xl",
  h1: "font-heading text-3xl leading-tight font-semibold tracking-tight sm:text-4xl",
  h2: "font-heading text-2xl font-semibold tracking-tight sm:text-3xl",
  h3: "font-heading text-xl leading-tight font-semibold tracking-tight",
} as const;

export type HeadingSize = keyof typeof headingClass;

/**
 * SectionHeader — the one editorial header cluster (optional eyebrow + heading +
 * optional description) used to introduce a page section, replacing ad-hoc
 * eyebrow/`<h2>` pairs. Reuses {@link Eyebrow}. `as` picks the heading level for
 * the document outline; `size` picks the {@link headingClass} step and defaults
 * to the matching one, so a section that must stay an `<h2>` can still carry
 * another step's weight without hand-rolling the classes.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  as: Heading = "h2",
  size = Heading,
  align = "left",
  id,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: HeadingSize;
  align?: "left" | "center";
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading id={id} className={headingClass[size]}>
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
