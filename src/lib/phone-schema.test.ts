import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PHONE_PATTERN, phoneSchema } from "./phone-schema";

/**
 * The accept/reject table is drawn from every phone rule shipping today
 * (profile, owner primary, owner optional, emergency contact, vet). All five
 * carry the identical pattern, so adoption must not narrow this set.
 */
const ACCEPTED: readonly [string, string][] = [
  ["1234567", "the seven-character floor"],
  ["5551234567", "ten bare digits"],
  ["555-123-4567", "hyphen groups (the shape the profile suite uses)"],
  ["(555) 123-4567", "parentheses, space and hyphen together"],
  ["555.123.4567", "dot separators"],
  ["+1 555 123 4567", "a leading plus with spaces"],
  ["+15551234567", "E.164 with no separators"],
  ["12345678901234567890", "the twenty-character ceiling"],
  ["+12345678901234567890", "the ceiling measured after the leading plus"],
];

const REJECTED: readonly [string, string][] = [
  ["", "an empty string"],
  ["123456", "six characters, one under the floor"],
  ["+123456", "six characters after the plus"],
  ["123456789012345678901", "twenty-one characters"],
  ["555-CALL-NOW", "letters"],
  ["555 123 4567 ext 12", "an extension written in words"],
  ["+", "a lone plus"],
  ["++15551234567", "a doubled plus"],
  ["5551234567@example.com", "an address pasted into the field"],
];

describe("phoneSchema", () => {
  for (const [value, why] of ACCEPTED) {
    it(`accepts ${why}`, () => {
      expect(phoneSchema.safeParse(value).success).toBe(true);
    });
  }

  for (const [value, why] of REJECTED) {
    it(`rejects ${why}`, () => {
      expect(phoneSchema.safeParse(value).success).toBe(false);
    });
  }

  it("reuses the message every existing copy already shows", () => {
    const result = phoneSchema.safeParse("555-CALL-NOW");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]?.message).toBe("Enter a valid phone number");
  });

  it("raises exactly one issue, leaving message order to whatever composes it", () => {
    const result = phoneSchema.safeParse("123");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.message).toBe("Enter a valid phone number");
  });

  it("keeps a required field's own empty-input message when only the pattern is shared", () => {
    // Three fields shipping today (profile phone, emergency contact phone, vet
    // phone) pair the pattern with a `.min(7)` that names the field, and an
    // empty box shows that message because zod reports the checks in order.
    // Reusing PHONE_PATTERN instead of phoneSchema leaves both untouched — the
    // onboarding info-step suite asserts the profile wording verbatim.
    const required = z
      .string()
      .min(7, "Phone number is required")
      .regex(PHONE_PATTERN, "Enter a valid phone number");
    const result = required.safeParse("");
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]?.message).toBe("Phone number is required");
    expect(required.safeParse("555-CALL-NOW").success).toBe(false);
    expect(required.safeParse("(555) 123-4567").success).toBe(true);
  });

  it("rejects a non-string without throwing", () => {
    expect(phoneSchema.safeParse(undefined).success).toBe(false);
  });

  it("allows an optional field to opt into the empty string", () => {
    // The three optional phone fields on the owner form chain the schema this
    // way today; keeping the chain at the call site avoids a second export.
    const optional = phoneSchema.optional().or(z.literal(""));
    expect(optional.safeParse("").success).toBe(true);
    expect(optional.safeParse(undefined).success).toBe(true);
    expect(optional.safeParse("nope").success).toBe(false);
  });
});
