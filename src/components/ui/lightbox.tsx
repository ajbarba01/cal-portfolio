"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { stepIndex } from "./lightbox-nav";

export type LightboxImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Tiny base64 blur for next/image placeholder (from image-placeholders.json). */
  blurDataURL?: string;
};

/**
 * Accessible image lightbox over base-ui Dialog. `index === null` is closed.
 * Keyboard: Esc closes (base-ui), ArrowLeft/Right step. Touch: horizontal
 * swipe steps. Click-out closes (backdrop). Index state lives in the parent;
 * this component never uses an effect to set state (eslint: no set-state-in-effect).
 */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : null;
  const touchStartX = React.useRef<number | null>(null);

  function step(delta: number) {
    if (index === null) return;
    if (images.length <= 1) return;
    onIndexChange(stepIndex(index, delta, images.length));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#1c1813]/92 backdrop-blur-[2px]" />
        <Dialog.Popup
          data-slot="lightbox"
          aria-label="Photo viewer"
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            touchStartX.current = null;
          }}
          onClick={(e) => {
            // Click on the empty area (not the image or a control) closes.
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 outline-none select-none sm:p-10"
        >
          <Dialog.Close
            aria-label="Close"
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </Dialog.Close>

          {current ? (
            <>
              <Image
                key={current.src}
                src={current.src}
                alt={current.alt}
                width={current.width}
                height={current.height}
                quality={68}
                sizes="(min-width: 1024px) 90vw, 100vw"
                className="max-h-[82vh] w-auto max-w-[92vw] rounded-sm object-contain shadow-2xl"
              />
              <p className="mt-4 text-xs tracking-[0.14em] text-white/60">
                {String((index ?? 0) + 1).padStart(2, "0")} / {images.length}
              </p>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => step(-1)}
                    className="absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => step(1)}
                    className="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
