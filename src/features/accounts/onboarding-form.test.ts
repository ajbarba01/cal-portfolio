import { describe, it, expect } from "vitest";
import {
  onboardingClientSchema,
  splitOnboardingInput,
} from "./onboarding-form";

const valid = {
  full_name: "Alex Client",
  phone: "3035551234",
  address: "1 Main St",
  zip: "80401",
  contact_name: "Sam Friend",
  contact_phone: "3035555678",
  contact_relationship: "Friend",
  vet_name: "Front Range Vet",
  vet_phone: "3035559999",
};

describe("onboardingClientSchema", () => {
  it("accepts a complete submission", () => {
    expect(onboardingClientSchema.safeParse(valid).success).toBe(true);
  });

  it("reports per-field messages for missing fields", () => {
    const r = onboardingClientSchema.safeParse({ ...valid, full_name: "" });
    expect(r.success).toBe(false);
  });
});

describe("splitOnboardingInput", () => {
  it("splits the flat form values into profile + emergency", () => {
    const input = splitOnboardingInput(valid);
    expect(input.profile).toEqual({
      full_name: "Alex Client",
      phone: "3035551234",
      address: "1 Main St",
      zip: "80401",
    });
    expect(input.emergency).toEqual({
      contact_name: "Sam Friend",
      contact_phone: "3035555678",
      contact_relationship: "Friend",
      vet_name: "Front Range Vet",
      vet_phone: "3035559999",
    });
  });
});
