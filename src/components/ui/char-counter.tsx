"use client";

import { cn } from "@/lib/utils";

/**
 * Live character counter for long free-text fields (paired with a `maxLength` on
 * the control and a matching `.max()` on the server schema — see
 * `src/lib/field-limits.ts`). Renders `count / max`, muted by default, amber
 * within the last 10% of the budget, and red once the cap is reached.
 *
 * The count is announced only inside the amber/red band. Announcing it on every
 * keystroke — which a live region on the visible figure does — talks over the
 * user's own typing for the whole field, and the number is not news until the
 * budget is nearly spent. The visible figure stays the `aria-describedby`
 * target, so focusing the control still reads the current budget once.
 *
 * Short single-line inputs do NOT get a counter — the silent `maxLength` wall is
 * fine there; the counter is for fields long enough that a user could hit the
 * limit mid-thought.
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
  const budget = `${count.toLocaleString()} / ${max.toLocaleString()}`;

  return (
    <>
      <p
        id={id}
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
        {budget}
      </p>
      {/* Empty (and silent) until the budget matters. sr-only takes the span out
          of flow, so it never disturbs the caller's layout. */}
      <span aria-live="polite" className="sr-only">
        {atLimit || nearLimit ? budget : ""}
      </span>
    </>
  );
}
