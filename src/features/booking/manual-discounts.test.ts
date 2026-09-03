import { describe, it, expect } from "vitest";
import type {
  Modifier,
  QuoteInput,
  ServicePricingConfig,
} from "@/features/pricing";
import {
  manualDiscounts,
  quoteInputSupportsManual,
  withManualIds,
  toggleManualIds,
  requoteWithManual,
  manualOverpayRefundCents,
  manualDiscountPreview,
  manualDiscountRows,
  storedManualInputs,
  COMPLIMENTARY_ID,
} from "./manual-discounts";

/**
 * Walk config: $25/h base, a 10% auto discount, and the three manual discounts
 * the live configs carry — Kiche, Friends & Family and Complimentary. Travel
 * bills $1 a mile past the first five.
 */
const WALK_CONFIG: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    {
      kind: "pct_discount",
      id: "recurring",
      label: "Recurring discount",
      pct: 10,
      condition: "recurringSeries",
    },
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
      id: COMPLIMENTARY_ID,
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
};

/** A minimal walk QuoteInput: 1h, 1 dog, no travel unless a test adds miles. */
function walkInput(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    config: WALK_CONFIG,
    hours: 1,
    dogs: 1,
    enabledManualIds: [],
    ...over,
  };
}

describe("manualDiscounts", () => {
  it("lists every manual modifier with the label its config carries", () => {
    expect(manualDiscounts(WALK_CONFIG.modifiers)).toEqual([
      { id: "kiche", label: "Kiche discount (−25%)" },
      { id: "friends_family", label: "Friends & Family (−50%)" },
      { id: COMPLIMENTARY_ID, label: "Complimentary" },
    ]);
  });

  it("skips automatic discounts and non-discount modifiers", () => {
    const ids = manualDiscounts(WALK_CONFIG.modifiers).map((d) => d.id);
    expect(ids).not.toContain("recurring");
  });

  it("includes manual per-night toggles, not just percentage discounts", () => {
    const modifiers: Modifier[] = [
      {
        kind: "flat_per_night_toggle",
        id: "late_checkout",
        label: "Late checkout",
        cents: 1500,
        source: { kind: "condition", condition: "always" },
        manual: true,
      },
    ];
    expect(manualDiscounts(modifiers)).toEqual([
      { id: "late_checkout", label: "Late checkout" },
    ]);
  });
});

describe("quoteInputSupportsManual", () => {
  it("is true for a manual modifier the stored config declares", () => {
    expect(quoteInputSupportsManual(walkInput(), "kiche")).toBe(true);
    expect(quoteInputSupportsManual(walkInput(), "friends_family")).toBe(true);
  });

  it("is false for an automatic discount, an unknown id, or a malformed input", () => {
    expect(quoteInputSupportsManual(walkInput(), "recurring")).toBe(false);
    expect(quoteInputSupportsManual(walkInput(), "nope")).toBe(false);
    expect(quoteInputSupportsManual({}, "kiche")).toBe(false);
    expect(quoteInputSupportsManual(null, "kiche")).toBe(false);
  });
});

describe("toggleManualIds", () => {
  it("adds, removes and de-duplicates", () => {
    expect(toggleManualIds([], "kiche", true)).toEqual(["kiche"]);
    expect(toggleManualIds(["kiche"], "kiche", true)).toEqual(["kiche"]);
    expect(
      toggleManualIds(["kiche", "friends_family"], "kiche", false),
    ).toEqual(["friends_family"]);
    expect(toggleManualIds(undefined, "kiche", false)).toEqual([]);
  });
});

describe("storedManualInputs", () => {
  it("reads the ids and adjustments a stored quote carries", () => {
    expect(
      storedManualInputs({
        enabledManualIds: ["kiche", "friends_family"],
        customAdjustments: [{ label: "Goodwill", amountCents: 500 }],
      }),
    ).toEqual({
      enabledManualIds: ["kiche", "friends_family"],
      customAdjustments: [{ label: "Goodwill", amountCents: 500 }],
    });
  });

  it("contributes nothing for legacy or malformed jsonb", () => {
    for (const stored of [null, undefined, {}, { enabledManualIds: "kiche" }]) {
      expect(storedManualInputs(stored)).toEqual({
        enabledManualIds: [],
        customAdjustments: undefined,
      });
    }
  });

  it("drops non-string entries rather than passing them to the engine", () => {
    expect(
      storedManualInputs({ enabledManualIds: ["kiche", 7, null] })
        .enabledManualIds,
    ).toEqual(["kiche"]);
  });
});

