"use client";

import * as React from "react";

/**
 * Client island wrapping the marquee track. The motion itself stays CSS-driven
 * (`.stat-ticker-track` keyframes in globals.css); this only eases the running
 * animation's `playbackRate` toward 0 while the pointer hovers and back toward 1
 * when it leaves, so the ribbon glides to a stop instead of snapping frozen.
 * Reduced-motion users get no hover handling (the CSS already freezes the track).
 */
export function StatTickerTrack({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let target = 1;

    const ease = () => {
      const anim = el.getAnimations()[0];
      if (!anim) return;
      const next = anim.playbackRate + (target - anim.playbackRate) * 0.08;
      if (Math.abs(next - target) < 0.004) {
        anim.playbackRate = target;
        return;
      }
      anim.playbackRate = next;
      frame = requestAnimationFrame(ease);
    };

    const ramp = (to: number) => {
      target = to;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(ease);
    };

    const onEnter = () => ramp(0);
    const onLeave = () => ramp(1);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="stat-ticker-track">
      {children}
    </div>
  );
}
