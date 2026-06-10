import { describe, it, expect } from "vitest";
import {
  CLIENT_POLICY,
  ADMIN_POLICY,
  type MutationPolicy,
} from "./mutation-policy";

const SKIP_KEYS: (keyof MutationPolicy)[] = [
  "skipDebtGate",
  "skipOnboardingGate",
  "skipDistanceRefuse",
  "skipWindowFit",
  "skipHoursLeadGuards",
  "skipCancellationCutoff",
  "skipHorizonRefuse",
];

describe("mutation policy presets", () => {
  it("CLIENT_POLICY enforces every gate (no skips)", () => {
    for (const k of SKIP_KEYS) expect(CLIENT_POLICY[k]).toBe(false);
    expect(CLIENT_POLICY.forceStatus).toBeUndefined();
  });

  it("ADMIN_POLICY skips every gate", () => {
    for (const k of SKIP_KEYS) expect(ADMIN_POLICY[k]).toBe(true);
  });
});