describe("withManualIds", () => {
  it("keeps the booking's travel miles for an ordinary manual discount", () => {
    const applied = withManualIds(walkInput({ billableMiles: 10 }), [
      "friends_family",
    ]);
    expect(applied.billableMiles).toBe(10);
    expect(applied.enabledManualIds).toEqual(["friends_family"]);
  });

  it("zeroes travel miles when Complimentary is on", () => {
    const applied = withManualIds(walkInput({ billableMiles: 10 }), [
      COMPLIMENTARY_ID,
    ]);
    expect(applied.billableMiles).toBe(0);
  });
});

describe("requoteWithManual", () => {
  it("applies the discount line, lowering the total by the modifier pct", () => {
    // base = 2500 (1h); 25% off = 625 → 1875.
    const off = requoteWithManual(walkInput(), "kiche", false);
    const on = requoteWithManual(walkInput(), "kiche", true);
    expect(off.finalCents).toBe(2500);
    expect(on.finalCents).toBe(1875);
  });

  it("ignores the stored flag — the passed flag wins (idempotent re-quote)", () => {
    const stored = walkInput({ enabledManualIds: ["kiche"] });
    expect(requoteWithManual(stored, "kiche", false).finalCents).toBe(2500);
  });

  it("keeps a second manual discount that is already enabled", () => {
    // Manual discounts compound in config order: 2500 −25% = 1875, −50% = 937.
    const stored = walkInput({ enabledManualIds: ["friends_family"] });
    const both = requoteWithManual(stored, "kiche", true);
    expect(both.finalCents).toBe(937);
    expect(both.lines.map((line) => line.label)).toContain(
      "Friends & Family (−50%)",
    );
  });

  it("toggling an unknown id is a no-op on the total", () => {
    expect(requoteWithManual(walkInput(), "nonexistent", true).finalCents).toBe(
      2500,
    );
  });

  it("charges travel past the free allowance while a discount is applied", () => {
    // 10 miles − 5 free = 5 billable = 500, which no discount touches.
    const stored = walkInput({ billableMiles: 10 });
    expect(requoteWithManual(stored, "kiche", true).finalCents).toBe(
      1875 + 500,
    );
  });

  it("Complimentary totals exactly zero, travel included", () => {
    // Travel is the last quote phase and is never discounted, so a 100%
    // discount alone would still leave the 500-cent mileage line standing.
    const stored = walkInput({ billableMiles: 10 });
    const free = requoteWithManual(stored, COMPLIMENTARY_ID, true);
    expect(free.finalCents).toBe(0);
    expect(free.lines.some((line) => line.label === "Travel")).toBe(false);
  });

  it("restores travel when Complimentary is removed again", () => {
    const stored = walkInput({
      billableMiles: 10,
      enabledManualIds: [COMPLIMENTARY_ID],
    });
    expect(requoteWithManual(stored, COMPLIMENTARY_ID, false).finalCents).toBe(
      3000,
    );
  });
});

describe("manualOverpayRefundCents", () => {
  it("refunds the overpayment when the new total is lower than paid", () => {
    expect(manualOverpayRefundCents(2500, 1875)).toBe(625);
  });

  it("is 0 when nothing was overpaid (paid <= new total)", () => {
    expect(manualOverpayRefundCents(2500, 2500)).toBe(0);
    expect(manualOverpayRefundCents(1875, 2500)).toBe(0); // removed → owed, not refunded
    expect(manualOverpayRefundCents(0, 1875)).toBe(0); // unpaid booking
  });
});

