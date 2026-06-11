import { describe, it, expect } from "vitest";
import { toastDefaults } from "./toast";

describe("toastDefaults", () => {
  it("makes errors sticky and assertive", () => {
    expect(toastDefaults({ type: "error", title: "x" })).toMatchObject({
      timeout: 0,
      priority: "high",
    });
  });
  it("leaves success polite (provider default duration)", () => {
    expect(toastDefaults({ type: "success", title: "x" })).toMatchObject({
      priority: "low",
    });
  });
  it("respects an explicit timeout override", () => {
    expect(
      toastDefaults({ type: "error", title: "x", timeout: 1000 }).timeout,
    ).toBe(1000);
  });
});
