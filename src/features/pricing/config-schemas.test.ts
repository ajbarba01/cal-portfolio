import { describe, it, expect } from "vitest";
import { parsePricingConfig } from "./config-schemas";

// ---------------------------------------------------------------------------
// Seeded configs (values from supabase/migrations/20260529205144_seed.sql)
// ---------------------------------------------------------------------------

const SEEDED_HOUSE_SITTING = {
  base_dog_cents_per_night: 5000,
  base_cat_cents_per_night: 3000,
  extra_dog_cents_per_night: 1500,
  extra_cat_cents_per_night: 1000,
  cant_be_left_alone_cents_per_day: 1000,
  extra_walk_15min_cents_per_day: 500,
  holiday_cents_per_day: 1000,
  kiche_discount_pct: 20,
};

const SEEDED_CHECK_IN = {
  rate_cents_per_hour: 3000,
  minimum_cents: 1500,
};

const SEEDED_WALK = {
  rate_cents_per_hour: 2500,
  per_dog_cents: 1000,
  kiche_discount_pct: 25,
};

const SEEDED_TRAINING = {
  rate_cents_per_hour: 3500,
};

// ---------------------------------------------------------------------------
// house_sitting
// ---------------------------------------------------------------------------

describe("parsePricingConfig house_sitting", () => {
  it("parses the seeded config without error", () => {
    expect(() =>
      parsePricingConfig("house_sitting", SEEDED_HOUSE_SITTING),
    ).not.toThrow();
  });

  it("returns the correct typed config", () => {
    const cfg = parsePricingConfig("house_sitting", SEEDED_HOUSE_SITTING);
    expect(cfg).toEqual(SEEDED_HOUSE_SITTING);
  });

  it("throws when a required key is missing", () => {
    const { base_dog_cents_per_night: _omitted, ...rest } =
      SEEDED_HOUSE_SITTING;
    expect(() => parsePricingConfig("house_sitting", rest)).toThrow();
  });

  it("throws when a value is negative", () => {
    expect(() =>
      parsePricingConfig("house_sitting", {
        ...SEEDED_HOUSE_SITTING,
        base_dog_cents_per_night: -1,
      }),
    ).toThrow();
  });

  it("throws when a value is not a number", () => {
    expect(() =>
      parsePricingConfig("house_sitting", {
        ...SEEDED_HOUSE_SITTING,
        holiday_cents_per_day: "1000",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// check_in
// ---------------------------------------------------------------------------

describe("parsePricingConfig check_in", () => {
  it("parses the seeded config without error", () => {
    expect(() => parsePricingConfig("check_in", SEEDED_CHECK_IN)).not.toThrow();
  });

  it("returns the correct typed config", () => {
    const cfg = parsePricingConfig("check_in", SEEDED_CHECK_IN);
    expect(cfg).toEqual(SEEDED_CHECK_IN);
  });

  it("throws when minimum_cents is missing", () => {
    const { minimum_cents: _omitted, ...rest } = SEEDED_CHECK_IN;
    expect(() => parsePricingConfig("check_in", rest)).toThrow();
  });

  it("throws when rate_cents_per_hour is negative", () => {
    expect(() =>
      parsePricingConfig("check_in", {
        ...SEEDED_CHECK_IN,
        rate_cents_per_hour: -100,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

describe("parsePricingConfig walk", () => {
  it("parses the seeded config without error", () => {
    expect(() => parsePricingConfig("walk", SEEDED_WALK)).not.toThrow();
  });

  it("returns the correct typed config", () => {
    const cfg = parsePricingConfig("walk", SEEDED_WALK);
    expect(cfg).toEqual(SEEDED_WALK);
  });

  it("throws when per_dog_cents is missing", () => {
    const { per_dog_cents: _omitted, ...rest } = SEEDED_WALK;
    expect(() => parsePricingConfig("walk", rest)).toThrow();
  });

  it("throws when kiche_discount_pct is negative", () => {
    expect(() =>
      parsePricingConfig("walk", {
        ...SEEDED_WALK,
        kiche_discount_pct: -5,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// meet_greet
// ---------------------------------------------------------------------------

describe("parsePricingConfig meet_greet", () => {
  it("meet_greet config is an empty object", () => {
    expect(parsePricingConfig("meet_greet", {})).toEqual({});
  });

  it("throws when unexpected keys are present (strict schema)", () => {
    expect(() => parsePricingConfig("meet_greet", { rate: 100 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// training
// ---------------------------------------------------------------------------

describe("parsePricingConfig training", () => {
  it("parses the seeded config without error", () => {
    expect(() => parsePricingConfig("training", SEEDED_TRAINING)).not.toThrow();
  });

  it("returns the correct typed config", () => {
    const cfg = parsePricingConfig("training", SEEDED_TRAINING);
    expect(cfg).toEqual(SEEDED_TRAINING);
  });

  it("throws when rate_cents_per_hour is missing", () => {
    expect(() => parsePricingConfig("training", {})).toThrow();
  });

  it("throws when rate_cents_per_hour is negative", () => {
    expect(() =>
      parsePricingConfig("training", { rate_cents_per_hour: -1 }),
    ).toThrow();
  });
});
