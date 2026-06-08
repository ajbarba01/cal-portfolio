import { describe, expect, it } from "vitest";

import { outstandingBalanceCents, type DebitLike } from "./client-balance";

describe("outstandingBalanceCents", () => {
  it("sums only unsettled debits", () => {
    const debits: DebitLike[] = [
      { amount_cents: 1500, settled_at: null },
      { amount_cents: 3000, settled_at: "2026-06-01T00:00:00Z" },
      { amount_cents: 500, settled_at: null },
    ];
    expect(outstandingBalanceCents(debits)).toBe(2000);
  });

  it("returns 0 for no debits or all settled", () => {
    expect(outstandingBalanceCents([])).toBe(0);
    expect(
      outstandingBalanceCents([{ amount_cents: 100, settled_at: "x" }]),
    ).toBe(0);
  });
});
