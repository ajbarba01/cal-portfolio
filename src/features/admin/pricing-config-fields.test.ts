import { describe, expect, it } from "vitest";
import {
  deriveEditableFields,
  setLeaf,
  validateEditableFields,
} from "./pricing-config-fields";
import type { ServicePricingConfig } from "@/features/pricing";

const WALK: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "tiered_per_unit", unit: "dog", tiers: [{ from: 2, pct: 50 }] },
    {
      kind: "per_hour_addon",
      id: "leash_manners",
      label: "Leash manners (+$10/h)",
      cents: 1000,
      optIn: true,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (-15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const HOUSE_SIT: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home",
      cents: -2500,
      source: { kind: "condition", condition: "noDogs" },
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
  ],
  constraints: {
    intervalMin: 15,
    allowedSpecies: ["dog", "cat", "bird"],
    softDistanceWarnMiles: 15,
  },
};

const MEET_GREET: ServicePricingConfig = {
  modifiers: [],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

describe("deriveEditableFields — modifier value leaves", () => {
  it("emits the base rate as a cents field addressed by index", () => {
    const fields = deriveEditableFields(WALK);
    const base = fields.find((f) => f.path === "m.0.cents");
    expect(base).toMatchObject({ kind: "cents", value: 2500, group: "rates" });
  });

  it("emits a tier pct leaf addressed by tier index", () => {
    const fields = deriveEditableFields(WALK);
    const tier = fields.find((f) => f.path === "m.1.tiers.0.pct");
    expect(tier).toMatchObject({ kind: "pct", value: 50, min: 0, max: 100 });
  });

  it("emits both leaves of allowance_then_per_unit", () => {
    const fields = deriveEditableFields(WALK);
    expect(fields.find((f) => f.path === "m.3.freeUnits")).toMatchObject({
      kind: "int",
      value: 5,
    });
    expect(fields.find((f) => f.path === "m.3.cents")).toMatchObject({
      kind: "cents",
      value: 200,
    });
  });

  it("marks discount cents as allowNegative", () => {
    const fields = deriveEditableFields(HOUSE_SIT);
    const catOnly = fields.find((f) => f.path === "m.1.cents");
    expect(catOnly).toMatchObject({ value: -2500, allowNegative: true });
    const catFlat = fields.find((f) => f.path === "m.2.cents");
    expect(catFlat?.allowNegative).toBe(true);
  });

  it("never emits structure/identity as a field", () => {
    const paths = deriveEditableFields(WALK).map((f) => f.path);
    expect(paths.some((p) => p.endsWith(".from"))).toBe(false);
    expect(paths).not.toContain("m.0.kind");
  });
});

describe("deriveEditableFields — constraints", () => {
  it("emits present numeric constraints in the limits group", () => {
    const fields = deriveEditableFields(WALK).filter(
      (f) => f.group === "limits",
    );
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f]));
    expect(byPath["c.intervalMin"]).toMatchObject({ value: 15, min: 1 });
    expect(byPath["c.minDurationMin"]).toMatchObject({ value: 30 });
    expect(byPath["c.maxDurationMin"]).toMatchObject({ value: 180 });
    expect(byPath["c.maxDogs"]).toMatchObject({ value: 2, min: 1 });
  });

  it("omits absent constraints (no maxDogs / durations on house-sit)", () => {
    const paths = deriveEditableFields(HOUSE_SIT).map((f) => f.path);
    expect(paths).not.toContain("c.maxDogs");
    expect(paths).not.toContain("c.minDurationMin");
    expect(paths).toContain("c.softDistanceWarnMiles");
  });

  it("meet_greet yields no rate fields", () => {
    const fields = deriveEditableFields(MEET_GREET);
    expect(fields.filter((f) => f.group === "rates")).toHaveLength(0);
  });
});

describe("setLeaf — immutable single-leaf updates", () => {
  it("updates a modifier cents leaf without mutating the input", () => {
    const next = setLeaf(WALK, "m.0.cents", 3000);
    expect((next.modifiers[0] as { cents: number }).cents).toBe(3000);
    expect((WALK.modifiers[0] as { cents: number }).cents).toBe(2500);
  });

  it("rounds cents but keeps pct as entered", () => {
    expect(
      (setLeaf(WALK, "m.0.cents", 2999.6).modifiers[0] as { cents: number })
        .cents,
    ).toBe(3000);
    const tierMod = setLeaf(WALK, "m.1.tiers.0.pct", 40).modifiers[1] as {
      tiers: { pct: number }[];
    };
    expect(tierMod.tiers[0].pct).toBe(40);
  });

  it("updates a constraint leaf", () => {
    expect(setLeaf(WALK, "c.maxDogs", 3).constraints.maxDogs).toBe(3);
  });

  it("preserves ids/sources/structure of untouched modifiers", () => {
    const next = setLeaf(HOUSE_SIT, "m.0.cents", 7000);
    expect(next.modifiers[1]).toEqual(HOUSE_SIT.modifiers[1]);
  });

  it("throws on an unknown path", () => {
    expect(() => setLeaf(WALK, "m.0.bogus", 1)).toThrow();
    expect(() => setLeaf(WALK, "x.y", 1)).toThrow();
  });
});

describe("validateEditableFields", () => {
  it("returns no errors for a valid config", () => {
    expect(validateEditableFields(WALK, 60)).toEqual({});
  });

  it("flags below-min values", () => {
    const bad = setLeaf(WALK, "c.maxDogs", 0);
    expect(validateEditableFields(bad, 60)["c.maxDogs"]).toBeDefined();
  });

  it("flags min duration greater than max duration", () => {
    const bad = setLeaf(WALK, "c.minDurationMin", 200);
    expect(validateEditableFields(bad, 60)["c.maxDurationMin"]).toBeDefined();
  });

  it("flags a NaN value (empty input)", () => {
    const bad = setLeaf(WALK, "m.0.cents", NaN);
    expect(validateEditableFields(bad, 60)["m.0.cents"]).toBeDefined();
  });

  it("flags a missing/too-small default duration", () => {
    expect(
      validateEditableFields(WALK, null)["col.defaultDurationMin"],
    ).toBeDefined();
    expect(
      validateEditableFields(WALK, 0)["col.defaultDurationMin"],
    ).toBeDefined();
  });
});
