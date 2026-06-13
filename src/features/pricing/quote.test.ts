import { describe, it, expect } from "vitest";
import { quote } from "./quote";
import type {
  HouseSittingConfig,
  CheckInConfig,
  WalkConfig,
  TrainingConfig,
  MeetGreetConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Seeded configs (from supabase/migrations/20260529205144_seed.sql)
// ---------------------------------------------------------------------------

const HS_CFG: HouseSittingConfig = {
  base_dog_cents_per_night: 5000,
  base_cat_cents_per_night: 3000,
  extra_dog_cents_per_night: 1500,
  extra_cat_cents_per_night: 1000,
  cant_be_left_alone_cents_per_day: 1000,
  extra_walk_15min_cents_per_day: 500,
  holiday_cents_per_day: 1000,
  kiche_discount_pct: 20,
};

const CI_CFG: CheckInConfig = {
  rate_cents_per_hour: 3000,
  minimum_cents: 1500,
};

const WALK_CFG: WalkConfig = {
  rate_cents_per_hour: 2500,
  per_dog_cents: 1000,
  kiche_discount_pct: 25,
};

const TRAIN_CFG: TrainingConfig = {
  rate_cents_per_hour: 3500,
};

/** No discounts, no travel — base modifier state. */
const NO_MODIFIERS = {
  roundTripDriveMinutes: undefined,
  recurringDiscountApplies: false,
  recurringDiscountPct: 10,
  applyKiche: false,
} as const;

// ---------------------------------------------------------------------------
// house_sitting
// ---------------------------------------------------------------------------

describe("quote house_sitting", () => {
  it("worked example 1: 1 dog + 1 cat, 1 night → 6000 cents", () => {
    // base_dog(5000) + extra_cat(1000) = 6000 per night × 1 = 6000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 1,
      nights: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(6000);
  });

  it("worked example 2: 2 dogs + 1 cat, 2 nights → 15000 cents", () => {
    // per night: base_dog(5000) + extra_dog(1500) + extra_cat(1000) = 7500
    // × 2 nights = 15000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 2,
      cats: 1,
      nights: 2,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(15000);
  });

  it("cat-only base: 0 dogs + 1 cat, 1 night → 3000 cents", () => {
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 0,
      cats: 1,
      nights: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3000);
  });

  it("cat-only base: 0 dogs + 2 cats, 1 night → 4000 cents", () => {
    // base_cat(3000) + extra_cat(1000) = 4000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 0,
      cats: 2,
      nights: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(4000);
  });

  it("no pets: 0 dogs + 0 cats, 1 night → 0 cents", () => {
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 0,
      cats: 0,
      nights: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(0);
  });

  it("fractional nights: 1 dog, 0.5 nights → 2500 cents", () => {
    // base_dog(5000) × 0.5 = 2500
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 0.5,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(2500);
  });

  it("cantBeLeftAlone add-on: 1 dog, 1 night, 1 cant-be-left-alone day → 6000 cents", () => {
    // base_dog(5000) × 1 night = 5000
    // + cant_be_left_alone(1000) × 1 day = 1000
    // total = 6000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      cantBeLeftAloneDays: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(6000);
  });

  it("extraWalk add-on: 1 dog, 1 night, 75 min/day (2 extra blocks) × 1 day → 6000 cents", () => {
    // base_dog(5000) × 1 night = 5000
    // walkMinutesPerDay=75: extraBlocks = ceil((75-45)/15) = 2
    // + extra_walk_15min(500) × 2 blocks × 1 day = 1000
    // total = 6000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      walkMinutesPerDay: 75,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(6000);
  });

  it("walkMinutesPerDay <= 45: no walk add-on line (0 extra blocks)", () => {
    // 45 min/day is the included amount; no extra charge
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      walkMinutesPerDay: 45,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(5000); // base only, no walk add-on
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("walk")),
    ).toBeUndefined();
  });

  it("walkMinutesPerDay = 60: 1 extra block/day → base + 500 for 1 night", () => {
    // extraBlocks = ceil((60-45)/15) = ceil(1) = 1
    // 5000 + 500*1*1 = 5500
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      walkMinutesPerDay: 60,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(5500);
  });

  it("walkMinutesPerDay = 75: 2 extra blocks/day → base + 1000 for 1 night", () => {
    // extraBlocks = ceil((75-45)/15) = ceil(2) = 2
    // 5000 + 500*2*1 = 6000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      walkMinutesPerDay: 75,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(6000);
  });

  it("holidayDays add-on: 1 dog, 2 nights, 1 holiday day → 11000 cents", () => {
    // base_dog(5000) × 2 nights = 10000
    // + holiday(1000) × 1 day = 1000
    // total = 11000
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 2,
      holidayDays: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(11000);
  });

  it("breakdown has labelled lines for each charge", () => {
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 1,
      nights: 1,
      ...NO_MODIFIERS,
    });
    const labels = result.lines.map((l) => l.label);
    expect(labels).toContain("House sitting base (1 night)");
    expect(labels).toContain("Extra cat (1)");
  });

  it("house_sitting travel defaults to 0 even when roundTripDriveMinutes provided", () => {
    // DESIGN: house_sitting travel = config-gated, default OFF
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 0,
      nights: 1,
      roundTripDriveMinutes: 60,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    const travelLine = result.lines.find((l) => l.label === "Travel");
    expect(travelLine).toBeUndefined();
    expect(result.finalCents).toBe(5000);
  });

  it("table-driven: per-night subtotal variants", () => {
    const cases: Array<{
      dogs: number;
      cats: number;
      nights: number;
      expected: number;
    }> = [
      // 1 dog only
      { dogs: 1, cats: 0, nights: 1, expected: 5000 },
      // 2 dogs only: 5000 + 1500 = 6500/night × 1
      { dogs: 2, cats: 0, nights: 1, expected: 6500 },
      // 3 dogs only: 5000 + 2*1500 = 8000/night × 1
      { dogs: 3, cats: 0, nights: 1, expected: 8000 },
      // 1 dog + 2 cats: 5000 + 2*1000 = 7000/night × 1
      { dogs: 1, cats: 2, nights: 1, expected: 7000 },
      // 2 cats (cat-only): 3000 + 1000 = 4000/night × 1
      { dogs: 0, cats: 2, nights: 1, expected: 4000 },
      // 1 dog + 1 cat × 3 nights: 6000/night × 3
      { dogs: 1, cats: 1, nights: 3, expected: 18000 },
    ];

    for (const { dogs, cats, nights, expected } of cases) {
      const result = quote({
        pricingType: "house_sitting",
        pricingConfig: HS_CFG,
        dogs,
        cats,
        nights,
        ...NO_MODIFIERS,
      });
      expect(
        result.finalCents,
        `dogs=${dogs} cats=${cats} nights=${nights}`,
      ).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// check_in
// ---------------------------------------------------------------------------

describe("quote check_in", () => {
  it("minimum applies for short duration: 0.5h → 1500 cents", () => {
    // 0.5 * 3000 = 1500 = minimum_cents → max(1500, 1500) = 1500
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 0.5,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(1500);
  });

  it("rate exceeds minimum for 1h: → 3000 cents", () => {
    // 1 * 3000 = 3000 > 1500
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3000);
  });

  it("minimum applies for 0.25h → 1500 cents", () => {
    // 0.25 * 3000 = 750 < 1500 → clamped to 1500
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 0.25,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(1500);
  });

  it("table-driven: various hours", () => {
    const cases: Array<{ hours: number; expected: number }> = [
      { hours: 0.25, expected: 1500 }, // minimum
      { hours: 0.5, expected: 1500 }, // exactly at minimum
      { hours: 1, expected: 3000 },
      { hours: 1.5, expected: 4500 },
      { hours: 2, expected: 6000 },
    ];
    for (const { hours, expected } of cases) {
      const result = quote({
        pricingType: "check_in",
        pricingConfig: CI_CFG,
        hours,
        ...NO_MODIFIERS,
      });
      expect(result.finalCents, `hours=${hours}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

describe("quote walk", () => {
  it("worked example: 1h + 2 dogs → 4500 cents", () => {
    // 1 * 2500 + 2 * 1000 = 2500 + 2000 = 4500
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 2,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(4500);
  });

  it("1h + 1 dog → 3500 cents", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3500);
  });

  it("table-driven: various hours and dog counts", () => {
    const cases: Array<{ hours: number; dogs: number; expected: number }> = [
      { hours: 0.5, dogs: 1, expected: Math.round(0.5 * 2500) + 1000 }, // 1250 + 1000 = 2250
      { hours: 1, dogs: 1, expected: 3500 },
      { hours: 1, dogs: 2, expected: 4500 },
      { hours: 1.5, dogs: 1, expected: Math.round(1.5 * 2500) + 1000 }, // 3750 + 1000 = 4750
      { hours: 2, dogs: 3, expected: 5000 + 3000 }, // 2*2500 + 3*1000 = 8000
    ];
    for (const { hours, dogs, expected } of cases) {
      const result = quote({
        pricingType: "walk",
        pricingConfig: WALK_CFG,
        hours,
        dogs,
        ...NO_MODIFIERS,
      });
      expect(result.finalCents, `hours=${hours} dogs=${dogs}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// training
// ---------------------------------------------------------------------------

describe("quote training", () => {
  it("worked example: 1h → 3500 cents", () => {
    const result = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3500);
  });

  it("table-driven: various hours", () => {
    const cases: Array<{ hours: number; expected: number }> = [
      { hours: 0.5, expected: Math.round(0.5 * 3500) }, // 1750
      { hours: 1, expected: 3500 },
      { hours: 1.5, expected: Math.round(1.5 * 3500) }, // 5250
      { hours: 2, expected: 7000 },
    ];
    for (const { hours, expected } of cases) {
      const result = quote({
        pricingType: "training",
        pricingConfig: TRAIN_CFG,
        hours,
        ...NO_MODIFIERS,
      });
      expect(result.finalCents, `hours=${hours}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// meet_greet
// ---------------------------------------------------------------------------

describe("quote meet_greet", () => {
  it("meet_greet quote is free with no lines", () => {
    const result = quote({
      pricingType: "meet_greet",
      pricingConfig: {} as MeetGreetConfig,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result).toEqual({ lines: [], finalCents: 0 });
  });
});

// ---------------------------------------------------------------------------
// Premium day surcharge — hourly services
// ---------------------------------------------------------------------------

describe("quote hourly — premium day surcharge", () => {
  it("walk with holidayDays:1 adds a 'Premium day' line at holiday_cents_per_day", () => {
    // 1h walk + 1 dog = 2500 + 1000 = 3500 base
    // + 1 premium day × 1000 = 1000
    // total = 4500
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      holidayDays: 1,
      holidaySurchargeCents: 1000,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(4500);
    const premiumLine = result.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(premiumLine!.amountCents).toBe(1000);
  });

  it("walk with holidayDays:0 — no premium line", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      holidayDays: 0,
      holidaySurchargeCents: 1000,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3500);
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("premium")),
    ).toBeUndefined();
  });

  it("walk with holidayDays absent — no premium line", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3500);
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("premium")),
    ).toBeUndefined();
  });

  it("check_in with holidayDays:1 adds premium line", () => {
    // 1h × 3000 = 3000 base + 1000 premium = 4000
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      holidayDays: 1,
      holidaySurchargeCents: 1000,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(4000);
    const premiumLine = result.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(premiumLine!.amountCents).toBe(1000);
  });

  it("check_in with holidayDays:0 — no premium line", () => {
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      holidayDays: 0,
      holidaySurchargeCents: 1000,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(3000);
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("premium")),
    ).toBeUndefined();
  });

  it("training with holidayDays:1 adds premium line", () => {
    // 1h × 3500 = 3500 base + 1000 premium = 4500
    const result = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      holidayDays: 1,
      holidaySurchargeCents: 1000,
      ...NO_MODIFIERS,
    });
    expect(result.finalCents).toBe(4500);
    const premiumLine = result.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(premiumLine!.amountCents).toBe(1000);
  });

  it("meet_greet with holidayDays:1 remains free — no surcharge ever", () => {
    const result = quote({
      pricingType: "meet_greet",
      pricingConfig: {} as MeetGreetConfig,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result).toEqual({ lines: [], finalCents: 0 });
  });
});

// ---------------------------------------------------------------------------
// Modifier: Travel (hourly services only)
// ---------------------------------------------------------------------------

describe("quote modifiers: travel", () => {
  it("check_in: 60 min round-trip at $30/h adds 3000 cents", () => {
    // 60/60 * 3000 = 3000
    const base = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      ...NO_MODIFIERS,
    });
    const withTravel = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      roundTripDriveMinutes: 60,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(withTravel.finalCents).toBe(base.finalCents + 3000);
  });

  it("walk: 30 min round-trip at $25/h adds 1250 cents", () => {
    // Math.round(30/60 * 2500) = Math.round(1250) = 1250
    const base = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      ...NO_MODIFIERS,
    });
    const withTravel = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: 30,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(withTravel.finalCents).toBe(base.finalCents + 1250);
  });

  it("training: 45 min round-trip at $35/h adds 2625 cents", () => {
    // Math.round(45/60 * 3500) = Math.round(2625) = 2625
    const base = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      ...NO_MODIFIERS,
    });
    const withTravel = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      roundTripDriveMinutes: 45,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(withTravel.finalCents).toBe(base.finalCents + 2625);
  });

  it("travel line appears with label 'Travel'", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: 30,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    const travelLine = result.lines.find((l) => l.label === "Travel");
    expect(travelLine).toBeDefined();
    expect(travelLine?.amountCents).toBe(1250);
  });

  it("no travel line when roundTripDriveMinutes is 0", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: 0,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result.lines.find((l) => l.label === "Travel")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Modifier: Recurring discount
// ---------------------------------------------------------------------------

describe("quote modifiers: recurring discount", () => {
  it("walk: −10% recurring discount on 1h + 1 dog (3500 base)", () => {
    // base = 3500; discount = round(3500 * 0.10) = 350 → finalCents = 3150
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result.finalCents).toBe(3150);
    const discountLine = result.lines.find((l) =>
      l.label.toLowerCase().includes("recurring"),
    );
    expect(discountLine?.amountCents).toBe(-350);
  });

  it("check_in: −10% recurring discount on 1h (3000 base)", () => {
    // base = 3000; discount = 300 → finalCents = 2700
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result.finalCents).toBe(2700);
  });

  it("training: −10% recurring on 1h (3500 base) → 3150", () => {
    const result = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result.finalCents).toBe(3150);
  });

  it("no recurring line when recurringDiscountApplies is false", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      ...NO_MODIFIERS,
    });
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("recurring")),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Modifier: Kiche discount
// ---------------------------------------------------------------------------

describe("quote modifiers: kiche discount", () => {
  it("walk: applyKiche reads 25% from WALK_CFG on 1h + 1 dog (3500 base) → 2625", () => {
    // kiche pct comes from WALK_CFG.kiche_discount_pct = 25
    // kiche = round(3500 * 0.25) = 875 → finalCents = 2625
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    expect(result.finalCents).toBe(2625);
    const kicheLine = result.lines.find((l) =>
      l.label.toLowerCase().includes("kiche"),
    );
    expect(kicheLine?.amountCents).toBe(-875);
  });

  it("house_sitting: applyKiche reads 20% from HS_CFG on 1 dog + 1 cat, 1 night (6000 base) → 4800", () => {
    // kiche pct comes from HS_CFG.kiche_discount_pct = 20
    // kiche = round(6000 * 0.20) = 1200 → finalCents = 4800
    const result = quote({
      pricingType: "house_sitting",
      pricingConfig: HS_CFG,
      dogs: 1,
      cats: 1,
      nights: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    expect(result.finalCents).toBe(4800);
  });

  it("kiche line absent when applyKiche is false", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      ...NO_MODIFIERS,
    });
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("kiche")),
    ).toBeUndefined();
  });

  it("check_in: applyKiche=true applies no kiche line (no kiche_discount_pct in config)", () => {
    // check_in config has no kiche_discount_pct; applyKiche=true → no kiche line
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("kiche")),
    ).toBeUndefined();
    expect(result.finalCents).toBe(3000);
  });

  it("training: applyKiche=true applies no kiche line (no kiche_discount_pct in config)", () => {
    // training config has no kiche_discount_pct; applyKiche=true → no kiche line
    const result = quote({
      pricingType: "training",
      pricingConfig: TRAIN_CFG,
      hours: 1,
      roundTripDriveMinutes: undefined,
      recurringDiscountApplies: false,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    expect(
      result.lines.find((l) => l.label.toLowerCase().includes("kiche")),
    ).toBeUndefined();
    expect(result.finalCents).toBe(3500);
  });
});

// ---------------------------------------------------------------------------
// Computation order: base → travel → recurring → kiche (interaction test)
// ---------------------------------------------------------------------------

describe("quote modifiers: computation order", () => {
  it("walk: travel + recurring + kiche applied in correct order", () => {
    // 1h walk + 1 dog
    // base = 2500 + 1000 = 3500
    // travel: 60 min round-trip → round(60/60 * 2500) = 2500; subtotal = 6000
    // recurring −10%: round(6000 * 0.10) = 600; subtotal = 5400
    // kiche −25% (from WALK_CFG.kiche_discount_pct): round(5400 * 0.25) = 1350; finalCents = 4050
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 1,
      roundTripDriveMinutes: 60,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    expect(result.finalCents).toBe(4050);

    const lines = result.lines;
    // Verify all four line types present
    expect(
      lines.some((l) => l.amountCents > 0 && l.label.includes("Walk")),
    ).toBe(true);
    expect(lines.some((l) => l.label === "Travel")).toBe(true);
    expect(lines.some((l) => l.label.toLowerCase().includes("recurring"))).toBe(
      true,
    );
    expect(lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      true,
    );
  });

  it("check_in: recurring applied after travel, kiche applied after recurring", () => {
    // 1h check_in, 30 min round-trip
    // base = 3000
    // travel = round(30/60 * 3000) = 1500; subtotal = 4500
    // recurring −10%: round(4500 * 0.10) = 450; subtotal = 4050
    // no kiche (check_in has no kiche_discount_pct)
    const result = quote({
      pricingType: "check_in",
      pricingConfig: CI_CFG,
      hours: 1,
      roundTripDriveMinutes: 30,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: false,
    });
    expect(result.finalCents).toBe(4050);
  });

  it("finalCents equals sum of all line amountCents", () => {
    const result = quote({
      pricingType: "walk",
      pricingConfig: WALK_CFG,
      hours: 1,
      dogs: 2,
      roundTripDriveMinutes: 60,
      recurringDiscountApplies: true,
      recurringDiscountPct: 10,
      applyKiche: true,
    });
    const summed = result.lines.reduce((acc, l) => acc + l.amountCents, 0);
    expect(result.finalCents).toBe(summed);
  });
});
