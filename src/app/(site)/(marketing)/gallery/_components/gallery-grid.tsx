"use client";

import * as React from "react";
import Image from "next/image";
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox";
import { Reveal } from "@/components/effects/reveal";

export function GalleryGrid({ images }: { images: LightboxImage[] }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <>
      {/* Deliberately one observer per photo rather than a RevealGroup around
          the list: a group observes its own element, and this wall runs many
          viewports tall, so its intersection ratio can never reach the reveal
          threshold. Photo-by-photo is also the right cadence here — a wall this
          long should meet you as you scroll, not resolve all at once. */}
      <ul
        className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4"
        role="list"
      >
        {images.map((img, i) => (
          <Reveal as="li" key={img.src} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
              // Cut out of the site-wide cursor glow (mask), like hero photos.
              data-ring-exclude
              // Refined hover: a shadow-only "lift" (no movement, so the photo
              // never shifts out from under the cursor) + the site's clay
              // card-ring outline just outside the square edge. Focus keeps the
              // standard ring for keyboard users. Both depths come from the
              // elevation tokens (resting `elev-1`, lift `elev-2`).
              className="group focus-visible:ring-ring/50 hover:ring-brand/60 shadow-elev-1 hover:shadow-elev-2 relative block w-full overflow-hidden transition-shadow duration-300 outline-none hover:ring-1 focus-visible:ring-3"
            >
              <Image
                src={img.src}
                alt={img.alt}
                width={img.width}
                height={img.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                loading="lazy"
                quality={70}
                {...(img.blurDataURL
                  ? {
                      placeholder: "blur" as const,
                      blurDataURL: img.blurDataURL,
                    }
                  : {})}
                className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {/* Expand affordance — signals the photo opens in a lightbox. */}
              <span
                aria-hidden="true"
                className="bg-background/90 shadow-elev-1 pointer-events-none absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
              >
                <svg
                  viewBox="0 0 14 14"
                  fill="none"
                  className="stroke-foreground size-3"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                >
                  <path d="M1 1h3.5M1 1v3.5M13 1h-3.5M13 1v3.5M1 13h3.5M1 13v-3.5M13 13h-3.5M13 13v-3.5" />
                </svg>
              </span>
            </button>
          </Reveal>
        ))}
      </ul>

      <Lightbox
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
