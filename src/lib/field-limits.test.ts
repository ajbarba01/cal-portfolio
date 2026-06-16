import { describe, expect, it } from "vitest";

import { FIELD_LIMITS } from "./field-limits";
import { submitInquirySchema } from "@/features/inquiries/inquiry-schema";
import { submitReviewSchema } from "@/features/reviews/reviews-schema";
import { profileSchema } from "@/features/accounts/profile-schema";
import { emergencySchema } from "@/features/accounts/emergency-schema";

/**
 * Boundary tests for the public user-input schemas. Each asserts that a text
 * field accepts input AT its cap and rejects input ONE CHARACTER over — proving
 * the `.max(FIELD_LIMITS.x)` is actually wired on the SERVER (the enforcement
 * boundary; a client `maxLength` can be bypassed). Guards against a field
 * silently losing its cap in a future refactor.
 */

/** A string of exactly `n` characters that survives `.trim()` unchanged. */
const chars = (n: number) => "a".repeat(n);

const validInquiry = {
  name: "Cal",
  email: "cal@example.com",
  phone: "555-1234",
  subject: "",
  message: "Hello there.",
  company: "",
};

const validProfile = {
  full_name: "Cal Barba",
  phone: "555-123-4567",
  address: "123 Main St",
  zip: "80202",
};

const validEmergency = {
  contact_name: "Jamie",
  contact_phone: "555-123-4567",
  contact_relationship: "Spouse",
  vet_name: "Front Range Vet",
  vet_phone: "555-987-6543",
};

describe("field-limits boundary enforcement", () => {
  it("inquiry name accepts the cap, rejects cap + 1", () => {
    expect(
      submitInquirySchema.safeParse({
        ...validInquiry,
        name: chars(FIELD_LIMITS.name),
      }).success,
    ).toBe(true);
    expect(
      submitInquirySchema.safeParse({
        ...validInquiry,
        name: chars(FIELD_LIMITS.name + 1),
      }).success,
    ).toBe(false);
  });

  it("inquiry message rejects cap + 1", () => {
    expect(
      submitInquirySchema.safeParse({
        ...validInquiry,
        message: chars(FIELD_LIMITS.message + 1),
      }).success,
    ).toBe(false);
  });

  it("review body accepts the cap, rejects cap + 1", () => {
    expect(
      submitReviewSchema.safeParse({
        rating: 5,
        body: chars(FIELD_LIMITS.note),
      }).success,
    ).toBe(true);
    expect(
      submitReviewSchema.safeParse({
        rating: 5,
        body: chars(FIELD_LIMITS.note + 1),
      }).success,
    ).toBe(false);
  });

  it("profile full_name and address reject cap + 1", () => {
    expect(
      profileSchema.safeParse({
        ...validProfile,
        full_name: chars(FIELD_LIMITS.name + 1),
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        ...validProfile,
        address: chars(FIELD_LIMITS.addressLine + 1),
      }).success,
    ).toBe(false);
  });

  it("profile accepts every field at its cap", () => {
    expect(
      profileSchema.safeParse({
        ...validProfile,
        full_name: chars(FIELD_LIMITS.name),
        address: chars(FIELD_LIMITS.addressLine),
      }).success,
    ).toBe(true);
  });

  it("emergency name/relationship/vet reject cap + 1", () => {
    expect(
      emergencySchema.safeParse({
        ...validEmergency,
        contact_name: chars(FIELD_LIMITS.name + 1),
      }).success,
    ).toBe(false);
    expect(
      emergencySchema.safeParse({
        ...validEmergency,
        contact_relationship: chars(FIELD_LIMITS.relationship + 1),
      }).success,
    ).toBe(false);
    expect(
      emergencySchema.safeParse({
        ...validEmergency,
        vet_name: chars(FIELD_LIMITS.name + 1),
      }).success,
    ).toBe(false);
  });
});
