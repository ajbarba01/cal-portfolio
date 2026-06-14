"use client";

import * as React from "react";
import { motion } from "@/lib/design-tokens";

/** Pre-paint on the client; plain effect on the server (layout effects no-op). */
const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

interface RevealGroupContextValue {
  /** Group has entered view — children should reveal (with their delay). */
  active: boolean;
  /** Claim a stable, source-order index for a child (idempotent per element). */
  claimIndex: (el: HTMLElement) => number;
}
const RevealGroupContext = React.createContext<RevealGroupContextValue | null>(
  null,
);

/**
 * Decide *when* an element reveals: immediately if it's already on screen at
 * load (avoids a blank flash), otherwise when it scrolls into view. `enabled`
 * is false for grouped children — the group drives them instead.
 */
function useRevealTrigger(
  ref: React.RefObject<HTMLElement | null>,
  once: boolean,
  enabled: boolean,
  immediate: boolean,
) {
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    // rAF, not a synchronous setState: lets the opacity-0 state paint one frame
    // so the fade actually runs (and keeps setState out of the effect body).
    const fadeInNow = () => {
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    };

    // `immediate` opts out of scroll-gating entirely: always fade on mount,
    // on screen or not (used by the footer, which re-mounts per navigation and
    // should always replay the fade rather than wait to be scrolled to).
    if (immediate) return fadeInNow();

    if (typeof IntersectionObserver === "undefined") return fadeInNow();

    const rect = el.getBoundingClientRect();
    if (once && rect.top < window.innerHeight && rect.bottom > 0) {
      return fadeInNow();
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) io.unobserve(entry.target);
          } else if (!once) {
            setRevealed(false);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, enabled, immediate]);

  return revealed;
}

/**
 * Section-level reveal container. Observed as a single unit — the whole section
 * triggers together — but its `<Reveal>` children cascade in reading order
 * (top-to-bottom, then left-to-right), i.e. by their vertical and horizontal
 * placement. Each child's delay = its index × `staggerStepMs` (capped at
 * `staggerMaxMs`). Plain (non-`<Reveal>`) content inside is unaffected.
 */
export function RevealGroup({
  as: Tag = "div",
  once = true,
  children,
  ...rest
}: {
  as?: React.ElementType;
  once?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const ref = React.useRef<HTMLElement>(null);
  const active = useRevealTrigger(ref, once, true, false);

  // Stable source-order index per child element. Idempotent so re-registers
  // (StrictMode, context changes) keep the same index.
  const indices = React.useRef(new Map<HTMLElement, number>());
  const counter = React.useRef(0);
  const claimIndex = React.useCallback((el: HTMLElement) => {
    const existing = indices.current.get(el);
    if (existing !== undefined) return existing;
    const i = counter.current;
    counter.current += 1;
    indices.current.set(el, i);
    return i;
  }, []);

  const ctx = React.useMemo<RevealGroupContextValue>(
    () => ({ active, claimIndex }),
    [active, claimIndex],
  );

  return (
    <RevealGroupContext.Provider value={ctx}>
      <Tag ref={ref} {...rest}>
        {children}
      </Tag>
    </RevealGroupContext.Provider>
  );
}

/**
 * Scroll reveal — fades an element in as it enters the viewport (reveal-once).
 *
 * Standalone, it observes itself: content already on screen at load fades in
 * immediately (so nothing sits blank under the hero); content below the fold
 * fades in as you scroll to it.
 *
 * Inside a {@link RevealGroup}, the group drives the timing — the section
 * reveals as a unit and this element's stagger delay comes from its reading-
 * order position in the group (set at mount, so it's in place before reveal).
 *
 * The *rise* (translateY) is a first-class dimension that is **disabled
 * site-wide today**: `--reveal-distance` defaults to `0px` in globals.css, so
 * this renders as a pure fade. Turn rise on globally by bumping that one token,
 * or per-instance via the `distance` prop. Duration/easing are the sibling
 * `--reveal-*` tokens; all mirror `motion.reveal` in design-tokens.
 *
 * Never traps content hidden: reduced-motion and no-JS both force the shown
 * state (globals.css media query + the <noscript> fallback in the root layout).
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  distance,
  once = true,
  immediate = false,
  style,
  children,
  ...rest
}: {
  as?: React.ElementType;
  /** Manual stagger offset in ms (standalone only; a group sets this itself). */
  delay?: number;
  /** Per-instance rise override in px; omit to use the global token (0 today). */
  distance?: number;
  /** Reveal once and stop observing (default), or re-hide when scrolled away. */
  once?: boolean;
  /** Skip scroll-gating: fade in on mount regardless of viewport position
   *  (standalone only; ignored inside a group). */
  immediate?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const group = React.useContext(RevealGroupContext);
  const ref = React.useRef<HTMLElement>(null);

  // Standalone runs its own trigger; grouped children are driven by the group.
  const selfRevealed = useRevealTrigger(ref, once, group === null, immediate);

  // Grouped: claim a source-order index at mount and derive the stagger delay
  // now (well before reveal), so it renders into the inline style as part of
  // React's output — no racing to set it at reveal time.
  const [groupDelay, setGroupDelay] = React.useState(0);
  useIsoLayoutEffect(() => {
    if (!group) return;
    const el = ref.current;
    if (!el) return;
    const idx = group.claimIndex(el);
    setGroupDelay(
      Math.min(idx * motion.reveal.staggerStepMs, motion.reveal.staggerMaxMs),
    );
  }, [group]);

  const revealed = group ? group.active : selfRevealed;
  const effectiveDelay = group ? groupDelay : delay;

  const vars: Record<string, string> = {};
  if (effectiveDelay) vars["--reveal-delay"] = `${effectiveDelay}ms`;
  if (distance !== undefined) vars["--reveal-distance"] = `${distance}px`;

  return (
    <Tag
      ref={ref}
      data-reveal=""
      data-revealed={revealed ? "true" : undefined}
      style={{ ...vars, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
