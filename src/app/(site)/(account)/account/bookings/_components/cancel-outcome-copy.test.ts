import { describe, it, expect } from "vitest";
import { cancelOutcomeCopy } from "./cancel-outcome-copy";

describe("cancelOutcomeCopy", () => {
  it("full tier with a refund", () => {
    expect(
      cancelOutcomeCopy({
        tier: "full",
        refundCents: 4500,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("You'll be refunded $45.00.");
  });

  it("full tier with nothing paid → no charge", () => {
    expect(
      cancelOutcomeCopy({
        tier: "full",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("No charge.");
  });

  it("late tier: refund now + remainder Cal may grant", () => {
    expect(
      cancelOutcomeCopy({
        tier: "late",
        refundCents: 2250,
        remainderCents: 2250,
        debtCents: 0,
      }),
    ).toBe(
      "You'll be refunded $22.50 now. Cal may refund the remaining $22.50.",
    );
  });

  it("none tier with a fee", () => {
    expect(
      cancelOutcomeCopy({
        tier: "none",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 2250,
      }),
    ).toBe("A $22.50 late-cancellation fee will apply.");
  });

  it("none tier with no fee ($0 booking) → no charge", () => {
    expect(
      cancelOutcomeCopy({
        tier: "none",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("No charge.");
  });
});
