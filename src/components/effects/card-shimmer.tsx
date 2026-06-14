"use client";

import * as React from "react";

/**
 * CardShimmer — a hover-revealed clay outline that traces the parent card, with
 * one or two soft "comet" highlights gliding around it at constant speed.
 *
 * Rendered as a `<canvas>` that bleeds a few px past the card on every side and
 * is drawn at device-pixel resolution, so the ring sits exactly on the card's
 * border edge (no sub-pixel gap / background peek-through) and stays crisp at any
 * DPR or zoom. The parent MUST be `position: relative`; the canvas is
 * pointer-inert and aria-hidden.
 *
 * The highlight is sampled continuously along the rounded-rect perimeter with a
 * raised-cosine (Hann) falloff, so it never dots at long lengths and melts
 * smoothly back into the base ring color. Motion is arc-length parametrized →
 * constant px/sec all the way around, corners included.
 *
 * Colors come from semantic tokens (`--card-ring`, `--card-ring-hot`), resolved
 * to rgb at hover time so theme switches are picked up. Inert on touch and under
 * prefers-reduced-motion (a static ring fades in on hover; nothing travels).
 */
type CardShimmerProps = {
  /** Comet spread along the path, px. */
  length?: number;
  /** Travel speed, px/sec. */
  speed?: number;
  /** Brightest highlight alpha (0–1). */
  peak?: number;
  /** Ring stroke width, px. */
  width?: number;
  /** Two comets 180° apart (vs one). */
  twin?: boolean;
  /** Resting ring alpha (0–1). */
  baseAlpha?: number;
  /** CSS color for the resting outline (token expression). */
  ringColor?: string;
  /** CSS color for the traveling highlight (token expression). */
  hotColor?: string;
  /** Pull the ring inward from the border by this many px (keeps the stroke
   *  fully over a filled surface, e.g. a clay button, instead of straddling
   *  the edge onto the page background). */
  inset?: number;
  /** Run continuously instead of only while hovered. */
  alwaysOn?: boolean;
  /** Paint the resting ring with the parent's live background-color (so it
   *  reads as the button's own edge and tracks its hover/active color),
   *  instead of `ringColor`. The comet still uses `hotColor`. */
  ringMatchesBg?: boolean;
};

type Seg = {
  t: "l" | "a";
  len: number;
  start: number;
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  cx?: number;
  cy?: number;
  a0?: number;
  a1?: number;
  r?: number;
};

const MARGIN = 8; // canvas bleed so anti-aliasing never clips at the edges
const DIR = -1; // clockwise
const HALF_PI = Math.PI / 2;

