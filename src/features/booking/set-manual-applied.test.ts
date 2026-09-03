import { describe, it, expect, vi } from "vitest";
import { setManualAppliedCore } from "./admin-actions-core";
import type { CancelDeps } from "./cancel-core";
import type { BookingForKiche, BookingRepository } from "./booking-repository";
import type { PaymentGateway } from "@/features/payments";

const WALK_QUOTE_INPUTS = {
  config: {
    modifiers: [
      { kind: "base_per_hour", cents: 2500 },
      {
        kind: "pct_discount",
        id: "kiche",
        label: "Kiche discount (−25%)",
        pct: 25,
        condition: "always",
        manual: true,
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
  },
  hours: 1,
  dogs: 1,
  premiumNights: 0,
  billableMiles: 0,
  recurringSeries: false,
  enabledManualIds: [],
};

/**
 * The live shape after the manual-discount migration: Kiche alongside Friends &
 * Family and Complimentary, plus a travel line that bills past five miles.
 */
const FULL_MANUAL_QUOTE_INPUTS = {
  config: {
    modifiers: [
      { kind: "base_per_hour", cents: 2500 },
      {
        kind: "pct_discount",
        id: "kiche",
        label: "Kiche discount (−25%)",
        pct: 25,
        condition: "always",
        manual: true,
      },
      {
        kind: "pct_discount",
        id: "friends_family",
        label: "Friends & Family (−50%)",
        pct: 50,
        condition: "always",
        manual: true,
      },
      {
        kind: "pct_discount",
        id: "complimentary",
        label: "Complimentary",
        pct: 100,
        condition: "always",
        manual: true,
      },
      {
        kind: "allowance_then_per_unit",
        unit: "mile",
        label: "Travel",
        freeUnits: 5,
        cents: 100,
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
  },
  hours: 1,
  dogs: 1,
  premiumNights: 0,
  billableMiles: 10,
  recurringSeries: false,
  enabledManualIds: [],
};

/** A config WITHOUT a manual "kiche" modifier — Kiche toggle unsupported. */
const NO_KICHE_QUOTE_INPUTS = {
  config: {
    modifiers: [{ kind: "base_per_hour", cents: 3000 }],
    constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
  },
  hours: 1,
  dogs: 1,
  premiumNights: 0,
  billableMiles: 0,
  recurringSeries: false,
  enabledManualIds: [],
};

// base 2500 (1h, dog#1 in base); 25% Kiche off → 1875.
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

function makeDeps(
  booking: BookingForKiche | null,
  refundImpl: (
    paymentIntentId: string,
    amountCents: number,
  ) => Promise<void> = async () => {},
) {
  const updateBookingKiche = vi.fn(async () => {});
  const refund = vi.fn(refundImpl);
  const repo = {
    getBookingForKiche: vi.fn(async () => booking),
    updateBookingKiche,
  } as unknown as BookingRepository;
  const gateway = { refund } as unknown as PaymentGateway;
  const deps = { repo, now: new Date(), gateway } as CancelDeps;
  return { deps, updateBookingKiche, refund };
}

describe("setManualAppliedCore — the Kiche discount", () => {
  it("applies the discount on an unpaid booking — lowers total, no refund", async () => {
    const { deps, updateBookingKiche, refund } = makeDeps(makeBooking());
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
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
            refundedCents: 0,
            paymentIntentId: "pi_123",
          },
        ],
      }),
    );
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
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
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });
    expect(res.kind).toBe("no_consent");
  });

  it("rejects applying on a service without a Kiche rate", async () => {
    const { deps } = makeDeps(
      makeBooking({
        quote_inputs: NO_KICHE_QUOTE_INPUTS,
      }),
    );
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });
    expect(res.kind).toBe("unsupported");
  });

  it("is an idempotent no-op when already in the requested state", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      makeBooking({ kiche_applied: true, finalCents: DISCOUNTED }),
    );
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });
    expect(res).toMatchObject({ kind: "success", refundedCents: 0 });
    expect(updateBookingKiche).not.toHaveBeenCalled();
  });

  it("rejects changes on a cancelled booking", async () => {
    const { deps } = makeDeps(makeBooking({ status: "cancelled" }));
    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });
    expect(res.kind).toBe("invalid_state");
  });

  it("returns not_found for a missing booking", async () => {
    const { deps } = makeDeps(null);
    const res = await setManualAppliedCore(deps, {
      bookingId: "nope",
      modifierId: "kiche",
      applied: true,
    });
    expect(res.kind).toBe("not_found");
  });
});

