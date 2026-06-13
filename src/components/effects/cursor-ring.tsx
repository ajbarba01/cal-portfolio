"use client";

import * as React from "react";

/**
 * Highlight style for the cursor surface. Flip this one value to switch the look
 * — both share the exact same pointer + masking logic below:
 *   - "ombre" — a soft clay glow that fades radially out from the cursor;
 *   - "ring"  — a clay outline ring that trails the cursor.
 */
export const CURSOR_HIGHLIGHT: "ombre" | "ring" = "ring";

/**
 * Cursor highlight — a single clay glow pinned to the pointer in viewport space
 * and MASKED to the content sheet (this component's parent), so it washes over
 * essentially everything on the page EXCEPT:
 *   - the textured site background — the mask is the sheet rect, so the canvas
 *     gutters / overscroll outside it are never tinted;
 *   - anything tagged `[data-ring-exclude]` (hero photos) — those rects are
 *     cut out of the mask (XOR), so the glow never washes over imagery.
 *
 * Open dropdown panels tagged `[data-ring-include]` are then composited back
 * ON TOP of those holes (`add`), so a panel hanging over a hero — which renders
 * in front of it — keeps the glow; the ring only clips once it slides off the
 * panel onto bare imagery.
 *
 * Perf: the mask + tab rects are geometry that only changes on scroll / resize,
 * so they are rebuilt ONLY then (rAF-throttled) and cached — pointermove does
 * nothing but move the glow and update the cached tabs' underlines, keeping the
 * hot path cheap. A proximity underline rides alongside: each
 * `[data-spotlight-link]` (a nav tab) gets `--u` in [0,1] from cursor distance;
 * active tabs and a real `:hover` pin it full in CSS.
 *
 * Honors prefers-reduced-motion (no listeners; CSS hides it) and is inert on
 * touch. On window exit the glow fades out and the underlines relax; the first
 * move on re-entry snaps the glow to the new spot and fades it back in.
 */
