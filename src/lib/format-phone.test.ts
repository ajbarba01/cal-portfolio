import { describe, it, expect } from "vitest";
import { formatPhone } from "./format-phone";

describe("formatPhone", () => {
  it("formats a 10-digit string progressively", () => {
    expect(formatPhone("3")).toBe("(3");
    expect(formatPhone("303")).toBe("(303)");
    expect(formatPhone("303550")).toBe("(303) 550");
    expect(formatPhone("3035500142")).toBe("(303) 550-0142");
  });
  it("strips non-digits and caps at 10 digits", () => {
    expect(formatPhone("(303) 550-0142 ext")).toBe("(303) 550-0142");
    expect(formatPhone("3035500142999")).toBe("(303) 550-0142");
  });
  it("returns empty string for empty/no-digit input", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });
});
