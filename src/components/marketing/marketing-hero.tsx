import * as React from "react";
import Image from "next/image";
import { Eyebrow } from "./eyebrow";

/**
 * Shared marketing hero: a 3:2 photo with copy overlaid on desktop and stacked
 * beneath on mobile (overlaying a short 3:2 band is unreadable at phone width).
 * One `<h1>`; colors + position flip at the `sm` breakpoint. Used by the home
 * and about pages so they read as a consistent front door.
 */
export function MarketingHero({
  src,
  eyebrow,
  title,
  titleId = "hero-heading",
  body,
  actions,
}: {
  src: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  body?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="relative">
      <div className="relative aspect-[3/2] w-full">
        <Image
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="from-foreground/70 via-foreground/30 absolute inset-0 hidden bg-gradient-to-r to-transparent sm:block" />
      </div>

      <div className="px-5 py-8 sm:absolute sm:inset-0 sm:flex sm:flex-col sm:justify-center sm:px-8 sm:py-0 lg:px-16">
        <div className="flex max-w-[42ch] flex-col items-start gap-5 sm:max-w-[60%]">
          {eyebrow ? (
            <Eyebrow className="sm:text-white">{eyebrow}</Eyebrow>
          ) : null}
          <h1
            id={titleId}
            className="font-heading text-foreground max-w-[18ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:text-5xl sm:text-white lg:text-6xl"
          >
            {title}
          </h1>
          {body ? (
            <p className="text-muted-foreground max-w-[42ch] leading-relaxed sm:text-white/85">
              {body}
            </p>
          ) : null}
          {actions ? (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
