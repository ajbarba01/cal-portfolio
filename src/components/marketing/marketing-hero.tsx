import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Reveal, RevealGroup } from "@/components/effects/reveal";
import { Eyebrow } from "./eyebrow";

/**
 * Shared marketing hero: a photo with copy overlaid on desktop and stacked
 * beneath on mobile (overlaying a short band is unreadable at phone width).
 * One `<h1>`; colors + position flip at the `sm` breakpoint. `aspect` tunes the
 * banner height (home = bold 3:2 default; secondary pages pass a flatter ratio).
 */
export function MarketingHero({
  src,
  blurDataURL,
  eyebrow,
  title,
  titleId = "hero-heading",
  body,
  actions,
  aspect = "aspect-[3/2]",
}: {
  src: string;
  /** Optional base64 blur (from image-placeholders.json) for placeholder="blur". */
  blurDataURL?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  aspect?: string;
}) {
  return (
    <section aria-labelledby={titleId} className="relative">
      {/* data-ring-exclude: the site-wide cursor glow is XOR-cut out of this
          photo, so the clay wash never washes over hero imagery. */}
      <div
        data-ring-exclude
        className={cn("relative isolate w-full overflow-hidden", aspect)}
      >
        <Image
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
          {...(blurDataURL
            ? { placeholder: "blur" as const, blurDataURL }
            : {})}
          className="object-cover"
        />
        <div className="from-foreground/70 via-foreground/30 absolute inset-0 hidden bg-gradient-to-r to-transparent sm:block" />
      </div>

      <div className="px-5 py-8 sm:absolute sm:inset-0 sm:flex sm:flex-col sm:justify-center sm:px-8 sm:py-0 lg:px-16">
        {/* Copy reveals (fades in, top-to-bottom); the photo + scrim are
            background, left static. */}
        <RevealGroup className="flex max-w-[42ch] flex-col items-start gap-5 sm:max-w-[60%]">
          {eyebrow ? (
            <Reveal>
              <Eyebrow className="sm:text-white">{eyebrow}</Eyebrow>
            </Reveal>
          ) : null}
          <Reveal
            as="h1"
            id={titleId}
            className="font-heading text-foreground max-w-[18ch] text-4xl leading-[1.04] font-semibold tracking-tight sm:text-5xl sm:text-white lg:text-6xl"
          >
            {title}
          </Reveal>
          {body ? (
            <Reveal
              as="p"
              className="text-muted-foreground max-w-[42ch] leading-relaxed sm:text-white/85"
            >
              {body}
            </Reveal>
          ) : null}
          {actions ? (
            <Reveal className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {actions}
            </Reveal>
          ) : null}
        </RevealGroup>
      </div>
    </section>
  );
}
