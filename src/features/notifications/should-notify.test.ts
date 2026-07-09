import { describe, it, expect } from "vitest";
import { shouldNotify } from "./should-notify";

describe("shouldNotify", () => {
  it("suppresses an unclaimed recipient", () => {
    expect(shouldNotify({ unclaimed: true })).toBe(false);
  });
  it("notifies a claimed recipient", () => {
    expect(shouldNotify({ unclaimed: false })).toBe(true);
  });
  it("treats null unclaimed as claimed (legacy rows notify)", () => {
    expect(shouldNotify({ unclaimed: null })).toBe(true);
  });
});
