"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Switch — the shared on/off toggle (settings, admin flags). A pill track that
 * fills clay when on, with a sand thumb that glides between ends. Control only;
 * render a `<label>` or adjacent text for the caption. No drop-shadow — the
 * track tint carries the state.
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
        "focus-visible:ring-ring/50 focus-visible:ring-offset-background relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand" : "bg-muted-foreground/30",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "bg-card pointer-events-none block size-5 rounded-full transition-transform duration-200 ease-out",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
