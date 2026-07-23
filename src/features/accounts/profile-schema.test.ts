import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile-schema";

const base = {
  full_name: "Alex Barba",
  phone: "555-123-4567",
  address: "1 Main St",
};

describe("profileSchema zip", () => {
  it("accepts a plain 5-digit ZIP", () => {
    expect(profileSchema.safeParse({ ...base, zip: "80301" }).success).toBe(
      true,
    );
  });

  it("accepts a ZIP+4", () => {
    expect(
      profileSchema.safeParse({ ...base, zip: "80301-1234" }).success,
    ).toBe(true);
  });

  it("rejects a malformed ZIP with a message that does not claim 5 digits only", () => {
    // 5+ chars so only the regex check fails (not the separate min-length check),
    // isolating the message this test is about.
    const res = profileSchema.safeParse({ ...base, zip: "abcde" });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    const msg = res.error.issues.find((i) => i.path[0] === "zip")?.message;
    expect(msg).toBe("Enter a valid ZIP code");
  });
});
