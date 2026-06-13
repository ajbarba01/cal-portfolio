"use client";
import * as React from "react";
import { ArrowUp } from "lucide-react";

/**
 * Return-to-top affordance for long pages. Stays mounted and eases in/out as
 * the user crosses `threshold`, so the transition can actually run; hidden from
 * pointer + a11y tree while below it. Bottom-right; respects reduced motion.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    // rAF-throttle: one state update per frame at most, instead of a setState per
    // scroll event. The setState lives in the rAF callback (not the effect body),
    // so it doesn't trip react-hooks/set-state-in-effect.
    let frame = 0;
    const apply = () => {
      frame = 0;
      setShown(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };
    onScroll(); // initial check (schedules a frame; no synchronous setState)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return (
    <button
      type="button"
      data-slot="back-to-top"
      data-visible={shown}
      aria-label="Back to top"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
      className="bg-card text-foreground border-border hover:bg-muted fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-11 items-center justify-center rounded-full border shadow-lg transition-opacity duration-1000 ease-out data-[visible=false]:pointer-events-none data-[visible=false]:opacity-0 data-[visible=true]:opacity-100 motion-reduce:transition-none"
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  );
}
