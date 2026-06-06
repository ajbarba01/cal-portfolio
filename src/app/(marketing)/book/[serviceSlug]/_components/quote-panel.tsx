"use client";

/** Itemized price-estimate panel. Pure presentation of a BookingQuotePreview. */

import type { BookingQuotePreview } from "@/features/booking/booking-service";
import { centsToDollars } from "@/features/booking/format-money";

export function QuotePanel({ preview }: { preview: BookingQuotePreview }) {
  return (
    <section
      aria-label="Price estimate"
      className="bg-card text-card-foreground border-border relative rounded-xl border p-4 shadow-[0_1px_0_var(--sand-200),0_8px_20px_-14px_rgba(60,40,20,0.4)]"
    >
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
    </section>
  );
}
