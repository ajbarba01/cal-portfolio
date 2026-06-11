"use client";
import * as React from "react";
import { ArrowUp } from "lucide-react";

/**
 * Return-to-top affordance for long pages. Hidden until scrolled past
 * `threshold`; bottom-right; respects reduced motion. Applied per-page in SP6.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setShown(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!shown) return null;
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
      className="bg-card text-foreground border-border hover:bg-muted fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex size-11 items-center justify-center rounded-full border shadow-lg"
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
