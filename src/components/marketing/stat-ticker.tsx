import * as React from "react";
import Image from "next/image";
import { Star } from "lucide-react";

import { StatTickerTrack } from "./stat-ticker-track";

/**
 * Continuous horizontal stat ribbon (LED sports-panel style) for marketing pages.
 * The track renders the item set twice (each set doubled so one group always
 * exceeds the sheet width) so the rightward marquee loops seamlessly; the CSS in
 * `globals.css` (`.stat-ticker-track`) drives the motion and freezes it for
 * reduced-motion users. The first group is read by screen readers; the looping
 * duplicate is `aria-hidden`. Items render server-side; a thin client island
 * (`<StatTickerTrack>`) eases the marquee to a halt on hover. Full-bleed within
 * the marketing sheet; authored mobile-first.
 */
export type StatTickerItem =
  | { kind: "stat"; value: string; label: string }
  | { kind: "badge"; value: string; label: string }
  | {
      kind: "logo";
      src: string;
      alt: string;
      width: number;
      height: number;
      label: string;
    };

function ItemBody({ item }: { item: StatTickerItem }) {
  if (item.kind === "logo") {
    return (
      <>
        {/* A white plaque keeps the black/gold college wordmark legible on the
            toned ribbon in both light and dark themes. */}
        <span className="flex items-center rounded-md bg-white px-3 py-2 ring-1 ring-black/5">
          <Image
            src={item.src}
            alt={item.alt}
            width={item.width}
            height={item.height}
            unoptimized
            className="h-7 w-auto sm:h-8"
          />
        </span>
        <span className="text-muted-foreground text-[11px] font-medium tracking-[0.09em] uppercase">
          {item.label}
        </span>
      </>
    );
  }

  if (item.kind === "badge") {
    return (
      <>
        <span
          aria-hidden="true"
          className="bg-brand text-brand-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <Star className="size-4.5" strokeWidth={0} fill="currentColor" />
        </span>
        <span className="flex flex-col">
          <span className="font-heading text-brand-strong text-xl leading-none font-semibold sm:text-2xl">
            {item.value}
          </span>
          <span className="text-muted-foreground mt-1 text-[11px] font-medium tracking-[0.09em] uppercase">
            {item.label}
          </span>
        </span>
      </>
    );
  }

  return (
    <span className="flex flex-col">
      <span className="font-heading text-brand-strong text-2xl leading-none font-semibold sm:text-[1.7rem]">
        {item.value}
      </span>
      <span className="text-muted-foreground mt-1.5 text-[11px] font-medium tracking-[0.09em] uppercase">
        {item.label}
      </span>
    </span>
  );
}

export function StatTicker({
  items,
  label,
}: {
  items: StatTickerItem[];
  label: string;
}) {
  // Double the set so a single group is wider than the sheet — guarantees the
  // -50%→0 translate never exposes a gap at the rail.
  const groupItems = [...items, ...items];

  const group = (hidden: boolean) => (
    <ul role="list" aria-hidden={hidden || undefined} className="flex shrink-0">
      {groupItems.map((item, i) => (
        <li
          key={i}
          className="border-border/60 flex shrink-0 items-center gap-3 border-r px-7 py-5 whitespace-nowrap sm:px-9 sm:py-6"
        >
          <ItemBody item={item} />
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label={label}
      className="bg-card border-border relative overflow-hidden border-y"
    >
      <div
        aria-hidden="true"
        className="from-card pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r to-transparent sm:w-16"
      />
      <div
        aria-hidden="true"
        className="from-card pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l to-transparent sm:w-16"
      />
      <StatTickerTrack>
        {group(false)}
        {group(true)}
      </StatTickerTrack>
    </section>
  );
}
