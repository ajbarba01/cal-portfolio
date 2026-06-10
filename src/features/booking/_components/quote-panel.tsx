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
  /** Prior booking total (cents). When set, renders a signed delta vs finalCents. */
  priorFinalCents?: number;
  /** When true, show "this change needs Cal's approval again". */
  approvalWillReReview?: boolean;
}

export function QuotePanel({
  preview,
  onBook,
  bookLabel = "Book now",
  bookDisabled,
  showBook,
  priorFinalCents,
  approvalWillReReview,
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

      {typeof priorFinalCents === "number" &&
        priorFinalCents !== preview.finalCents && (
          <p className="mt-1 text-right text-sm font-medium tabular-nums">
            <span
              className={
                preview.finalCents > priorFinalCents
                  ? "text-brand-strong"
                  : "text-status-available-foreground"
              }
            >
              {preview.finalCents > priorFinalCents ? "+" : "−"}
              {centsToDollars(Math.abs(preview.finalCents - priorFinalCents))}
            </span>
            <span className="text-muted-foreground ml-1.5">vs current</span>
          </p>
        )}
      {approvalWillReReview && (
        <p className="text-brand-strong mt-2 text-xs">
          This change needs Cal&apos;s approval again.
        </p>
      )}

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
