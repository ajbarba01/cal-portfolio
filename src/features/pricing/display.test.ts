/**
 * Unit tests for pricing display helpers.
 * Pure — no IO, no DB.
 */

import { describe, it, expect } from "vitest";
import { formatCents, headlineRate } from "./display";
import type {
  HouseSittingConfig,
  CheckInConfig,
  WalkConfig,
  TrainingConfig,
  MeetGreetConfig,
} from "./types";

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formats whole dollars without decimal", () => {
    expect(formatCents(5000)).toBe("$50");
    expect(formatCents(100)).toBe("$1");
    expect(formatCents(0)).toBe("$0");
    expect(formatCents(10000)).toBe("$100");
  });

  it("formats fractional amounts with two decimals", () => {
    expect(formatCents(5050)).toBe("$50.50");
    expect(formatCents(1)).toBe("$0.01");
    expect(formatCents(99)).toBe("$0.99");
  });
});

// ---------------------------------------------------------------------------
// headlineRate
// ---------------------------------------------------------------------------

const houseSittingConfig: HouseSittingConfig = {
  base_dog_cents_per_night: 5000,
  base_cat_cents_per_night: 4000,
  extra_dog_cents_per_night: 1500,
  extra_cat_cents_per_night: 1000,
  cant_be_left_alone_cents_per_day: 2000,
  extra_walk_15min_cents_per_day: 500,
  holiday_cents_per_day: 1500,
  kiche_discount_pct: 10,
};

const checkInConfig: CheckInConfig = {
  rate_cents_per_hour: 3000,
  minimum_cents: 1500,
};

const walkConfig: WalkConfig = {
  rate_cents_per_hour: 2500,
  per_dog_cents: 500,
  kiche_discount_pct: 10,
};

const trainingConfig: TrainingConfig = {
  rate_cents_per_hour: 3500,
};

describe("headlineRate", () => {
  it("house_sitting: uses base_dog_cents_per_night with 'from' prefix", () => {
    expect(headlineRate("house_sitting", houseSittingConfig)).toBe(
      "from $50 / night",
    );
  });

  it("check_in: uses rate_cents_per_hour", () => {
    expect(headlineRate("check_in", checkInConfig)).toBe("$30 / hour");
  });

  it("walk: uses rate_cents_per_hour", () => {
    expect(headlineRate("walk", walkConfig)).toBe("$25 / hour");
  });

  it("training: uses rate_cents_per_hour", () => {
    expect(headlineRate("training", trainingConfig)).toBe("$35 / hour");
  });

  it("house_sitting: reflects config values (different rate)", () => {
    const cfg: HouseSittingConfig = {
      ...houseSittingConfig,
      base_dog_cents_per_night: 6500,
    };
    expect(headlineRate("house_sitting", cfg)).toBe("from $65 / night");
  });

  it("check_in: reflects fractional rate", () => {
    const cfg: CheckInConfig = { rate_cents_per_hour: 3250, minimum_cents: 0 };
    expect(headlineRate("check_in", cfg)).toBe("$32.50 / hour");
  });

  it("meet_greet headline rate is Free", () => {
    expect(headlineRate("meet_greet", {} as MeetGreetConfig)).toBe("Free");
  });
});