describe("manualDiscountPreview", () => {
  it("builds the apply/remove preview from a valid stored quote", () => {
    const preview = manualDiscountPreview({
      quoteInputs: walkInput(),
      modifierId: "kiche",
      applied: false,
      currentFinalCents: 2500,
      paidCents: 0,
    });
    expect(preview).toEqual({
      id: "kiche",
      applied: false,
      currentFinalCents: 2500,
      toggledFinalCents: 1875,
      refundIfApplyCents: 0,
      paidCents: 0,
    });
  });

  it("computes the refund owed when applying to an already-paid booking", () => {
    const preview = manualDiscountPreview({
      quoteInputs: walkInput(),
      modifierId: "friends_family",
      applied: false,
      currentFinalCents: 2500,
      paidCents: 2500,
    });
    expect(preview?.refundIfApplyCents).toBe(1250);
  });

  it("returns null when the stored config declares no such manual modifier", () => {
    // Replaces the old per-pricing-type gate: the frozen config is the truth
    // about which discounts this booking can carry.
    expect(
      manualDiscountPreview({
        quoteInputs: walkInput(),
        modifierId: "off_leash",
        applied: false,
        currentFinalCents: 2500,
        paidCents: 0,
      }),
    ).toBeNull();
  });

  it("returns null when the stored quote cannot be re-priced (guards the edit page)", () => {
    // Seeded/legacy bookings can carry quote_inputs = {} or other malformed
    // jsonb. The preview must degrade to null so the admin edit page omits the
    // control instead of 500ing the whole page.
    for (const quoteInputs of [{}, { dogs: 1, hours: 1 }, null]) {
      expect(
        manualDiscountPreview({
          quoteInputs,
          modifierId: "kiche",
          applied: false,
          currentFinalCents: 0,
          paidCents: 0,
        }),
      ).toBeNull();
    }
  });
});

describe("manualDiscountRows", () => {
  /** The live config also offers an off-leash discount this booking predates. */
  const LIVE_MODIFIERS: Modifier[] = [
    ...WALK_CONFIG.modifiers,
    {
      kind: "pct_discount",
      id: "off_leash",
      label: "Off-leash discount (−15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
  ];

  function rowsFor(
    over: Partial<Parameters<typeof manualDiscountRows>[0]> = {},
  ) {
    return manualDiscountRows({
      modifiers: WALK_CONFIG.modifiers,
      quoteInputs: walkInput(),
      kicheApplied: false,
      kicheWelcome: true,
      currentFinalCents: 2500,
      paidCents: 0,
      ...over,
    });
  }

  it("builds one row per manual discount, labeled from the config", () => {
    expect(rowsFor()).toEqual([
      {
        id: "kiche",
        label: "Kiche discount (−25%)",
        applied: false,
        currentFinalCents: 2500,
        toggledFinalCents: 1875,
        refundIfApplyCents: 0,
        paidCents: 0,
      },
      {
        id: "friends_family",
        label: "Friends & Family (−50%)",
        applied: false,
        currentFinalCents: 2500,
        toggledFinalCents: 1250,
        refundIfApplyCents: 0,
        paidCents: 0,
      },
      {
        id: COMPLIMENTARY_ID,
        label: "Complimentary",
        applied: false,
        currentFinalCents: 2500,
        toggledFinalCents: 0,
        refundIfApplyCents: 0,
        paidCents: 0,
      },
    ]);
  });

  it("reads a non-Kiche discount's state from the stored id list", () => {
    const rows = rowsFor({
      quoteInputs: walkInput({ enabledManualIds: ["friends_family"] }),
      currentFinalCents: 1250,
    });
    expect(rows.map((row) => [row.id, row.applied])).toEqual([
      ["kiche", false],
      ["friends_family", true],
      [COMPLIMENTARY_ID, false],
    ]);
    // Removing it re-quotes back to the undiscounted total.
    expect(rows[1]?.toggledFinalCents).toBe(2500);
  });

  it("reads Kiche's state from its own column", () => {
    // Kiche predates the id list and still lives in `kiche_applied`, so a
    // booking discounted before that column moved must not read as off.
    const rows = rowsFor({ kicheApplied: true, currentFinalCents: 1875 });
    expect(rows[0]).toMatchObject({ id: "kiche", applied: true });
  });

  it("omits Kiche until the client has marked it welcome", () => {
    const ids = rowsFor({ kicheWelcome: false }).map((row) => row.id);
    expect(ids).toEqual(["friends_family", COMPLIMENTARY_ID]);
  });

  it("omits a discount the booking's frozen quote does not carry", () => {
    // The service gained off-leash after this booking froze its config, so
    // applying it would be refused — the switch is never offered.
    const ids = rowsFor({ modifiers: LIVE_MODIFIERS }).map((row) => row.id);
    expect(ids).not.toContain("off_leash");
  });

  it("offers nothing for a booking whose stored quote cannot be re-priced", () => {
    expect(rowsFor({ quoteInputs: {} })).toEqual([]);
  });

  it("carries the refund each apply would issue on a paid booking", () => {
    const rows = rowsFor({ paidCents: 2500 });
    expect(rows.map((row) => row.refundIfApplyCents)).toEqual([
      625, 1250, 2500,
    ]);
  });
});
