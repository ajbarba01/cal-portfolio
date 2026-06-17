"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

export type ServicePhoto = {
  src: string;
  alt: string;
  /** Base64 blur from the gallery-sync pipeline (image-placeholders.json). */
  blurDataURL?: string;
};

/**
 * A three-up photo triptych for a service panel. Equal thirds on a grid at `sm`
 * and up; on narrow screens it becomes a peek-the-next scroll-snap row so each
 * photo stays large and swipeable rather than shrinking to a thumbnail, with
 * pagination dots below as the scroll affordance. Each photo zooms slightly on
 * hover (same treatment as the about-page portrait). The caller supplies
 * optimized, blur-backed sources; renders nothing when there are no photos.
 *
 * Client island: the dots track the active photo via an IntersectionObserver
 * (no scroll math) and are hidden on the static `sm+` grid.
 */
export function ServicePhotoStrip({
  photos,
  className,
}: {
  photos: readonly ServicePhoto[];
  className?: string;
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const items = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-photo-index]"),
    );
    if (items.length === 0) return;

    const ratios = new Array<number>(items.length).fill(0);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(
            (entry.target as HTMLElement).dataset.photoIndex,
          );
          ratios[index] = entry.intersectionRatio;
        }
        let max = 0;
        let next = 0;
        ratios.forEach((ratio, index) => {
          if (ratio > max) {
            max = ratio;
            next = index;
          }
        });
        setActive(next);
      },
      { root: scroller, threshold: [0.25, 0.5, 0.75, 1] },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [photos.length]);

  if (photos.length === 0) return null;

  const goTo = (index: number) => {
    const target = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-photo-index="${index}"]`,
    );
    if (!target) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  return (
    <div className={className}>
      <div
        ref={scrollerRef}
        className={cn(
          // Mobile: horizontal scroll-snap row, peeking the next photo. Hidden
          // scrollbar matches the service tab strip. sm+: equal-thirds grid.
          "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:pb-0",
        )}
      >
        {/* Mobile-only end spacers: give snap-center room to center the first
            and last photos too (not just the middle). display:none at sm+ so the
            grid sees only the three figures. */}
        <span aria-hidden className="shrink-0 basis-[11%] sm:hidden" />
        {photos.map((photo, index) => (
          <figure
            // data-ring-exclude: keep the cursor glow off imagery (as on the
            // hero / gallery / bio photo).
            data-ring-exclude
            data-photo-index={index}
            key={photo.src}
            className="bg-muted group relative aspect-4/5 w-[78%] shrink-0 snap-center overflow-hidden rounded-2xl sm:w-auto"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes="(min-width: 640px) 30vw, 78vw"
              placeholder={photo.blurDataURL ? "blur" : "empty"}
              blurDataURL={photo.blurDataURL}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
            />
          </figure>
        ))}
        <span aria-hidden className="shrink-0 basis-[11%] sm:hidden" />
      </div>

      {/* Pagination dots — scroll affordance, mobile only (sm+ shows all three). */}
      {photos.length > 1 ? (
        <div
          className="mt-3 flex justify-center gap-1 sm:hidden"
          aria-label="Photo navigation"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Go to photo ${index + 1} of ${photos.length}`}
              aria-current={index === active}
              className="grid place-items-center p-2"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-colors",
                  index === active ? "bg-brand" : "bg-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
