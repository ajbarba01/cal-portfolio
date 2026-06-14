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
 *   - anything tagged `[data-ring-exclude]` (hero / gallery photos) — those rects
 *     are punched out of the mask (rounded to their corner radius), so the glow
 *     never washes over imagery.
 *
 * Open dropdown panels tagged `[data-ring-include]` are then painted back ON TOP
 * of those holes, so a panel hanging over a hero — which renders in front of it —
 * keeps the glow; the ring only clips once it slides off the panel onto bare
 * imagery. The whole mask is a single SVG image-mask (see `rebuildGeometry`),
 * so it scales to any photo count without a per-photo composite chain.
 *
 * Perf: the mask is built in DOCUMENT space and cached, so it's re-encoded ONLY
 * on real layout changes (resize / ResizeObserver / dropdown toggle, rAF-
 * throttled). Scrolling never re-encodes it — it just shifts `mask-position`
 * (compositor-only), which avoids the flicker that reassigning a data-URI
 * `mask-image` per scroll frame caused (async image decode). pointermove only
 * moves the glow + underlines. A proximity underline rides alongside: each
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
    let scrollFrame = 0;
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

    // Offset the document-space mask so it lines up under the viewport-fixed
    // overlay. This is the entire per-scroll mask cost: a compositor-only
    // mask-position shift — no re-encode, no async image decode, so no flicker.
    const paintMaskPosition = () => {
      setMaskProp("mask-position", `${-window.scrollX}px ${-window.scrollY}px`);
    };

    // Proximity underline pass. Cursor + link centers are both in document space,
    // so this stays correct at any scroll offset (and the non-sticky header's
    // links relax as they scroll away, since the doc-space cursor moves off them).
    const paintUnderlines = () => {
      const dx = lastX + window.scrollX;
      const dy = lastY + window.scrollY;
      for (const { el, cx, cy } of linkCenters) {
        const u = Math.max(0, 1 - Math.hypot(dx - cx, dy - cy) / proximity);
        el.style.setProperty("--u", u.toFixed(3));
      }
    };

    // Measure every visible, non-empty element matching `selector` into DOCUMENT
    // rects (viewport rect + scroll) + corner radius (skipping `visibility:hidden`
    // so closed dropdowns drop out). Document space lets the mask be built once
    // and only repositioned on scroll. The radius tracks each photo's rounded edge.
    type Box = { left: number; top: number; width: number; height: number };
    const collectRects = (selector: string, root: ParentNode = host) => {
      const out: { r: Box; radius: number }[] = [];
      const sx = window.scrollX;
      const sy = window.scrollY;
      for (const el of root.querySelectorAll(selector)) {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          out.push({
            r: {
              left: r.left + sx,
              top: r.top + sy,
              width: r.width,
              height: r.height,
            },
            radius: parseFloat(cs.borderTopLeftRadius) || 0,
          });
        }
      }
      return out;
    };

    // Serialize one rect as an SVG <rect>, rounded to `radius` so the mask hole
    // matches the photo's corner. Coords are viewport-space (the overlay is
    // fixed/inset:0), one decimal to keep the data URI short.
    const svgRect = ({ r, radius }: { r: Box; radius: number }, fill: string) =>
      `<rect x='${r.left.toFixed(1)}' y='${r.top.toFixed(1)}' width='${r.width.toFixed(1)}' height='${r.height.toFixed(1)}'${radius ? ` rx='${radius.toFixed(1)}'` : ""} fill='${fill}'/>`;

    // Rebuild the mask and re-cache the nav-tab centers. Geometry only — runs on
    // scroll / resize / mount / dropdown toggle, never on pointermove.
    const rebuildGeometry = () => {
      maskFrame = 0;
      const docEl = document.documentElement;
      const sx = window.scrollX;
      const sy = window.scrollY;
      // Span the whole document (clamped to ≥ viewport) so scrolling only shifts
      // mask-position — the image itself is never re-encoded mid-scroll.
      const dw = Math.max(docEl.scrollWidth, docEl.clientWidth);
      const dh = Math.max(docEl.scrollHeight, docEl.clientHeight);
      const sheetRect = host.getBoundingClientRect();
      const sheet: Box = {
        left: sheetRect.left + sx,
        top: sheetRect.top + sy,
        width: sheetRect.width,
        height: sheetRect.height,
      };
      const excludes = collectRects("[data-ring-exclude]");
      const includes = collectRects("[data-ring-include]");
      // Modal popups portal to <body>, OUTSIDE the sheet — query the document.
      const modals = collectRects("[data-ring-modal-surface]", document);

      // ONE mask layer (luminance), not one-per-photo. Normally the sheet is
      // painted white (glow shows), excluded photos black (glow cut), then open
      // dropdown panels white again on top — so a panel over a hero re-reveals
      // the glow while bare imagery stays cut. The single outer image-mask scales
      // to any photo count with no `mask-composite` chain (which Blink
      // mis-composites past a couple of layers and re-rasterizes per scroll frame).
      //
      // When a modal popup is open the rule inverts: the mask goes black
      // everywhere and ONLY the popup panel(s) are painted white, so the ring is
      // excluded from the whole dimmed page except the popup. The overlay also
      // lifts above the popup (data-ring-modal → z-index in globals.css).
      let maskInner: string;
      if (modals.length) {
        overlay.setAttribute("data-ring-modal", "");
        maskInner = modals.map((m) => svgRect(m, "#fff")).join("");
      } else {
        overlay.removeAttribute("data-ring-modal");
        maskInner =
          svgRect({ r: sheet, radius: 0 }, "#fff") +
          excludes.map((e) => svgRect(e, "#000")).join("") +
          includes.map((e) => svgRect(e, "#fff")).join("");
      }
      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${dw}' height='${dh}'>` +
        `<mask id='m'>` +
        maskInner +
        `</mask>` +
        `<rect width='100%' height='100%' fill='#fff' mask='url(#m)'/>` +
        `</svg>`;

      const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      setMaskProp("mask-image", url);
      setMaskProp("mask-repeat", "no-repeat");
      setMaskProp("mask-size", `${dw}px ${dh}px`);
      paintMaskPosition();

      linkCenters = [];
      for (const el of host.querySelectorAll<HTMLElement>(
        "[data-spotlight-link]",
      )) {
        const r = el.getBoundingClientRect();
        linkCenters.push({
          el,
          cx: r.left + sx + r.width / 2,
          cy: r.top + sy + r.height / 2,
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
      paintUnderlines();
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

    // Scroll hot path: the mask is built once in document space, so scrolling only
    // shifts it (compositor-only, no re-encode → no flicker) and relaxes the
    // underlines. No DOM reads, no mask-image reassignment, no full rebuild.
    const onScrollFrame = () => {
      scrollFrame = 0;
      paintMaskPosition();
      paintUnderlines();
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(onScrollFrame);
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
    window.addEventListener("scroll", onScroll, { passive: true });
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

    // Modal popups portal OUTSIDE the sheet (to <body>), so neither the host
    // ResizeObserver nor the host transition listeners above ever see them. Watch
    // <body>'s child list for portal mount/unmount, plus document-level
    // transitions on tagged panels, so the mask flips into / out of modal mode
    // exactly when a popup opens or closes.
    // Track size changes of the open panel(s) too: switching an inquiry popup
    // from view to edit swaps its content (taller form) with no portal mutation
    // and no transition, so without this the mask rect would go stale. Re-target
    // on mount/unmount only (not per rebuild) so the RO's observe-time callback
    // can't feed back into an endless rebuild loop.
    const modalObserver = new ResizeObserver(scheduleRebuild);
    const syncModalObservation = () => {
      modalObserver.disconnect();
      for (const el of document.querySelectorAll("[data-ring-modal-surface]")) {
        modalObserver.observe(el);
      }
    };
    const onBodyMutation = () => {
      syncModalObservation();
      scheduleRebuild();
    };
    const bodyObserver = new MutationObserver(onBodyMutation);
    bodyObserver.observe(document.body, { childList: true });
    const onModalTransition = (e: TransitionEvent) => {
      if (
        e.target instanceof Element &&
        e.target.hasAttribute("data-ring-modal-surface")
      ) {
        scheduleRebuild();
      }
    };
    document.addEventListener("transitionrun", onModalTransition);
    document.addEventListener("transitionend", onModalTransition);
    document.addEventListener("transitioncancel", onModalTransition);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleRebuild);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("blur", onWindowLeave);
      host.removeEventListener("transitionrun", onPanelToggle);
      host.removeEventListener("transitionend", onPanelToggle);
      host.removeEventListener("transitioncancel", onPanelToggle);
      observer.disconnect();
      bodyObserver.disconnect();
      modalObserver.disconnect();
      document.removeEventListener("transitionrun", onModalTransition);
      document.removeEventListener("transitionend", onModalTransition);
      document.removeEventListener("transitioncancel", onModalTransition);
      if (releaseTimer) clearTimeout(releaseTimer);
      if (moveFrame) cancelAnimationFrame(moveFrame);
      if (maskFrame) cancelAnimationFrame(maskFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
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
