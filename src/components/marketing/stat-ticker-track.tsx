"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/control-variants";

/**
 * Client island wrapping the marquee track. Drives the ribbon with a single
 * requestAnimationFrame physics loop instead of a CSS keyframe:
 *
 * - Idle: the offset drifts rightward at a constant baseline velocity (one
 *   group width per ~38s, matching the original CSS marquee speed).
 * - Hover (mouse only): the cursor does NOT steer the ribbon. The drift simply
 *   decelerates, its velocity decaying exponentially toward a near-stop so the
 *   ribbon eases to rest under the pointer.
 * - Paused: the same deceleration, held until the control is pressed again.
 * - On leave/resume: whatever momentum the ribbon carried is preserved and
 *   decays exponentially back to the baseline drift — iOS-style kinetic
 *   deceleration, `v = vBase + (v - vBase) * exp(-dt/τ)` (Ariya Hidayat's
 *   kinetic model).
 *
 * Reduced-motion users get no loop (the track stays frozen at its start, and the
 * pause control is hidden — there is nothing to pause). Touch pointers never
 * enter the hover mode — they only see the drift, so the control is the only way
 * they can stop it.
 */

// One group width per this many ms — matches the original 38s CSS marquee.
const DRIFT_PERIOD_MS = 38000;
// Single time-constant for both the hover deceleration and the release accel
// back to baseline drift — kept equal so the ribbon eases in and out at the
// same rate (smaller = snappier).
const FRICTION_TAU = 160;
// Clamp frame delta so a backgrounded tab can't produce a huge jump on return.
const MAX_DT = 64;

export function StatTickerTrack({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [paused, setPaused] = React.useState(false);
  // The rAF loop is set up once and reads the flag through a ref, so toggling
  // the control never tears down and restarts the animation mid-drift.
  const pausedRef = React.useRef(false);

  function togglePaused() {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
  }

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = performance.now();
    let offset = 0; // px; rendered modulo the group width
    let hovering = false;

    // Width of one item group (the first <ul>) — the loop wraps over this.
    const measure = () =>
      el.firstElementChild
        ? (el.firstElementChild as HTMLElement).offsetWidth
        : 0;
    let groupWidth = measure();
    const vBase = () => groupWidth / DRIFT_PERIOD_MS; // px/ms, rightward
    let velocity = vBase(); // px/ms; start at full drift speed

    const ro = new ResizeObserver(() => {
      groupWidth = measure();
    });
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    const render = () => {
      if (groupWidth <= 0) return;
      let r = offset % groupWidth;
      if (r > 0) r -= groupWidth; // keep in (-groupWidth, 0]
      el.style.transform = `translateX(${r}px)`;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, MAX_DT);
      last = now;

      if (hovering || pausedRef.current) {
        // Decelerate toward a stop (no cursor coupling).
        velocity *= Math.exp(-dt / FRICTION_TAU);
        offset += velocity * dt;
      } else {
        // Kinetic decay of leftover momentum back toward the baseline drift.
        const f = Math.exp(-dt / FRICTION_TAU);
        velocity = vBase() + (velocity - vBase()) * f;
        offset += velocity * dt;
      }

      render();
      frame = requestAnimationFrame(tick);
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      hovering = true;
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      hovering = false; // current velocity carries into the decay branch
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const Icon = paused ? Play : Pause;

  return (
    <>
      <div ref={ref} className="stat-ticker-track">
        {children}
      </div>
      {/* The ribbon moves on its own, so it needs a way to stop (WCAG 2.2.2).
          Hover already halts it for mouse users; this is the only stop a
          keyboard or touch user has. Hidden under reduced motion, where the
          track never animates in the first place. */}
      <button
        type="button"
        onClick={togglePaused}
        aria-label={paused ? "Play" : "Pause"}
        className={cn(
          "text-muted-foreground hover:text-brand-strong hover:bg-muted absolute top-1/2 right-1 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors sm:right-2",
          focusRing,
          "motion-reduce:hidden",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </>
  );
}
