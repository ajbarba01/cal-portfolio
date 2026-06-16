import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * StatDisplay — a single value+label pair in one of two shapes:
 * - `stacked` (default): big value over a small uppercase label (stat ribbons,
 *   trust numbers).
 * - `receipt`: label left, value right on one baseline (price breakdowns, quote
 *   lines).
 *
 * Values render `tabular-nums` so columns of figures align.
 */
export function StatDisplay({
  value,
  label,
  variant = "stacked",
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  variant?: "stacked" | "receipt";
  className?: string;
}) {
  if (variant === "receipt") {
    return (
      <div
        data-slot="stat-display"
        data-variant="receipt"
        className={cn("flex items-baseline justify-between gap-4", className)}
      >
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
    );
  }
  return (
    <div
      data-slot="stat-display"
      data-variant="stacked"
      className={cn("flex flex-col gap-0.5", className)}
    >
      <span className="font-heading text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
    </div>
  );
}
