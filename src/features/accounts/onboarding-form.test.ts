import { describe, it, expect } from "vitest";
import { onboardingSuccessPath, parseOnboardingForm } from "./onboarding-form";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const valid = {
  full_name: "Test User",
  phone: "303-555-0100",
  address: "123 Main St",
  zip: "80301",
  contact_name: "Jane Doe",
  contact_phone: "303-555-0101",
  contact_relationship: "Spouse",
  vet_name: "Boulder Vet",
  vet_phone: "303-555-0102",
};

describe("parseOnboardingForm", () => {
  it("returns ok with parsed input for valid data", () => {
    const r = parseOnboardingForm(fd(valid));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.profile.full_name).toBe("Test User");
      expect(r.input.emergency.contact_name).toBe("Jane Doe");
    }
  });

  it("returns per-field errors for empty required fields", () => {
    const r = parseOnboardingForm(fd({ ...valid, full_name: "", zip: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.full_name).toBeTruthy();
      expect(r.fieldErrors.zip).toBeTruthy();
      expect(r.fieldErrors.phone).toBeUndefined();
    }
  });

  it("returns the zip format message for a malformed zip", () => {
    const r = parseOnboardingForm(fd({ ...valid, zip: "abcde" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.zip).toMatch(/valid 5-digit ZIP/i);
  });
});

describe("onboardingSuccessPath", () => {
  // Regression (U25): the success redirect must target /onboarding itself —
  // never /account or the returnTo destination. A meet_greet_pending user is
  // bounced off /account by middleware, and the client router then replays a
  // stale cached payload (the empty info form), which read as a failed submit.
  it("targets /onboarding when no returnTo survives validation", () => {
    expect(onboardingSuccessPath(null)).toBe("/onboarding");
  });

  it("keeps a validated returnTo on the /onboarding URL", () => {
    expect(onboardingSuccessPath("/book/walk?date=2026-06-20")).toBe(
      "/onboarding?returnTo=%2Fbook%2Fwalk%3Fdate%3D2026-06-20",
    );
  });
});