export function CursorRing({
  ringSize = 124,
  underlineReach = 120,
}: {
  ringSize?: number;
  /** Falloff radius (px) for the proximity underline (independent of the ring). */
  underlineReach?: number;
}) {
  const overlayRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const overlay = overlayRef.current;
    const host = overlay?.parentElement;
    if (!overlay || !host) return;

    const proximity = underlineReach;
    let lastX = -800;
    let lastY = 0;
    let moveFrame = 0;
    let maskFrame = 0;
    // Snap (don't ease) the glow on the next frame — set after a window exit so
    // a big re-entry jump doesn't swoop it across the page. Initialized true so a
    // freshly-mounted ring (e.g. entering the account/admin zone) snaps to the
    // cursor instead of swooping in from its off-screen default.
    let instant = true;
    // True between a window exit and the next real move. Guards the move rAF: a
    // pointermove fired just before exit may have a frame still queued, and
    // without this it would run after the hide and re-reveal the frozen ring.
    let leftWindow = false;
    // Cached on scroll/resize so the per-move path never re-measures the DOM.
    let linkCenters: { el: HTMLElement; cx: number; cy: number }[] = [];

    const setMaskProp = (prop: string, val: string) => {
      overlay.style.setProperty(prop, val);
      overlay.style.setProperty(`-webkit-${prop}`, val);
    };

    // Measure every visible, non-empty element matching `selector` into viewport
    // rects (skipping `visibility:hidden` so closed dropdowns drop out).
    const collectRects = (selector: string) => {
      const out: DOMRect[] = [];
      for (const el of host.querySelectorAll(selector)) {
        if (getComputedStyle(el).visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
      }
      return out;
    };

    // Rebuild the mask and re-cache the nav-tab centers. Geometry only — runs on
    // scroll / resize / mount / dropdown toggle, never on pointermove.
    const rebuildGeometry = () => {
      maskFrame = 0;
      const sheet = host.getBoundingClientRect();
      const excludes = collectRects("[data-ring-exclude]");
      const includes = collectRects("[data-ring-include]");

      // Mask layer stack, top→bottom: open dropdown panels, the sheet, then the
      // excluded hero photos. Processed bottom-up, the excludes XOR-cut holes in
      // the sheet, then the includes composite back with `add` on top — so a panel
      // over a hero re-reveals the glow, while bare hero stays cut.
      const layers = [...includes, sheet, ...excludes];
      const ops = [
        ...includes.map(() => "add"),
        excludes.length ? "exclude" : "add",
        ...excludes.map(() => "exclude"),
      ];
      setMaskProp(
        "mask-image",
        layers.map(() => "linear-gradient(#000,#000)").join(","),
      );
      setMaskProp("mask-repeat", layers.map(() => "no-repeat").join(","));
      setMaskProp(
        "mask-size",
        layers.map((r) => `${r.width}px ${r.height}px`).join(","),
      );
      setMaskProp(
        "mask-position",
        layers.map((r) => `${r.left}px ${r.top}px`).join(","),
      );
      overlay.style.setProperty("mask-composite", ops.join(","));
      overlay.style.setProperty(
        "-webkit-mask-composite",
        ops.map((o) => (o === "add" ? "source-over" : "xor")).join(","),
      );

      linkCenters = [];
      for (const el of host.querySelectorAll<HTMLElement>(
        "[data-spotlight-link]",
      )) {
        const r = el.getBoundingClientRect();
        linkCenters.push({
          el,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        });
      }
    };

    const movePointer = () => {
      moveFrame = 0;
      // Stale frame queued just before the pointer left the window — ignore it,
      // or it would undo the hide. A real re-entry move clears leftWindow first.
      if (leftWindow) return;
      if (instant) {
        overlay.setAttribute("data-ring-instant", "");
        overlay.removeAttribute("data-ring-hidden");
        requestAnimationFrame(() =>
          overlay.removeAttribute("data-ring-instant"),
        );
        instant = false;
      }
      overlay.style.setProperty("--mx", `${lastX}px`);
      overlay.style.setProperty("--my", `${lastY}px`);
      for (const { el, cx, cy } of linkCenters) {
        const u = Math.max(
          0,
          1 - Math.hypot(lastX - cx, lastY - cy) / proximity,
        );
        el.style.setProperty("--u", u.toFixed(3));
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      leftWindow = false;
      lastX = e.clientX;
      lastY = e.clientY;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(movePointer);
    };

    // Primary (left) button: shrink the ring while held. The scale rides the
    // ring's existing transform transition, so it eases between the two radii.
    // A quick click would release before the shrink finishes, so hold the
    // pressed state for at least the transition duration — the ring always
    // reaches full shrink, then eases back. Keep this in sync with the
    // `transition: transform` duration on `.cursor-ring` in globals.css.
    const PRESS_MIN_MS = 100;
    let pressStart = 0;
    let releaseTimer = 0;
    const releasePress = () => {
      releaseTimer = 0;
      overlay.removeAttribute("data-ring-pressed");
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = 0;
      }
      pressStart = performance.now();
      overlay.setAttribute("data-ring-pressed", "");
    };
    const onPointerUp = () => {
      if (!overlay.hasAttribute("data-ring-pressed") || releaseTimer) return;
      const remaining = PRESS_MIN_MS - (performance.now() - pressStart);
      if (remaining > 0)
        releaseTimer = window.setTimeout(releasePress, remaining);
      else releasePress();
    };

    const scheduleRebuild = () => {
      if (maskFrame) return;
      maskFrame = requestAnimationFrame(rebuildGeometry);
    };

    const onWindowLeave = () => {
      // Don't leave the ring + proximity underlines frozen mid-page: fade the
      // glow out and relax every underline. The next move on re-entry snaps the
      // glow to the new spot (instant) and fades it back in.
      instant = true;
      leftWindow = true;
      // Drop any move frame queued before the exit so it can't re-reveal the ring.
      if (moveFrame) {
        cancelAnimationFrame(moveFrame);
        moveFrame = 0;
      }
      overlay.setAttribute("data-ring-hidden", "");
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = 0;
      }
      overlay.removeAttribute("data-ring-pressed");
      for (const { el } of linkCenters) el.style.setProperty("--u", "0");
    };

    // mouseleave on the root can be skipped on fast exits or when the pointer
    // leaves over a child; mouseout with a null relatedTarget fires reliably
    // whenever the pointer leaves the window entirely.
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget) onWindowLeave();
    };

    // A dropdown opening/closing doesn't change the sheet's box, so the resize /
    // scroll path won't fire — its opacity fade does. Rebuild on that transition
    // so the panel's rect enters (open) or leaves (close) the mask in step.
    const onPanelToggle = (e: TransitionEvent) => {
      if (
        e.propertyName === "opacity" &&
        e.target instanceof Element &&
        e.target.hasAttribute("data-ring-include")
      ) {
        scheduleRebuild();
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("scroll", scheduleRebuild, { passive: true });
    window.addEventListener("resize", scheduleRebuild, { passive: true });
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("blur", onWindowLeave);
    host.addEventListener("transitionrun", onPanelToggle);
    host.addEventListener("transitionend", onPanelToggle);
    host.addEventListener("transitioncancel", onPanelToggle);

    // The layout (this persistent shell) survives client navigation, so the
    // mask must be rebuilt whenever the sheet's size changes — a new page's
    // content, lazy images loading in, fonts settling. A ResizeObserver catches
    // all of those; scroll/resize handle viewport-relative shifts on top.
    const observer = new ResizeObserver(scheduleRebuild);
    observer.observe(host);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("scroll", scheduleRebuild);
      window.removeEventListener("resize", scheduleRebuild);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onWindowLeave);
      host.removeEventListener("transitionrun", onPanelToggle);
      host.removeEventListener("transitionend", onPanelToggle);
      host.removeEventListener("transitioncancel", onPanelToggle);
      observer.disconnect();
      if (releaseTimer) clearTimeout(releaseTimer);
      if (moveFrame) cancelAnimationFrame(moveFrame);
      if (maskFrame) cancelAnimationFrame(maskFrame);
    };
  }, [underlineReach]);

  return (
    <div ref={overlayRef} aria-hidden className="cursor-ring-overlay">
      {CURSOR_HIGHLIGHT === "ombre" ? (
        <div className="cursor-ombre" />
      ) : (
        <span
          className="cursor-ring"
          style={{ "--ring-size": `${ringSize}px` } as React.CSSProperties}
        />
      )}
    </div>
  );
}