export function CardShimmer({
  length = 180,
  speed = 80,
  peak = 0.25,
  width = 2,
  twin = true,
  baseAlpha = 0.26,
  ringColor = "var(--card-ring)",
  hotColor = "var(--card-ring-hot)",
  inset = 0,
  alwaysOn = false,
  ringMatchesBg = false,
}: CardShimmerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const card = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !card || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let path: { segs: Seg[]; total: number } | null = null;
    let cw = 0;
    let ch = 0;
    let head = 0;
    let hover = 0;
    let target = 0;
    let raf: number | null = null;
    let last = 0;
    let ring = "174, 90, 53";
    let hot = "193, 105, 60";

    // Resolve a token color to an "r, g, b" string via a throwaway probe, so
    // `var()` chains and theme swaps both work without hardcoding values.
    const resolve = (value: string, fallback: string) => {
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;color:${value}`;
      card.appendChild(probe);
      const m = getComputedStyle(probe).color.match(/\d+/g);
      probe.remove();
      return m ? m.slice(0, 3).join(", ") : fallback;
    };
    const readColors = () => {
      ring = resolve(ringColor, ring);
      hot = resolve(hotColor, hot);
    };

    const buildPath = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      const L = Math.max(0, w - 2 * r);
      const V = Math.max(0, h - 2 * r);
      const A = HALF_PI * r;
      const raw: Omit<Seg, "start">[] = [
        { t: "l", len: L, x0: x + r, y0: y, x1: x + w - r, y1: y },
        { t: "a", len: A, cx: x + w - r, cy: y + r, a0: -HALF_PI, a1: 0, r },
        { t: "l", len: V, x0: x + w, y0: y + r, x1: x + w, y1: y + h - r },
        { t: "a", len: A, cx: x + w - r, cy: y + h - r, a0: 0, a1: HALF_PI, r },
        { t: "l", len: L, x0: x + w - r, y0: y + h, x1: x + r, y1: y + h },
        {
          t: "a",
          len: A,
          cx: x + r,
          cy: y + h - r,
          a0: HALF_PI,
          a1: Math.PI,
          r,
        },
        { t: "l", len: V, x0: x, y0: y + h - r, x1: x, y1: y + r },
        {
          t: "a",
          len: A,
          cx: x + r,
          cy: y + r,
          a0: Math.PI,
          a1: 1.5 * Math.PI,
          r,
        },
      ];
      let total = 0;
      const segs = raw.map((s) => {
        const seg = { ...s, start: total } as Seg;
        total += s.len;
        return seg;
      });
      return { segs, total };
    };

    const pointAt = (p: { segs: Seg[]; total: number }, s: number) => {
      const P = p.total;
      s = ((s % P) + P) % P;
      for (const seg of p.segs) {
        if (s <= seg.start + seg.len) {
          const f = seg.len ? (s - seg.start) / seg.len : 0;
          if (seg.t === "l") {
            return [
              seg.x0! + (seg.x1! - seg.x0!) * f,
              seg.y0! + (seg.y1! - seg.y0!) * f,
            ] as const;
          }
          const a = seg.a0! + (seg.a1! - seg.a0!) * f;
          return [
            seg.cx! + Math.cos(a) * seg.r!,
            seg.cy! + Math.sin(a) * seg.r!,
          ] as const;
        }
      }
      return [p.segs[0].x0!, p.segs[0].y0!] as const;
    };

    const draw = () => {
      if (!path) return;
      ctx.clearRect(0, 0, cw, ch);
      if (hover <= 0.001) return;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // base ring — one crisp continuous stroke. ringMatchesBg pulls the
      // parent's live background-color (tracks hover/active + transitions).
      let baseRgb = ring;
      if (ringMatchesBg) {
        const m = getComputedStyle(card).backgroundColor.match(/\d+/g);
        if (m) baseRgb = m.slice(0, 3).join(", ");
      }
      ctx.strokeStyle = `rgba(${baseRgb}, ${(baseAlpha * hover).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i <= path.total; i += 2) {
        const [px, py] = pointAt(path, i);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      if (reduce) return; // static ring only

      // comet(s) — continuous sampling, raised-cosine falloff
      const halfLen = length / 2;
      const ds = 1.3;
      const phases = twin ? [0, path.total / 2] : [0];
      for (const phase of phases) {
        for (let t = -halfLen; t < halfLen; t += ds) {
          const a =
            peak * hover * (0.5 + 0.5 * Math.cos((Math.PI * t) / halfLen));
          if (a < 0.004) continue;
          const [x0, y0] = pointAt(path, head + phase + t);
          const [x1, y1] = pointAt(path, head + phase + t + ds);
          ctx.strokeStyle = `rgba(${hot}, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    };

    const layout = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const bw = card.offsetWidth;
      const bh = card.offsetHeight;
      if (!bw || !bh) return;
      const cs = getComputedStyle(card);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const radius = parseFloat(cs.borderTopLeftRadius) || 12;
      cw = bw + MARGIN * 2;
      ch = bh + MARGIN * 2;
      canvas.style.left = `${-(bl + MARGIN)}px`;
      canvas.style.top = `${-(bl + MARGIN)}px`;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const o = MARGIN + bl / 2 + inset;
      path = buildPath(
        o,
        o,
        bw - bl - inset * 2,
        bh - bl - inset * 2,
        Math.max(0, radius - bl / 2 - inset),
      );
      draw();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      hover += (target - hover) * Math.min(1, dt / 0.16);
      if (hover > 0.001 && !reduce && path) {
        head = (head + DIR * speed * dt) % path.total;
      }
      draw();
      if (alwaysOn || target > 0 || hover > 0.001) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    };
    const start = () => {
      if (raf == null) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      readColors();
      target = 1;
      start();
    };
    const onLeave = () => {
      target = 0;
      start();
    };

    const ro = new ResizeObserver(layout);
    ro.observe(card);
    readColors();
    layout();

    if (alwaysOn) {
      // Run continuously; under reduced motion settle to a single static frame.
      target = 1;
      if (reduce) {
        hover = 1;
        draw();
      } else {
        start();
      }
    } else {
      card.addEventListener("pointerenter", onEnter);
      card.addEventListener("pointerleave", onLeave);
    }

    return () => {
      ro.disconnect();
      if (!alwaysOn) {
        card.removeEventListener("pointerenter", onEnter);
        card.removeEventListener("pointerleave", onLeave);
      }
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [
    length,
    speed,
    peak,
    width,
    twin,
    baseAlpha,
    ringColor,
    hotColor,
    inset,
    alwaysOn,
    ringMatchesBg,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute"
    />
  );
}
