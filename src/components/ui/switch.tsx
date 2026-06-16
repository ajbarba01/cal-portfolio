"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Switch — the shared on/off toggle (settings, admin flags). One source for the
 * pattern that was hand-rolled per admin page. Control only: render a `<label>`
 * or adjacent text for the caption. Thumb is a semantic `bg-card` disc with no
 * drop-shadow (the colored track carries the affordance).
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick" | "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      data-slot="switch"
      className={cn(
        "focus-visible:ring-ring relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand" : "bg-muted-foreground/40",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "bg-card pointer-events-none inline-block size-5 rounded-full transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
