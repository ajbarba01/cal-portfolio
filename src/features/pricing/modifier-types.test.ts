import { describe, it, expect } from "vitest";
import type { ServicePricingConfig } from "./modifier-types";
describe("modifier-types", () => {
  it("constructs a config literal", () => {
    const cfg: ServicePricingConfig = {
      modifiers: [{ kind: "base_per_hour", cents: 2500 }],
      constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
    };
    expect(cfg.modifiers).toHaveLength(1);
  });
});
