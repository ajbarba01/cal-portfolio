import { describe, it, expect } from "vitest";
import { computeRefund, computeCancellationDebtCents } from "./cancellation";

const MS_PER_HOUR = 60 * 60 * 1000;
const now = new Date("2026-06-03T12:00:00Z");
const FINAL = 10000; // $100.00

function startsInHours(h: number): Date {
  return new Date(now.getTime() + h * MS_PER_HOUR);
}

const base = { finalCents: FINAL, now, fullRefundHours: 48, lateRefundPct: 50 };

describe("computeRefund", () => {
  it("full refund of what was paid when cancelled before the cutoff", () => {
    const r = computeRefund({
      ...base,
      paidCents: FINAL,
      startsAt: startsInHours(72),
    });
    expect(r).toEqual({
      refundCents: FINAL,
      tier: "full",
      needsCalReview: false,
    });
  });

  it("full refund exactly at the cutoff (inclusive boundary)", () => {
    const r = computeRefund({
      ...base,
      paidCents: FINAL,
      startsAt: startsInHours(48),
    });
    expect(r.tier).toBe("full");
    expect(r.refundCents).toBe(FINAL);
  });

  it("late tier — partial refund of paid just inside the cutoff", () => {
    const r = computeRefund({
      ...base,
      paidCents: FINAL,
      startsAt: startsInHours(47),
    });
    expect(r).toEqual({
      refundCents: 5000,
      tier: "late",
      needsCalReview: true,
    });
  });

  it("none tier — unpaid cancel inside the cutoff refunds nothing", () => {
    const r = computeRefund({
      ...base,
      paidCents: 0,
      startsAt: startsInHours(10),
    });
    expect(r).toEqual({ refundCents: 0, tier: "none", needsCalReview: false });
  });

  it("unpaid before the cutoff is a full (free) cancellation, nothing to refund", () => {
    const r = computeRefund({
      ...base,
      paidCents: 0,
      startsAt: startsInHours(72),
    });
    expect(r).toEqual({ refundCents: 0, tier: "full", needsCalReview: false });
  });

  it("rounds the late refund to the nearest cent", () => {
    const r = computeRefund({
      ...base,
      lateRefundPct: 33,
      paidCents: 999,
      startsAt: startsInHours(1),
    });
    expect(r.refundCents).toBe(Math.round((999 * 33) / 100)); // 330
  });

  // Actor-aware: admin (fullRefund: true) always gets paidCents back regardless of timing.
  it("fullRefund: true — admin cancel inside cutoff refunds 100% of paidCents", () => {
    const r = computeRefund({
      ...base,
      paidCents: FINAL,
      startsAt: startsInHours(10), // well inside the 48h cutoff → would be late tier
      fullRefund: true,
    });
    expect(r.refundCents).toBe(FINAL);
    expect(r.tier).toBe("full");
    expect(r.needsCalReview).toBe(false);
  });

  it("fullRefund: true — admin cancel when nothing paid still refunds 0", () => {
    const r = computeRefund({
      ...base,
      paidCents: 0,
      startsAt: startsInHours(10),
      fullRefund: true,
    });
    expect(r.refundCents).toBe(0);
    expect(r.tier).toBe("full");
  });

  it("client late-cancel (fullRefund: false/default) keeps late_cancel_refund_pct", () => {
    const r = computeRefund({
      ...base,
      paidCents: FINAL,
      startsAt: startsInHours(10), // inside cutoff → late tier
    });
    expect(r.refundCents).toBe(5000); // 50% of 10000
    expect(r.tier).toBe("late");
  });
});

describe("computeCancellationDebtCents", () => {
  it("late_cancel owes the non-refunded portion (100 - lateRefundPct)%", () => {
    expect(
      computeCancellationDebtCents({
        finalCents: FINAL,
        reason: "late_cancel",
        lateRefundPct: 50,
        noShowChargePct: 100,
      }),
    ).toBe(5000);
  });

  it("no_show owes no_show_charge_pct% (100% by default = full price)", () => {
    expect(
      computeCancellationDebtCents({
        finalCents: FINAL,
        reason: "no_show",
        lateRefundPct: 50,
        noShowChargePct: 100,
      }),
    ).toBe(FINAL);
  });

  it("scales late_cancel debt with a non-default refund pct", () => {
    // 70% refunded → 30% forfeited.
    expect(
      computeCancellationDebtCents({
        finalCents: FINAL,
        reason: "late_cancel",
        lateRefundPct: 70,
        noShowChargePct: 100,
      }),
    ).toBe(3000);
  });
});
