import { describe, it, expect, vi } from "vitest";
import { setKicheAppliedCore } from "./admin-actions-core";
import type { CancelDeps } from "./cancel-core";
import type { BookingForKiche, BookingRepository } from "./booking-repository";
import type { PaymentGateway } from "@/features/payments";

const WALK_QUOTE_INPUTS = {
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
  applyKiche: false,
};

// base 2000 (1h) + 500 (1 dog) = 2500; 25% Kiche off → 1875.
const FULL = 2500;
const DISCOUNTED = 1875;

function makeBooking(over: Partial<BookingForKiche> = {}): BookingForKiche {
  return {
    id: "bk-1",
    client_id: "cl-1",
    status: "confirmed",
    quote_inputs: WALK_QUOTE_INPUTS,
    kiche_welcome: true,
    kiche_applied: false,
    finalCents: FULL,
    payments: [],
    ...over,
  };
}

function makeDeps(booking: BookingForKiche | null) {
  const updateBookingKiche = vi.fn(async () => {});
  const refund = vi.fn(async () => {});
  const repo = {
    getBookingForKiche: vi.fn(async () => booking),
    updateBookingKiche,
  } as unknown as BookingRepository;
  const gateway = { refund } as unknown as PaymentGateway;
  const deps = { repo, now: new Date(), gateway } as CancelDeps;
  return { deps, updateBookingKiche, refund };
}

describe("setKicheAppliedCore", () => {
  it("applies the discount on an unpaid booking — lowers total, no refund", async () => {
    const { deps, updateBookingKiche, refund } = makeDeps(makeBooking());
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res).toMatchObject({
      kind: "success",
      applied: true,
      newFinalCents: DISCOUNTED,
      refundedCents: 0,
    });
    expect(updateBookingKiche).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({ kiche_applied: true, final_cents: DISCOUNTED }),
    );
    expect(refund).not.toHaveBeenCalled();
  });

  it("refunds the overpayment when applied to an already-paid booking", async () => {
    const { deps, refund } = makeDeps(
      makeBooking({
        payments: [
          {
            status: "succeeded",
            amountCents: FULL,
            paymentIntentId: "pi_123",
          },
        ],
      }),
    );
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res).toMatchObject({
      kind: "success",
      refundedCents: FULL - DISCOUNTED,
    });
    expect(refund).toHaveBeenCalledWith("pi_123", FULL - DISCOUNTED);
  });

  it("rejects applying when the client did not mark Kiche welcome", async () => {
    const { deps } = makeDeps(makeBooking({ kiche_welcome: false }));
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res.kind).toBe("no_consent");
  });

  it("rejects applying on a service without a Kiche rate", async () => {
    const { deps } = makeDeps(
      makeBooking({
        quote_inputs: { ...WALK_QUOTE_INPUTS, pricingType: "check_in" },
      }),
    );
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res.kind).toBe("unsupported");
  });

  it("is an idempotent no-op when already in the requested state", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      makeBooking({ kiche_applied: true, finalCents: DISCOUNTED }),
    );
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res).toMatchObject({ kind: "success", refundedCents: 0 });
    expect(updateBookingKiche).not.toHaveBeenCalled();
  });

  it("rejects changes on a cancelled booking", async () => {
    const { deps } = makeDeps(makeBooking({ status: "cancelled" }));
    const res = await setKicheAppliedCore(deps, {
      bookingId: "bk-1",
      applied: true,
    });
    expect(res.kind).toBe("invalid_state");
  });

  it("returns not_found for a missing booking", async () => {
    const { deps } = makeDeps(null);
    const res = await setKicheAppliedCore(deps, {
      bookingId: "nope",
      applied: true,
    });
    expect(res.kind).toBe("not_found");
  });
});
