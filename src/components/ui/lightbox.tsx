"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { stepIndex } from "./lightbox-nav";

/**
 * The three round controls floating on the scrim. The focus ring is white, not
 * `--ring`: it has to read against a near-black backdrop, and the clay ring
 * disappears there. See the token exception on {@link Lightbox}.
 */
const control =
  // eslint-disable-next-line design-system/no-drift -- the fixed white on the near-black scrim is the token exception documented on Lightbox below
  "absolute flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

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
 * Keyboard: Esc closes (base-ui), ArrowLeft/Right step, and every control
 * carries its own name plus a visible focus ring. Touch: horizontal swipe
 * steps. Click-out closes (backdrop). Index state lives in the parent; this
 * component never uses an effect to set state (eslint: no set-state-in-effect).
 *
 * DELIBERATE TOKEN EXCEPTION: the scrim and the controls on it are fixed
 * near-black and white rather than semantic tokens. The lightbox is a viewing
 * chamber — its job is to be the same neutral dark surround in either theme so
 * the photograph, not the site palette, sets the color in view. Every other
 * surface in the app uses tokens; do not copy this file's colors elsewhere.
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
        {/* eslint-disable-next-line design-system/no-drift -- the fixed near-black scrim is the token exception documented above */}
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
            className={cn(control, "top-4 right-4")}
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
                // No elevation: the elevation tokens are warm browns, lighter
                // than this scrim, so a shadow here reads as a halo around the
                // photograph rather than a lift. The old shadow-2xl was black
                // on near-black and drew nothing either.
                className="max-h-[82vh] w-auto max-w-[92vw] rounded-sm object-contain"
              />
              {/* The only text that changes when a photo is stepped, so it is
                  the live region: arrow keys and swipes otherwise swap the
                  image silently. It mounts already populated, which screen
                  readers do not announce, so opening the lightbox stays quiet
                  and only later steps speak. */}
              <p
                aria-live="polite"
                aria-atomic="true"
                className="mt-4 text-xs tracking-[0.14em] text-white/60"
              >
                {String((index ?? 0) + 1).padStart(2, "0")} / {images.length}
              </p>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => step(-1)}
                    className={cn(
                      control,
                      "top-1/2 left-3 -translate-y-1/2 sm:left-6",
                    )}
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => step(1)}
                    className={cn(
                      control,
                      "top-1/2 right-3 -translate-y-1/2 sm:right-6",
                    )}
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
