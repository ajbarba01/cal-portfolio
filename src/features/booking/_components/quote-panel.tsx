"use client";

/** Itemized price-estimate receipt. Pure presentation of a BookingQuotePreview. */

import type { BookingQuotePreview } from "@/features/booking/booking-service";
import { centsToDollars } from "@/features/booking/format-money";
import { Button } from "@/components/ui/button";

interface QuotePanelProps {
  preview: BookingQuotePreview;
  /** When provided (and showBook), renders the Book CTA inside the receipt. */
  onBook?: () => void;
  bookLabel?: string;
  bookDisabled?: boolean;
  showBook?: boolean;
}

export function QuotePanel({
  preview,
  onBook,
  bookLabel = "Book now",
  bookDisabled,
  showBook,
}: QuotePanelProps) {
  return (
    <section
      aria-label="Price estimate"
      className="bg-card text-card-foreground border-border relative rounded-xl border p-4 shadow-[0_1px_0_var(--sand-200),0_8px_20px_-14px_rgba(60,40,20,0.4)]"
    >
      {/* live indicator — the receipt auto-updates as the selection changes */}
      <span className="bg-brand/15 text-brand-strong mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide">
        <span aria-hidden="true" className="bg-brand size-1.5 rounded-full" />
        Live
      </span>

      <ul className="space-y-1.5">
        {preview.breakdown.lines.map((line, i) => (
          <li key={i} className="flex justify-between gap-4 text-sm">
            <span className="text-foreground/70">{line.label}</span>
            <span className="text-foreground tabular-nums">
              {centsToDollars(line.amountCents)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-border my-3 border-t border-dashed" />

      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Total
        </span>
        <span
          className="text-brand-strong text-2xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {centsToDollars(preview.finalCents)}
        </span>
      </div>

      {preview.requiresApproval && (
        <p className="text-foreground/70 mt-2 text-xs italic">
          Requires Cal&apos;s approval before it is confirmed.
        </p>
      )}

      {showBook && onBook && (
        <Button
          variant="brand"
          className="mt-4 w-full"
          onClick={onBook}
          disabled={bookDisabled}
        >
          {bookLabel}
        </Button>
      )}
    </section>
  );
}
