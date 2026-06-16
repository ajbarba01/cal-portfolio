"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface RadioOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * RadioGroup — a single-select segmented control for **form fields** (species,
 * mode pickers), with proper `radiogroup`/`radio` semantics. A bordered track on
 * the control height; the active segment carries the clay tint. Use
 * {@link Multiswitch} instead for page filters / view toggles — that's view
 * state (aria-pressed), not a form value.
 */
export function RadioGroup<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<RadioOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-slot="radio-group"
      className={cn(
        "border-input rounded-control inline-flex w-fit overflow-hidden border",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "focus-visible:ring-ring h-[var(--control-h-md)] px-4 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              active
                ? "bg-brand/15 text-brand-strong font-semibold"
                : "text-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
