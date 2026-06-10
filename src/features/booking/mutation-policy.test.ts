import { describe, it, expect } from "vitest";
import {
  CLIENT_POLICY,
  ADMIN_POLICY,
  type MutationPolicy,
} from "./mutation-policy";

function skipKeys(policy: MutationPolicy): (keyof MutationPolicy)[] {
  return Object.keys(policy).filter((k) =>
    k.startsWith("skip"),
  ) as (keyof MutationPolicy)[];
}

describe("mutation policy presets", () => {
  it("CLIENT_POLICY enforces every gate (no skips) and never force-confirms", () => {
    const keys = skipKeys(CLIENT_POLICY);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(CLIENT_POLICY[k]).toBe(false);
    expect(CLIENT_POLICY.forceStatus).toBeUndefined();
  });

  it("ADMIN_POLICY skips every gate and does not preset a forced status", () => {
    const keys = skipKeys(ADMIN_POLICY);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(ADMIN_POLICY[k]).toBe(true);
    expect(ADMIN_POLICY.forceStatus).toBeUndefined();
  });
});
