"use client";

import * as React from "react";

/**
 * Publishes the pointer position as two clamped CSS custom properties on
 * <html> — `--cursor-x` / `--cursor-y`, each in [-1, 1] measured against
 * half the viewport (screen center = 0, edges = ±1; past the edge it pins,
 * never reading "out of bounds"). Everything that drifts with the cursor —
 * the site-wide background texture, marketing hero photos — is pure CSS that
 * reads these vars, so this one listener drives the whole page and there is no
 * per-element JS. Renders nothing.
 *
 * Honors prefers-reduced-motion (no listener attached → vars stay at their 0
 * default). Inert on touch — pointermove with a coarse pointer never fires.
 */
export function CursorParallax() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    let frame = 0;
    // Set after the pointer leaves the window so the first move on re-entry snaps
    // to the new spot instead of easing across the whole range (phantom swoop).
    // Initialized true so the first move after mount snaps rather than gliding
    // from the rest position.
    let jump = true;

    const clamp = (n: number) => Math.max(-1, Math.min(1, n));

    const onMove = (e: PointerEvent) => {
      const instant = jump;
      jump = false;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (instant) root.setAttribute("data-cursor-instant", "");
        root.style.setProperty(
          "--cursor-x",
          clamp(e.clientX / (window.innerWidth / 2) - 1).toFixed(4),
        );
        root.style.setProperty(
          "--cursor-y",
          clamp(e.clientY / (window.innerHeight / 2) - 1).toFixed(4),
        );
        // Restore easing once the instant value has painted.
        if (instant) {
          requestAnimationFrame(() =>
            root.removeAttribute("data-cursor-instant"),
          );
        }
      });
    };

    // `mouseleave` on the document fires when the pointer exits the viewport.
    const onLeave = () => {
      jump = true;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-cursor-instant");
    };
  }, []);

  return null;
}
