"use client";

/** Itemized price-estimate panel. Pure presentation of a BookingQuotePreview. */

import type { BookingQuotePreview } from "@/features/booking/booking-service";

function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function QuotePanel({ preview }: { preview: BookingQuotePreview }) {
  return (
    <section
      aria-label="Price estimate"
      className="border-border bg-card text-card-foreground rounded-lg border p-4"
    >
      <h2 className="mb-3 text-sm font-semibold">Price estimate</h2>
      <ul className="space-y-1 text-sm">
        {preview.breakdown.lines.map((line, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{line.label}</span>
            <span>{centsToDollars(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="border-border mt-3 flex justify-between border-t pt-3 font-medium">
        <span>Total</span>
        <span>{centsToDollars(preview.finalCents)}</span>
      </div>
      {preview.requiresApproval && (
        <p className="text-muted-foreground mt-2 text-xs">
          This booking requires Cal&apos;s approval before it is confirmed.
        </p>
      )}
    </section>
  );
}
