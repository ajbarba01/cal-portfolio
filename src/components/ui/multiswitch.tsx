"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * One segment of a {@link Multiswitch}. `tone: "warn"` renders the active state
 * in destructive red (used for filters like "Owing" that flag a problem set).
 */
export interface MultiswitchOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading icon (lucide-compatible: takes a `className`). */
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn";
}

interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Shared segmented control ("multiswitch") used by every list/search page for
 * mutually-exclusive category filters and view toggles. A pill-group on a muted
 * track; the active segment lifts onto a card surface that **glides** to the
 * selection. This is the single source of truth for that control — pages must
 * not re-inline their own.
 *
 * The lifted surface is a single absolutely-positioned indicator measured from
 * the active button's box (offset within the track), so it animates both
 * horizontally and vertically — it follows correctly even when the track wraps
 * to multiple rows. Measurement runs in a layout effect (before paint) and on
 * resize, so there's no first-paint flash; until measured, the active button
 * carries its own background as a fallback (also the no-JS state).
 */
export function Multiswitch<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<MultiswitchOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const btnRefs = React.useRef(new Map<T, HTMLButtonElement>());
  const [indicator, setIndicator] = React.useState<IndicatorRect | null>(null);

  const activeOption = options.find((opt) => opt.value === value);

  // Measure the active segment relative to the track's padding box (clientLeft/
  // clientTop strip the track border so the indicator's `left:0/top:0` origin
  // lines up). Layout effect → positioned before the browser paints.
  React.useLayoutEffect(() => {
    const track = trackRef.current;
    const el = btnRefs.current.get(value);
    if (!track || !el) {
      setIndicator(null);
      return;
    }
    const measure = () =>
      setIndicator({
        left: el.offsetLeft - track.clientLeft,
        top: el.offsetTop - track.clientTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    measure();

    // Recompute when the track resizes (viewport changes, font load, wrap).
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [value, options]);

  const ready = indicator !== null;

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "bg-muted border-border relative inline-flex gap-0.5 rounded-lg border p-1",
        className,
      )}
    >
      {/* Sliding lifted surface — only once measured (else the active button's
          own background stands in, so there's never an unselected flash). */}
      {ready ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 rounded-md transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none",
            activeOption?.tone === "warn"
              ? "bg-destructive"
              : "bg-card shadow-sm",
          )}
          style={{
            transform: `translate(${indicator.left}px, ${indicator.top}px)`,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      ) : null}

      {options.map((opt) => {
        const isActive = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(node) => {
              if (node) btnRefs.current.set(opt.value, node);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            aria-pressed={isActive}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "focus-visible:ring-ring relative z-10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActive && opt.tone === "warn"
                ? // Lifted surface carries the red once measured; before that the
                  // button does (no-flash / no-JS fallback).
                  cn("text-white", !ready && "bg-destructive")
                : isActive
                  ? cn("text-foreground", !ready && "bg-card shadow-sm")
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
