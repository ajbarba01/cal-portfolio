import { describe, expect, it } from "vitest";

import { isPaymentsEnabled } from "./payments-enabled";

describe("isPaymentsEnabled", () => {
  it("is off when unset", () => {
    expect(isPaymentsEnabled(undefined)).toBe(false);
  });

  it('is off for "false"', () => {
    expect(isPaymentsEnabled("false")).toBe(false);
  });

  it('is on for "true"', () => {
    expect(isPaymentsEnabled("true")).toBe(true);
  });

  it('is off for "TRUE" (case must match exactly)', () => {
    expect(isPaymentsEnabled("TRUE")).toBe(false);
  });
});
