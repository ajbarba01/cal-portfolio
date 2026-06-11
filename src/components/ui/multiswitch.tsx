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

/**
 * Shared segmented control ("multiswitch") used by every list/search page for
 * mutually-exclusive category filters and view toggles. A pill-group on a muted
 * track; the active segment lifts onto a card surface. This is the single source
 * of truth for that control — pages must not re-inline their own.
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
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "bg-muted border-border inline-flex gap-0.5 rounded-lg border p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
              isActive && opt.tone === "warn"
                ? "bg-destructive text-white"
                : isActive
                  ? "bg-card text-foreground shadow-sm"
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
