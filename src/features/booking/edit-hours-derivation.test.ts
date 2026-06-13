import { describe, expect, it } from "vitest";

import { buildEditQuoteInput } from "./edit-core";
import { parseQuantities } from "./booking-service-shared";
import type { BookingEditRow } from "./booking-repository";

/**
 * Maintainer-reported 2026-06-12: editing a walk booking whose stored
 * quote_inputs is empty (seeded rows) failed with a raw Zod error —
 * `hours: expected number, received undefined`. Like `nights` (U24), `hours`
 * is DERIVED state: the booked span is authoritative, so the edit merge must
 * recompute it from the merged timestamps instead of trusting stored/patched
 * quantities.
 */

function walkBooking(overrides: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: "b1",
    client_id: "u1",
    service_slug: "walk",
    status: "confirmed",
    startsAt: new Date("2026-06-15T15:00:00Z"),
    endsAt: new Date("2026-06-15T16:00:00Z"),
    quote_inputs: {},
    petIds: ["p1"],
    paidCents: 0,
    comments: "",
    series_id: null,
    ...overrides,
  } as BookingEditRow;
}

describe("buildEditQuoteInput hours derivation", () => {
  it("derives hours from stored timestamps when quote_inputs is empty and patch omits quantities", () => {
    const { merged } = buildEditQuoteInput(walkBooking(), {});
    expect(merged.quantities.hours).toBe(1);
  });

  it("derives fractional hours (15-min steps) from the span", () => {
    const { merged } = buildEditQuoteInput(
      walkBooking({ endsAt: new Date("2026-06-15T16:15:00Z") }),
      {},
    );
    expect(merged.quantities.hours).toBe(1.25);
  });

  it("recomputes hours from a patched time range (timestamps are authoritative)", () => {
    const { merged } = buildEditQuoteInput(walkBooking(), {
      startsAt: new Date("2026-06-16T15:00:00Z"),
      endsAt: new Date("2026-06-16T17:00:00Z"),
    });
    expect(merged.quantities.hours).toBe(2);
  });

  it("leaves whole-day spans to nights (no hours on house_sitting ranges)", () => {
    const { merged } = buildEditQuoteInput(
      walkBooking({
        service_slug: "house-sitting",
        endsAt: new Date("2026-06-17T15:00:00Z"),
      }),
      {},
    );
    expect(merged.quantities.nights).toBe(2);
    expect(merged.quantities.hours).toBeUndefined();
  });
});

describe("parseQuantities error message", () => {
  it("reports invalid quantities in plain language, never raw zod JSON", () => {
    const r = parseQuantities("walk", {});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.message).not.toContain("{");
      expect(r.message).not.toContain("invalid_type");
      expect(r.message).toMatch(/hours/);
    }
  });
});
