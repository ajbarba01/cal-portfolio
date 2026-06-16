"use client";

import * as React from "react";

/**
 * Client island wrapping the marquee track. Drives the ribbon with a single
 * requestAnimationFrame physics loop instead of a CSS keyframe:
 *
 * - Idle: the offset drifts rightward at a constant baseline velocity (one
 *   group width per ~38s, matching the original CSS marquee speed).
 * - Hover (mouse only): baseline drift is ignored and the track follows the
 *   cursor 1:1 but eased — moving the mouse an inch slides the ribbon an inch,
 *   smoothed by an exponential lerp so it glides rather than snaps. Holding the
 *   cursor still lets the ribbon settle to a stop.
 * - On leave: whatever momentum the ribbon carried is preserved and decays
 *   exponentially back to the baseline drift — iOS-style kinetic deceleration,
 *   `v = vBase + (v - vBase) * exp(-dt/τ)` (Ariya Hidayat's kinetic model).
 *
 * Reduced-motion users get no loop (the track stays frozen at its start). Touch
 * pointers never enter the coupled hover mode — they only see the drift.
 */

// One group width per this many ms — matches the original 38s CSS marquee.
const DRIFT_PERIOD_MS = 38000;
// Time-constant for the hover follow lerp (smaller = snappier catch-up).
const HOVER_TAU = 75;
// Momentum decay time-constant on release (iOS kinetic standard ≈ 325ms).
const FRICTION_TAU = 325;
// Clamp frame delta so a backgrounded tab can't produce a huge jump on return.
const MAX_DT = 64;

export function StatTickerTrack({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    console.log("[ticker] effect run, reducedMotion=", reduced);
    if (reduced) return;

    let frame = 0;
    let last = performance.now();
    let offset = 0; // px; rendered modulo the group width
    let target = 0; // px; hover follow target
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
        // Eased 1:1 follow: lerp toward the cursor-driven target, frame-rate
        // independent. Track the resulting velocity so a flick out carries.
        const k = 1 - Math.exp(-dt / HOVER_TAU);
        const next = offset + (target - offset) * k;
        velocity = dt > 0 ? (next - offset) / dt : velocity;
        offset = next;
      } else {
        // Kinetic decay of leftover momentum back toward the baseline drift.
        const f = Math.exp(-dt / FRICTION_TAU);
        velocity = vBase() + (velocity - vBase()) * f;
        offset += velocity * dt;
      }

      render();
      frame = requestAnimationFrame(tick);
    };

    console.log("[ticker] groupWidth=", groupWidth);
    let moveLogs = 0;
    const onEnter = (e: PointerEvent) => {
      console.log("[ticker] pointerenter type=", e.pointerType);
      if (e.pointerType !== "mouse") return;
      hovering = true;
      target = offset; // anchor so the follow starts without a jump
    };
    const onMove = (e: PointerEvent) => {
      if (moveLogs++ < 5)
        console.log(
          "[ticker] move movementX=",
          e.movementX,
          "hovering=",
          hovering,
        );
      if (hovering) target += e.movementX; // 1:1 cursor delta
    };
    const onLeave = (e: PointerEvent) => {
      console.log("[ticker] pointerleave type=", e.pointerType);
      if (e.pointerType !== "mouse") return;
      hovering = false; // current velocity carries into the decay branch
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="stat-ticker-track">
      {children}
    </div>
  );
}
