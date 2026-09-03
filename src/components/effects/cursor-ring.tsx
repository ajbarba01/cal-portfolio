"use client";

import * as React from "react";

/**
 * Falloff radius (px): a target this far from the pointer sits at rest, one
 * under it is full. Tuned against the header's 44px discs — wide enough that a
 * caret starts moving before the cursor arrives, tight enough that the whole
 * navbar doesn't warm up at once.
 */
const PROXIMITY_PX = 120;

/** Pointer parked outside any document, so every target reads as far away. */
const POINTER_AT_REST = -1e5;

/**
 * Proximity sweep over the header's interactive targets. Publishes `--u` in
 * [0, 1] on every `[data-spotlight-link]` from its distance to the pointer;
 * consumers read it in pure CSS — a nav tab scales its underline
 * (`nav-underline.ts`), and the account / sign-in disc swings its caret from 9
 * o'clock toward 6 (`account-menu.tsx`, `sign-in-link.tsx`).
 *
 * Decorative by construction: CSS defaults `--u` to 0 (1 on the active tab) and
 * hover/focus pin the same properties full, so keyboard, no-JS, touch and
 * reduced-motion users get the whole affordance without this component. It
 * renders nothing and honors prefers-reduced-motion by attaching no listeners.
 *
 * Perf: one rAF-coalesced pointermove writes a single custom property per
 * target and reads no layout — centers are cached and re-measured only when the
 * page scrolls, resizes, or the header's own subtree changes.
 */
export function CursorRing() {
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let pointerX = POINTER_AT_REST;
    let pointerY = POINTER_AT_REST;
    let moveFrame = 0;
    let measureFrame = 0;
    // Target centers in DOCUMENT space, cached so the per-move path never
    // touches the DOM. The header is sticky, so its links hold their viewport
    // position while the page scrolls — their document-space centers therefore
    // shift on every scroll frame and have to be re-measured there.
    let centers: { el: HTMLElement; cx: number; cy: number }[] = [];

    const measure = () => {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      centers = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-spotlight-link]",
      )) {
        const rect = el.getBoundingClientRect();
        centers.push({
          el,
          cx: rect.left + scrollX + rect.width / 2,
          cy: rect.top + scrollY + rect.height / 2,
        });
      }
    };

    const paint = () => {
      const x = pointerX + window.scrollX;
      const y = pointerY + window.scrollY;
      for (const { el, cx, cy } of centers) {
        // The active tab pins its underline full via `--u:1` in its class list.
        // Writing a distance here would relax it, because the active and
        // inactive tabs share one transform string and differ only in this
        // value.
        if (el.getAttribute("aria-current") === "page") {
          el.style.setProperty("--u", "1");
          continue;
        }
        const u = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / PROXIMITY_PX);
        el.style.setProperty("--u", u.toFixed(3));
      }
    };

    const onMoveFrame = () => {
      moveFrame = 0;
      paint();
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!moveFrame) moveFrame = requestAnimationFrame(onMoveFrame);
    };

    const onMeasureFrame = () => {
      measureFrame = 0;
      // Reads before writes: measure (layout read) then paint (style writes), so
      // one frame never forces a second layout flush.
      measure();
      paint();
    };

    const scheduleMeasure = () => {
      if (!measureFrame) measureFrame = requestAnimationFrame(onMeasureFrame);
    };

    const onLeave = () => {
      // Park the pointer outside the document and repaint, so the sweep relaxes
      // instead of sitting frozen wherever the cursor left the window.
      pointerX = POINTER_AT_REST;
      pointerY = POINTER_AT_REST;
      if (moveFrame) {
        cancelAnimationFrame(moveFrame);
        moveFrame = 0;
      }
      paint();
    };

    // mouseleave can be skipped on a fast exit or when the pointer leaves over a
    // child; mouseout with a null relatedTarget fires whenever it leaves the
    // window entirely. blur covers alt-tab and focus loss.
    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) onLeave();
    };

    measure();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("blur", onLeave);

    // The auth cluster resolves in the browser and mounts AFTER this effect, so
    // the mount-time measurement misses the account / sign-in disc and its caret
    // would never sweep. Watching the header's subtree re-measures the moment it
    // lands, and again on any later header re-render.
    const header = document.querySelector("header");
    const headerObserver = new MutationObserver(scheduleMeasure);
    if (header) {
      headerObserver.observe(header, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onLeave);
      headerObserver.disconnect();
      if (moveFrame) cancelAnimationFrame(moveFrame);
      if (measureFrame) cancelAnimationFrame(measureFrame);
    };
  }, []);

  return null;
}
