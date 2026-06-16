import { describe, it, expect } from "vitest";
import type { QuoteInput } from "@/features/pricing";
import {
  serviceSupportsKiche,
  requoteWithKiche,
  kicheOverpayRefundCents,
} from "./kiche";

/** A minimal walk QuoteInput: 1h, 1 dog, 25% Kiche rate, no travel/recurring. */
function walkInput(applyKiche: boolean): QuoteInput {
  return {
    pricingType: "walk",
    pricingConfig: {
      rate_cents_per_hour: 2000,
      per_dog_cents: 500,
      kiche_discount_pct: 25,
    },
    hours: 1,
    dogs: 1,
    roundTripDriveMinutes: 0,
    recurringDiscountApplies: false,
    recurringDiscountPct: 0,
    applyKiche,
  } as QuoteInput;
}

describe("serviceSupportsKiche", () => {
  it("is true only for house_sitting and walk (Cal: those two only)", () => {
    expect(serviceSupportsKiche("house_sitting")).toBe(true);
    expect(serviceSupportsKiche("walk")).toBe(true);
    expect(serviceSupportsKiche("check_in")).toBe(false);
    expect(serviceSupportsKiche("training")).toBe(false);
    expect(serviceSupportsKiche("meet_greet")).toBe(false);
  });
});

describe("requoteWithKiche", () => {
  it("applies the discount line, lowering the total by the service pct", () => {
    // base = 2000 (1h) + 500 (1 dog) = 2500; 25% off = 625 → 1875.
    const off = requoteWithKiche(walkInput(false), false);
    const on = requoteWithKiche(walkInput(false), true);
    expect(off.finalCents).toBe(2500);
    expect(on.finalCents).toBe(1875);
  });

  it("ignores the stored applyKiche flag — the passed flag wins (idempotent re-quote)", () => {
    // Stored input already has applyKiche=true; re-quoting with false removes it.
    const removed = requoteWithKiche(walkInput(true), false);
    expect(removed.finalCents).toBe(2500);
  });
});

describe("kicheOverpayRefundCents", () => {
  it("refunds the overpayment when the new total is lower than paid", () => {
    expect(kicheOverpayRefundCents(2500, 1875)).toBe(625);
  });

  it("is 0 when nothing was overpaid (paid <= new total)", () => {
    expect(kicheOverpayRefundCents(2500, 2500)).toBe(0);
    expect(kicheOverpayRefundCents(1875, 2500)).toBe(0); // un-applied → owed, not refunded
    expect(kicheOverpayRefundCents(0, 1875)).toBe(0); // unpaid booking
  });
});
