import { describe, it, expect } from "vitest";
import { SCENARIOS, type Step } from "./scenarios";

/** Registry lookup that fails loudly instead of yielding an absent scenario. */
function scenario(name: string): Step[] {
  const steps = SCENARIOS[name];
  if (!steps) throw new Error(`No scenario named "${name}"`);
  return steps;
}

describe("SCENARIOS registry", () => {
  it("defines exactly the four spec scenarios", () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual([
      "admin-demo",
      "busy-week",
      "fresh",
      "payment-states",
    ]);
  });

  it("fresh is wipe-only (no steps)", () => {
    expect(SCENARIOS["fresh"]).toEqual([]);
  });

  it("admin-demo composes busy-week + payment-states + extras", () => {
    const names = scenario("admin-demo").map((s) => s.name);
    for (const s of scenario("busy-week")) expect(names).toContain(s.name);
    for (const s of scenario("payment-states")) {
      expect(names).toContain(s.name);
    }
    expect(names).toContain("admin-demo-extras");
  });

  it("step names are unique within each scenario", () => {
    for (const steps of Object.values(SCENARIOS)) {
      const names = steps.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
