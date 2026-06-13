"use client";

import * as React from "react";
import Image from "next/image";
import { BackToTop } from "@/components/ui/back-to-top";
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox";

export function GalleryGrid({ images }: { images: LightboxImage[] }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <>
      <ul
        className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4"
        role="list"
      >
        {images.map((img, i) => (
          <li key={img.src} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Open photo ${i + 1} of ${images.length}`}
              // Cut out of the site-wide cursor glow (mask), like hero photos.
              data-ring-exclude
              className="group focus-visible:ring-ring/50 block w-full overflow-hidden rounded-lg shadow-sm outline-none focus-visible:ring-3"
            >
              <Image
                src={img.src}
                alt={img.alt}
                width={img.width}
                height={img.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                loading="lazy"
                quality={70}
                className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
      <BackToTop />
    </>
  );
}
