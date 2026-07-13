import { describe, it, expect } from "vitest";
import { describeModifier } from "./term-descriptions";
import type { Modifier } from "./modifier-types";

describe("describeModifier", () => {
  it("defines the premium (holiday) surcharge by its condition, not its admin label", () => {
    const mod: Modifier = {
      kind: "pct_surcharge",
      id: "whatever-admin-typed",
      label: "Premium night",
      pct: 25,
      scope: "perPremiumNight",
      condition: "premiumDays",
    };
    expect(describeModifier(mod)).toMatch(/holiday/i);
  });

  it("defines the needy-care ladder toggle", () => {
    const mod: Modifier = {
      kind: "flat_per_night_toggle",
      id: "needy",
      label: "Needy pet care",
      cents: 1500,
      source: { kind: "ladder", input: "needyTier", maxTier: 4 },
    };
    expect(describeModifier(mod)).toMatch(/attention/i);
  });

  it("defines per-cat flat pricing as including the first", () => {
    const mod: Modifier = { kind: "flat_per_unit", unit: "cat", cents: 800 };
    expect(describeModifier(mod)).toMatch(/including the first/i);
  });

  it("defines the long-stay auto discount (nightsOver4)", () => {
    const mod: Modifier = {
      kind: "pct_discount",
      id: "long_a",
      label: "Long stay (-5%)",
      pct: 5,
      condition: "nightsOver4",
    };
    expect(describeModifier(mod)).toMatch(/long stay/i);
  });

  it("defines the extended-stay auto discount (nightsOver6)", () => {
    const mod: Modifier = {
      kind: "pct_discount",
      id: "long_b",
      label: "Extended stay (-8%)",
      pct: 8,
      condition: "nightsOver6",
    };
    expect(describeModifier(mod)).toMatch(/extended stay/i);
  });

  it("returns undefined for a modifier with no defined term", () => {
    const mod: Modifier = { kind: "base_per_night", cents: 5000 };
    expect(describeModifier(mod)).toBeUndefined();
  });
});
