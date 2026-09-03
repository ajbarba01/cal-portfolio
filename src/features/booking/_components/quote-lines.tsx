/** The itemized rows of a quote — pure presentation, no surface of its own. */

import type { QuoteBreakdown } from "@/features/pricing";
import { centsToDollars } from "@/features/booking/format-money";
import { InfoTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A `quote_breakdown` as it comes back from the database. Bookings taken before
 * the breakdown was persisted hold a legacy `{}`, so nothing here is guaranteed
 * and every reader has to cope with an absent line list.
 */
export type StoredQuoteBreakdown = Partial<QuoteBreakdown>;

interface QuoteLinesProps {
  breakdown: StoredQuoteBreakdown | null | undefined;
  /** Extra classes for the list — the spacing its host surface needs. */
  className?: string;
}

/**
 * One row per line, label left and amount right, with the line's plain-language
 * definition behind an info-tooltip where it has one.
 *
 * Renders nothing when there are no lines, so a legacy booking leaves no empty
 * block behind and hosts can drop it in unguarded.
 */
export function QuoteLines({ breakdown, className }: QuoteLinesProps) {
  const lines = breakdown?.lines;
  if (!lines?.length) return null;

  return (
    <ul className={cn("space-y-1.5", className)}>
      {lines.map((line, i) => (
        <li key={i} className="flex justify-between gap-4 text-sm">
          <span className="text-foreground/70 inline-flex items-center gap-1">
            {line.label}
            {line.description && (
              <InfoTooltip
                label={`What is "${line.label}"?`}
                content={line.description}
              />
            )}
          </span>
          <span className="text-foreground tabular-nums">
            {centsToDollars(line.amountCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
