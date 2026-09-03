import { describe, it, expect } from "vitest";
import { abbreviateAuthorName } from "./display-name";

describe("abbreviateAuthorName", () => {
  it("first name + last initial", () => {
    expect(abbreviateAuthorName("Priya Sharma")).toBe("Priya S.");
  });

  it("abbreviates the last token for 3+ part names", () => {
    expect(abbreviateAuthorName("Mary Jane Watson")).toBe("Mary W.");
  });

  it("passes single names through unchanged", () => {
    expect(abbreviateAuthorName("Priya")).toBe("Priya");
  });

  it("returns empty string for empty input", () => {
    expect(abbreviateAuthorName("")).toBe("");
    expect(abbreviateAuthorName("   ")).toBe("");
  });

  it("collapses extra whitespace", () => {
    expect(abbreviateAuthorName("  Priya   Sharma  ")).toBe("Priya S.");
  });

  it("uppercases the initial", () => {
    expect(abbreviateAuthorName("priya sharma")).toBe("priya S.");
  });

  it("is stable when re-applied", () => {
    expect(abbreviateAuthorName("Priya S.")).toBe("Priya S.");
  });

  it("never publishes a stored email address", () => {
    // Reviews submitted before the action's fallback became "Anonymous" hold
    // the reviewer's email in author_name. Those rows still render on the
    // public wall, so the address has to die at this boundary.
    expect(abbreviateAuthorName("priya@example.com")).toBe("Anonymous");
    expect(abbreviateAuthorName("  PRIYA@example.com  ")).toBe("Anonymous");
    expect(abbreviateAuthorName("Priya priya@example.com")).toBe("Anonymous");
  });
});
