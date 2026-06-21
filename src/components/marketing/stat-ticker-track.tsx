"use client";

import * as React from "react";

/**
 * Client island wrapping the marquee track. Drives the ribbon with a single
 * requestAnimationFrame physics loop instead of a CSS keyframe:
 *
 * - Idle: the offset drifts rightward at a constant baseline velocity (one
 *   group width per ~38s, matching the original CSS marquee speed).
 * - Hover (mouse only): the cursor does NOT steer the ribbon. The drift simply
 *   decelerates, its velocity decaying exponentially toward a near-stop so the
 *   ribbon eases to rest under the pointer.
 * - On leave: whatever momentum the ribbon carried is preserved and decays
 *   exponentially back to the baseline drift — iOS-style kinetic deceleration,
 *   `v = vBase + (v - vBase) * exp(-dt/τ)` (Ariya Hidayat's kinetic model).
 *
 * Reduced-motion users get no loop (the track stays frozen at its start). Touch
 * pointers never enter the coupled hover mode — they only see the drift.
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

      if (hovering) {
        // Decelerate toward a near-stop while hovered (no cursor coupling).
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

  return (
    <div ref={ref} className="stat-ticker-track">
      {children}
    </div>
  );
}
