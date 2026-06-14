"use client";

import * as React from "react";

/**
 * Focus text — splits a copy string into word spans, then warms each word
 * toward a focal token (default `--brand-strong`) as the cursor nears it, so
 * the eye is drawn to where the hand is, like a finger tracking the line you're
 * reading. Pairs with the site's existing cursor glow (`<CursorRing>`): same
 * clay language, reinforced.
 *
 * The colour itself is pure CSS (see `[data-focus-text]` in globals.css) — the
 * island only publishes `--f` in [0,1] per word from cursor distance. `--f`
 * peaks at the word under the cursor and falls off over `reach` px, sharpened
 * by `gamma`. Nothing reflows; only paint changes.
 *
 * Every mounted instance shares ONE module-level controller (a single
 * `pointermove` + `ResizeObserver`), so a page full of `<FocusText>` blocks adds
 * one hot path, not one per block. Word centres are measured once and re-
 * measured only on scroll / resize / font-swap (rAF-throttled); pointermove just
 * reads cached centres. Honors `prefers-reduced-motion` (it never registers, so
 * words keep their normal inherited colour) and is inert on touch.
 *
 * `children` is a plain copy string (word-split for the effect). Use it for
 * link-free copy slots; copy with inline `[label](href)` markers should keep
 * using `<MarketingCopy>` instead.
 */

interface FocusBlock {
  host: HTMLElement;
  words: HTMLElement[];
  centers: { cx: number; cy: number }[];
  reach: number;
  gamma: number;
}

// ── Shared controller: one set of blocks, one listener set ────────────────
const blocks = new Set<FocusBlock>();
let mx = -9999;
let my = -9999;
let moveFrame = 0;
let geomFrame = 0;
let listening = false;
let resizeObserver: ResizeObserver | null = null;

function measure(b: FocusBlock) {
  b.centers = b.words.map((w) => {
    const r = w.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
}

function updateAll() {
  moveFrame = 0;
  for (const b of blocks) {
    for (let i = 0; i < b.words.length; i++) {
      const { cx, cy } = b.centers[i];
      const d = Math.hypot(mx - cx, my - cy);
      const t = Math.max(0, Math.min(1, 1 - d / b.reach));
      b.words[i].style.setProperty("--f", Math.pow(t, b.gamma).toFixed(3));
    }
  }
}

function scheduleUpdate() {
  if (!moveFrame) moveFrame = requestAnimationFrame(updateAll);
}

// Geometry only shifts on scroll / resize / font-swap; re-measure every block
// then re-render against the current cursor — rAF-throttled, never per move.
function remeasureAll() {
  geomFrame = 0;
  for (const b of blocks) measure(b);
  updateAll();
}

function scheduleRemeasure() {
  if (!geomFrame) geomFrame = requestAnimationFrame(remeasureAll);
}

function onMove(e: PointerEvent) {
  if (e.pointerType === "touch") return;
  mx = e.clientX;
  my = e.clientY;
  scheduleUpdate();
}

// Relax every word when the pointer leaves the window so nothing stays lit.
function relaxAll() {
  for (const b of blocks)
    for (const w of b.words) w.style.setProperty("--f", "0");
}

function onMouseOut(e: MouseEvent) {
  if (e.relatedTarget) return;
  if (moveFrame) {
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
  }
  relaxAll();
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("scroll", scheduleRemeasure, { passive: true });
  window.addEventListener("resize", scheduleRemeasure, { passive: true });
  document.addEventListener("mouseout", onMouseOut);
  // Word boxes move once the web fonts swap in — re-measure when they settle.
  document.fonts?.ready.then(scheduleRemeasure);
  resizeObserver = new ResizeObserver(scheduleRemeasure);
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("scroll", scheduleRemeasure);
  window.removeEventListener("resize", scheduleRemeasure);
  document.removeEventListener("mouseout", onMouseOut);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (moveFrame) {
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
  }
  if (geomFrame) {
    cancelAnimationFrame(geomFrame);
    geomFrame = 0;
  }
}

function registerBlock(
  host: HTMLElement,
  words: HTMLElement[],
  reach: number,
  gamma: number,
): () => void {
  const block: FocusBlock = { host, words, centers: [], reach, gamma };
  measure(block);
  blocks.add(block);
  startListening();
  resizeObserver?.observe(host);
  // Layout/fonts may still settle right after mount — re-measure next frame.
  scheduleRemeasure();
  return () => {
    blocks.delete(block);
    resizeObserver?.unobserve(host);
    if (blocks.size === 0) stopListening();
  };
}

export function FocusText({
  children,
  as: Tag = "p",
  className,
  to,
  reach = 400,
  gamma = 1.6,
  ...rest
}: {
  children: string;
  as?: React.ElementType;
  className?: string;
  /** Focal colour the words warm toward (any CSS colour/var). Default `--brand-strong`. */
  to?: string;
  /** Proximity radius in px. */
  reach?: number;
  /** Falloff exponent; >1 tightens the focal point. */
  gamma?: number;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLElement>(null);

  // Static copy → stable word/space token list. Capturing split keeps the
  // whitespace runs so spacing renders exactly as written.
  const tokens = React.useMemo(() => children.split(/(\s+)/), [children]);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = ref.current;
    if (!host) return;
    const words = Array.from(
      host.querySelectorAll<HTMLElement>("[data-focus-word]"),
    );
    if (words.length === 0) return;
    return registerBlock(host, words, reach, gamma);
  }, [reach, gamma, tokens]);

  const style = to ? ({ "--focus-to": to } as React.CSSProperties) : undefined;

  return (
    <Tag
      ref={ref}
      data-focus-text=""
      className={className}
      style={style}
      {...rest}
    >
      {tokens.map((tok, i) =>
        /\S/.test(tok) ? (
          <span key={i} data-focus-word="">
            {tok}
          </span>
        ) : (
          <React.Fragment key={i}>{tok}</React.Fragment>
        ),
      )}
    </Tag>
  );
}