describe("setManualAppliedCore — refunds against real intent balances", () => {
  it("splits the overpayment across intents rather than over-refunding the first", async () => {
    // Two prepayments of 1250 each cover the 2500 total. Aiming the whole 625
    // overpayment at the first intent would exceed nothing here, but a bigger
    // discount would — so the plan must respect each intent's own balance.
    const { deps, refund } = makeDeps(
      makeBooking({
        payments: [
          {
            status: "succeeded",
            amountCents: 400,
            refundedCents: 0,
            paymentIntentId: "pi_a",
          },
          {
            status: "succeeded",
            amountCents: 2100,
            refundedCents: 0,
            paymentIntentId: "pi_b",
          },
        ],
      }),
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });

    expect(res).toMatchObject({
      kind: "success",
      refundedCents: FULL - DISCOUNTED,
    });
    expect(refund.mock.calls).toEqual([
      ["pi_a", 400],
      ["pi_b", FULL - DISCOUNTED - 400],
    ]);
  });

  it("nets an earlier refund out of the paid total and out of the request", async () => {
    const { deps, refund } = makeDeps(
      makeBooking({
        payments: [
          {
            status: "succeeded",
            amountCents: FULL,
            refundedCents: 300,
            paymentIntentId: "pi_123",
          },
        ],
      }),
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });

    // Net paid is 2200, so the overpayment is 2200 − 1875 = 325, not 625.
    expect(res).toMatchObject({ kind: "success", refundedCents: 325 });
    expect(refund).toHaveBeenCalledWith("pi_123", 325);
  });

  it("reports an error when the gateway rejects the refund", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      makeBooking({
        payments: [
          {
            status: "succeeded",
            amountCents: FULL,
            refundedCents: 0,
            paymentIntentId: "pi_123",
          },
        ],
      }),
      async () => {
        throw new Error("stripe is down");
      },
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });

    expect(res.kind).toBe("error");
    // Persist-then-refund: the discount stays recorded so Cal can retry.
    expect(updateBookingKiche).toHaveBeenCalled();
  });
});

