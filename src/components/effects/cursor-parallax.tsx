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
 *
 * On window exit the drift eases back to rest (center); on re-entry it eases
 * from there to the cursor. Both transitions are the CSS easing on the consuming
 * elements — there's no snap, since starting from center keeps the glide short.
 */
export function CursorParallax() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    let frame = 0;

    const clamp = (n: number) => Math.max(-1, Math.min(1, n));

    const onMove = (e: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty(
          "--cursor-x",
          clamp(e.clientX / (window.innerWidth / 2) - 1).toFixed(4),
        );
        root.style.setProperty(
          "--cursor-y",
          clamp(e.clientY / (window.innerHeight / 2) - 1).toFixed(4),
        );
      });
    };

    // Ease the drift back to rest (center) when the pointer leaves the window so
    // the background + hero don't sit frozen off-center.
    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      root.style.setProperty("--cursor-x", "0");
      root.style.setProperty("--cursor-y", "0");
    };

    // mouseout with a null relatedTarget fires reliably whenever the pointer
    // leaves the window (mouseleave can be skipped on fast exits); blur covers
    // alt-tab / focus loss.
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget) onLeave();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
