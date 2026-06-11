import { describe, expect, it } from "vitest";
import {
  disputeLabel,
  paymentPill,
  retainedHalfLabel,
} from "./payment-display";

describe("payment-display", () => {
  it("maps status to pill label + tone", () => {
    expect(paymentPill("partially_refunded").label).toBe("Partially refunded");
    expect(paymentPill("paid").tone).toBe("paid");
  });
  it("renders retained-half from cents", () => {
    expect(retainedHalfLabel({ finalCents: 20000, refundedCents: 10000 })).toBe(
      "Refunded $100.00 · kept $100.00",
    );
    expect(
      retainedHalfLabel({ finalCents: 20000, refundedCents: 0 }),
    ).toBeNull();
  });

  it("covers unpaid and refunded pill labels + tones", () => {
    expect(paymentPill("unpaid").label).toBe("Unpaid");
    expect(paymentPill("unpaid").tone).toBe("unpaid");
    expect(paymentPill("refunded").label).toBe("Refunded");
    expect(paymentPill("refunded").tone).toBe("refunded");
  });

  it("disputeLabel maps known statuses and handles null", () => {
    expect(disputeLabel("needs_response")).toBe("Disputed · needs response");
    expect(disputeLabel("under_review")).toBe("Disputed · under review");
    expect(disputeLabel("won")).toBe("Disputed · won");
    expect(disputeLabel("some_unknown_status")).toBe(
      "Disputed · some unknown status",
    );
    expect(disputeLabel(null)).toBe("Disputed");
  });
});
