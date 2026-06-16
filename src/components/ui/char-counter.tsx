"use client";

import { cn } from "@/lib/utils";

/**
 * Live character counter for long free-text fields (paired with a `maxLength` on
 * the control and a matching `.max()` on the server schema — see
 * `src/lib/field-limits.ts`). Renders `count / max`, muted by default, amber
 * within the last 10% of the budget, and red once the cap is reached.
 *
 * `aria-live="polite"` announces the remaining budget to screen readers without
 * stealing focus. Short single-line inputs do NOT get a counter — the silent
 * `maxLength` wall is fine there; the counter is for fields long enough that a
 * user could hit the limit mid-thought.
 */
export function CharCounter({
  value,
  max,
  id,
  className,
}: {
  value: string;
  max: number;
  /** Set when a control references the counter via `aria-describedby`. */
  id?: string;
  className?: string;
}) {
  const count = value.length;
  const atLimit = count >= max;
  const nearLimit = !atLimit && count >= max * 0.9;

  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        "text-xs tabular-nums",
        atLimit
          ? "text-destructive"
          : nearLimit
            ? "text-warning-foreground"
            : "text-muted-foreground",
        className,
      )}
    >
      {count.toLocaleString()} / {max.toLocaleString()}
    </p>
  );
}
