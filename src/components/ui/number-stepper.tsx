"use client";

import { useState } from "react";

import { clampToStep, sanitizeIntInput } from "@/lib/number-input";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  ariaLabel: string;
  id?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  ariaLabel,
  id,
}: NumberStepperProps) {
  const opts = { min, max, step };

  // draft is non-null only while the input is focused; null → show canonical value
  const [draft, setDraft] = useState<string | null>(null);

  function handleFocus() {
    setDraft(String(value));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const sanitized =
      step < 1
        ? raw.replace(/[^\d.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1")
        : sanitizeIntInput(raw);
    setDraft(sanitized);
  }

  function handleBlur() {
    const parsed = parseFloat(draft ?? "");
    const result = isNaN(parsed) ? min : clampToStep(parsed, opts);
    onChange(result);
    setDraft(null);
  }

  function decrease() {
    onChange(clampToStep(value - step, opts));
  }

  function increase() {
    onChange(clampToStep(value + step, opts));
  }

  const stepBtnBase = cn(
    "inline-flex h-full w-11 shrink-0 items-center justify-center",
    "bg-muted hover:bg-accent text-brand-strong",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    "active:translate-y-px transition-all",
    "disabled:opacity-40 disabled:pointer-events-none",
  );

  return (
    <div className="border-border bg-card inline-flex h-11 items-center overflow-hidden rounded-lg border">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        className={cn(stepBtnBase, "border-border rounded-r-none border-r")}
        onClick={decrease}
        disabled={value <= min}
      >
        <span aria-hidden="true" className="text-base leading-none select-none">
          −
        </span>
      </button>

      <div className="flex flex-1 items-center justify-center gap-1 px-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={draft ?? String(value)}
          onFocus={handleFocus}
          onChange={handleChange}
          onBlur={handleBlur}
          className={cn(
            "text-foreground w-10 min-w-0 bg-transparent text-center text-sm font-medium",
            "outline-none",
            "[appearance:textfield]",
            "[&::-webkit-outer-spin-button]:appearance-none",
            "[&::-webkit-inner-spin-button]:appearance-none",
          )}
        />
        {unit && (
          <span className="text-muted-foreground text-xs select-none">
            {unit}
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        className={cn(stepBtnBase, "border-border rounded-l-none border-l")}
        onClick={increase}
        disabled={value >= max}
      >
        <span aria-hidden="true" className="text-base leading-none select-none">
          +
        </span>
      </button>
    </div>
  );
}
