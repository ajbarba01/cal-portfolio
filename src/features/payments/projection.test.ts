import { describe, it, expect } from "vitest";
import { computePaymentStatus, amountOwedCents } from "./projection";
import type { PaymentTxn } from "./types";

// ─── computePaymentStatus ─────────────────────────────────────────────────────

describe("computePaymentStatus", () => {
  it("returns unpaid when there are no transactions", () => {
    expect(computePaymentStatus(5000, [])).toBe("unpaid");
  });

  it("returns paid when succeeded sum >= finalCents", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 5000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("paid");
  });

  it("returns paid when succeeded sum exceeds finalCents (overpay)", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 3000, refundedCents: 0 },
      { status: "succeeded", amountCents: 2500, refundedCents: 0 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("paid");
  });

  it("returns unpaid when succeeded sum < finalCents (partial payment)", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 2000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("unpaid");
  });

  it("returns refunded when refundedSum > 0 and not fully paid", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 5000, refundedCents: 5000 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("refunded");
  });

  it("returns refunded when refundedSum > 0 even if failed txns exist", () => {
    const txns: PaymentTxn[] = [
      { status: "failed", amountCents: 5000, refundedCents: 0 },
      { status: "refunded", amountCents: 5000, refundedCents: 5000 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("refunded");
  });

  it("returns unpaid for finalCents === 0 edge case (no meaningful charge)", () => {
    const txns: PaymentTxn[] = [];
    expect(computePaymentStatus(0, txns)).toBe("unpaid");
  });

  it("ignores failed and requires_payment txns for paid calculation", () => {
    const txns: PaymentTxn[] = [
      { status: "failed", amountCents: 5000, refundedCents: 0 },
      { status: "requires_payment", amountCents: 5000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(5000, txns)).toBe("unpaid");
  });
});

describe("computePaymentStatus — refund re-model (PAY3/PAY5)", () => {
  it("partially_refunded when a refund is present but net is below final", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("partially_refunded");
  });

  it("refunded when the whole captured amount came back", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("refunded");
  });

  it("paid (not partially_refunded) when an overpay duplicate was refunded — net == final", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });

  it("paid when overpaid and not yet reconciled (net > final)", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });

  it("a refund does not mask paid when net still covers final (overpay partial)", () => {
    // captured 12000, refunded 3000 → net 9000 >= 6000 → paid
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });
});

describe("amountOwedCents — nets refunds", () => {
  it("owes the retained half after a partial refund", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
    ];
    expect(amountOwedCents(6000, txns)).toBe(3000);
  });

  it("owes full again after a complete refund", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(amountOwedCents(6000, txns)).toBe(6000);
  });
});

// ─── amountOwedCents ──────────────────────────────────────────────────────────

describe("amountOwedCents", () => {
  it("returns finalCents when no txns", () => {
    expect(amountOwedCents(5000, [])).toBe(5000);
  });

  it("subtracts succeeded payments", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 2000, refundedCents: 0 },
    ];
    expect(amountOwedCents(5000, txns)).toBe(3000);
  });

  it("clamps to 0 when fully paid", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 5000, refundedCents: 0 },
    ];
    expect(amountOwedCents(5000, txns)).toBe(0);
  });

  it("clamps to 0 when overpaid (never negative)", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
    ];
    expect(amountOwedCents(5000, txns)).toBe(0);
  });

  it("ignores non-succeeded txns", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 5000, refundedCents: 5000 },
      { status: "failed", amountCents: 5000, refundedCents: 0 },
      { status: "requires_payment", amountCents: 5000, refundedCents: 0 },
    ];
    expect(amountOwedCents(5000, txns)).toBe(5000);
  });
});
