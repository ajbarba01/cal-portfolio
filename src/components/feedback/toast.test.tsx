import { describe, it, expect } from "vitest";
import { toastDefaults } from "./toast";

describe("toastDefaults", () => {
  it("makes errors sticky and assertive", () => {
    expect(toastDefaults({ type: "error", title: "x" })).toMatchObject({
      timeout: 0,
      priority: "high",
    });
  });
  it("leaves success polite and inherits the provider default duration", () => {
    const out = toastDefaults({ type: "success", title: "x" });
    expect(out).toMatchObject({ priority: "low" });
    // Must NOT pin an explicit timeout — success inherits the provider's 5 s
    // default (guards against accidentally making success sticky).
    expect(out.timeout).toBeUndefined();
  });
  it("respects an explicit timeout override", () => {
    expect(
      toastDefaults({ type: "error", title: "x", timeout: 1000 }).timeout,
    ).toBe(1000);
  });
});
