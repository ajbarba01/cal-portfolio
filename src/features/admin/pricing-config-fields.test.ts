/**
 * Tests for pricingFields and fieldsToConfig.
 */

import { describe, expect, it } from "vitest";
import {
  pricingFields,
  fieldsToConfig,
  type PricingField,
} from "./pricing-config-fields";
import type {
  WalkConfig,
  HouseSittingConfig,
  CheckInConfig,
  TrainingConfig,
  MeetGreetConfig,
} from "@/features/pricing";

// ---------------------------------------------------------------------------
// pricingFields
// ---------------------------------------------------------------------------

describe("pricingFields — walk", () => {
  const cfg: WalkConfig = {
    rate_cents_per_hour: 4500,
    per_dog_cents: 1000,
    kiche_discount_pct: 15,
  };

  it("returns 3 fields in the expected order", () => {
    const fields = pricingFields("walk", cfg);
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.key)).toEqual([
      "rate_cents_per_hour",
      "per_dog_cents",
      "kiche_discount_pct",
    ]);
  });

  it("assigns correct kinds", () => {
    const fields = pricingFields("walk", cfg);
    expect(fields[0].kind).toBe("cents");
    expect(fields[1].kind).toBe("cents");
    expect(fields[2].kind).toBe("pct");
  });

  it("carries the config values", () => {
    const fields = pricingFields("walk", cfg);
    expect(fields[0].value).toBe(4500);
    expect(fields[1].value).toBe(1000);
    expect(fields[2].value).toBe(15);
  });

  it("has non-empty friendly labels", () => {
    const fields = pricingFields("walk", cfg);
    for (const f of fields) {
      expect(f.label.length).toBeGreaterThan(0);
    }
  });
});

describe("pricingFields — house_sitting", () => {
  const cfg: HouseSittingConfig = {
    base_dog_cents_per_night: 7500,
    base_cat_cents_per_night: 5000,
    extra_dog_cents_per_night: 1500,
    extra_cat_cents_per_night: 1000,
    cant_be_left_alone_cents_per_day: 2000,
    extra_walk_15min_cents_per_day: 500,
    holiday_cents_per_day: 3000,
    kiche_discount_pct: 10,
  };

  it("returns 8 fields", () => {
    expect(pricingFields("house_sitting", cfg)).toHaveLength(8);
  });

  it("has kiche_discount_pct as pct kind", () => {
    const fields = pricingFields("house_sitting", cfg);
    const kiche = fields.find((f) => f.key === "kiche_discount_pct");
    expect(kiche?.kind).toBe("pct");
  });

  it("all other fields are cents kind", () => {
    const fields = pricingFields("house_sitting", cfg);
    const nonPct = fields.filter((f) => f.key !== "kiche_discount_pct");
    for (const f of nonPct) {
      expect(f.kind).toBe("cents");
    }
  });
});

describe("pricingFields — check_in", () => {
  const cfg: CheckInConfig = { rate_cents_per_hour: 3000, minimum_cents: 5000 };

  it("returns 2 fields", () => {
    expect(pricingFields("check_in", cfg)).toHaveLength(2);
  });

  it("both are cents kind", () => {
    const fields = pricingFields("check_in", cfg);
    for (const f of fields) expect(f.kind).toBe("cents");
  });
});

describe("pricingFields — training", () => {
  const cfg: TrainingConfig = { rate_cents_per_hour: 6000 };

  it("returns 1 field of cents kind", () => {
    const fields = pricingFields("training", cfg);
    expect(fields).toHaveLength(1);
    expect(fields[0].kind).toBe("cents");
  });
});

describe("pricingFields — meet_greet", () => {
  it("returns empty array", () => {
    const cfg: MeetGreetConfig = {};
    expect(pricingFields("meet_greet", cfg)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fieldsToConfig
// ---------------------------------------------------------------------------

describe("fieldsToConfig — walk", () => {
  const cfg: WalkConfig = {
    rate_cents_per_hour: 4500,
    per_dog_cents: 1000,
    kiche_discount_pct: 15,
  };

  it("rebuilds config matching original", () => {
    const fields = pricingFields("walk", cfg);
    expect(fieldsToConfig("walk", fields, cfg)).toEqual(cfg);
  });

  it("reflects mutated field values", () => {
    const fields = pricingFields("walk", cfg);
    const mutated: PricingField[] = fields.map((f) =>
      f.key === "rate_cents_per_hour" ? { ...f, value: 5000 } : f,
    );
    const result = fieldsToConfig("walk", mutated, cfg);
    expect((result as WalkConfig).rate_cents_per_hour).toBe(5000);
  });
});

describe("fieldsToConfig — house_sitting round-trip", () => {
  const cfg: HouseSittingConfig = {
    base_dog_cents_per_night: 7500,
    base_cat_cents_per_night: 5000,
    extra_dog_cents_per_night: 1500,
    extra_cat_cents_per_night: 1000,
    cant_be_left_alone_cents_per_day: 2000,
    extra_walk_15min_cents_per_day: 500,
    holiday_cents_per_day: 3000,
    kiche_discount_pct: 10,
  };

  it("round-trips perfectly", () => {
    expect(
      fieldsToConfig("house_sitting", pricingFields("house_sitting", cfg), cfg),
    ).toEqual(cfg);
  });
});

describe("fieldsToConfig — check_in round-trip", () => {
  const cfg: CheckInConfig = { rate_cents_per_hour: 3000, minimum_cents: 5000 };

  it("round-trips perfectly", () => {
    expect(
      fieldsToConfig("check_in", pricingFields("check_in", cfg), cfg),
    ).toEqual(cfg);
  });
});

describe("fieldsToConfig — training round-trip", () => {
  const cfg: TrainingConfig = { rate_cents_per_hour: 6000 };

  it("round-trips perfectly", () => {
    expect(
      fieldsToConfig("training", pricingFields("training", cfg), cfg),
    ).toEqual(cfg);
  });
});

describe("fieldsToConfig — meet_greet round-trip", () => {
  it("returns empty config for meet_greet", () => {
    const cfg: MeetGreetConfig = {};
    expect(fieldsToConfig("meet_greet", [], cfg)).toEqual({});
  });
});

describe("fieldsToConfig — unknown-key pass-through", () => {
  it("preserves keys not in the known field set", () => {
    // Simulate a config that has an extra key not covered by schema
    const cfg = {
      rate_cents_per_hour: 3000,
      minimum_cents: 5000,
      future_key: 42,
    } as unknown as CheckInConfig;
    const fields = pricingFields("check_in", cfg);
    // fields only yields the 2 known keys; future_key should pass through
    const result = fieldsToConfig("check_in", fields, cfg) as Record<
      string,
      unknown
    >;
    expect(result.future_key).toBe(42);
  });
});