describe("setManualAppliedCore — any manual discount the config declares", () => {
  // 1h walk = 2500, plus 5 billable miles of travel at $1 = 500 → 3000.
  const WITH_TRAVEL = 3000;

  function manualBooking(over: Partial<BookingForKiche> = {}): BookingForKiche {
    return makeBooking({
      quote_inputs: FULL_MANUAL_QUOTE_INPUTS,
      finalCents: WITH_TRAVEL,
      ...over,
    });
  }

  it("applies Friends & Family without touching the Kiche flag", async () => {
    const { deps, updateBookingKiche } = makeDeps(manualBooking());

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "friends_family",
      applied: true,
    });

    // 2500 −50% = 1250, then the 500 travel line the discount cannot touch.
    expect(res).toMatchObject({
      kind: "success",
      applied: true,
      newFinalCents: 1750,
    });
    expect(updateBookingKiche).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({
        kiche_applied: false,
        final_cents: 1750,
        quote_inputs: expect.objectContaining({
          enabledManualIds: ["friends_family"],
        }),
      }),
    );
  });

  it("zeroes travel on a Complimentary booking so the total is exactly $0", async () => {
    const { deps } = makeDeps(manualBooking());

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "complimentary",
      applied: true,
    });

    expect(res).toMatchObject({ kind: "success", newFinalCents: 0 });
  });

  it("keeps the miles in the stored input so removing Complimentary restores travel", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      manualBooking({
        quote_inputs: {
          ...FULL_MANUAL_QUOTE_INPUTS,
          enabledManualIds: ["complimentary"],
        },
        finalCents: 0,
      }),
    );

    await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "complimentary",
      applied: false,
    });

    expect(updateBookingKiche).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({
        final_cents: WITH_TRAVEL,
        quote_inputs: expect.objectContaining({
          billableMiles: 10,
          enabledManualIds: [],
        }),
      }),
    );
  });

  it("compounds a second discount instead of replacing the first", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      manualBooking({
        quote_inputs: {
          ...FULL_MANUAL_QUOTE_INPUTS,
          enabledManualIds: ["friends_family"],
        },
        finalCents: 1750,
      }),
    );

    await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });

    expect(updateBookingKiche).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({
        kiche_applied: true,
        quote_inputs: expect.objectContaining({
          enabledManualIds: ["friends_family", "kiche"],
        }),
      }),
    );
  });

  it("does not gate a non-Kiche discount on the Kiche consent flag", async () => {
    const { deps } = makeDeps(manualBooking({ kiche_welcome: false }));

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "friends_family",
      applied: true,
    });

    expect(res.kind).toBe("success");
  });

  it("is an idempotent no-op when the id is already enabled", async () => {
    const { deps, updateBookingKiche } = makeDeps(
      manualBooking({
        quote_inputs: {
          ...FULL_MANUAL_QUOTE_INPUTS,
          enabledManualIds: ["friends_family"],
        },
        finalCents: 1750,
      }),
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "friends_family",
      applied: true,
    });

    expect(res).toMatchObject({ kind: "success", newFinalCents: 1750 });
    expect(updateBookingKiche).not.toHaveBeenCalled();
  });

  it("rejects an id the booking's config does not declare", async () => {
    const { deps } = makeDeps(manualBooking());

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "off_leash",
      applied: true,
    });

    expect(res.kind).toBe("unsupported");
  });

  it("ignores a malformed stored id list instead of splitting it into characters", async () => {
    // `quote_inputs` is jsonb, so a legacy or hand-edited row can hold a bare
    // string where the id list and the adjustment list belong. Spreading a
    // string into a Set would persist one made-up id per character, and
    // iterating one as adjustments would price the booking at NaN.
    const { deps, updateBookingKiche } = makeDeps(
      manualBooking({
        quote_inputs: {
          ...FULL_MANUAL_QUOTE_INPUTS,
          enabledManualIds: "friends_family",
          customAdjustments: "goodwill",
        },
      }),
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "kiche",
      applied: true,
    });

    // 2500 −25% = 1875, plus the 500 travel line. Nothing from the junk.
    expect(res).toMatchObject({ kind: "success", newFinalCents: 2375 });
    expect(updateBookingKiche).toHaveBeenCalledWith(
      "bk-1",
      expect.objectContaining({
        final_cents: 2375,
        quote_inputs: expect.objectContaining({ enabledManualIds: ["kiche"] }),
      }),
    );
  });

  it("refuses to re-price against a stored config that no longer parses", async () => {
    // Legacy/hand-edited jsonb: the modifier list is there, so the toggle looks
    // supported, but the rates are nonsense. Re-pricing on it would invent a
    // total, so the money path stops instead.
    const { deps, updateBookingKiche } = makeDeps(
      manualBooking({
        quote_inputs: {
          config: {
            modifiers: [{ kind: "base_per_hour", cents: "lots" }],
            constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
          },
          hours: 1,
        },
      }),
    );

    const res = await setManualAppliedCore(deps, {
      bookingId: "bk-1",
      modifierId: "friends_family",
      applied: true,
    });

    expect(res.kind).toBe("error");
    expect(updateBookingKiche).not.toHaveBeenCalled();
  });
});
