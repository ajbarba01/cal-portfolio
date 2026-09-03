import { cn } from "@/lib/utils";

/**
 * Result-count label for a filter bar, pinned to the right in a reserved-width,
 * right-aligned, tabular-nums slot. The reserved width means the count growing
 * from "1 review" to "12 reviews" never reflows the search box or switches
 * beside it. Pluralizes `noun` automatically (or pass `pluralNoun`).
 *
 * `role="status"` because this is the only feedback a filter or search gives:
 * the list below just changes length, which a screen-reader user never hears.
 */
export function ResultCount({
  count,
  noun,
  pluralNoun,
  className,
}: {
  count: number;
  noun: string;
  pluralNoun?: string;
  className?: string;
}) {
  const label = count === 1 ? noun : (pluralNoun ?? `${noun}s`);
  return (
    <span
      role="status"
      className={cn(
        "text-muted-foreground min-w-24 text-right text-sm tabular-nums sm:ml-auto",
        className,
      )}
    >
      {count} {label}
    </span>
  );
}
