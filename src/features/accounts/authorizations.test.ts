import { describe, it, expect } from "vitest";
import { authorizationCurrent, EXPENSE_AUTH_VERSION } from "./authorizations";

describe("authorizationCurrent", () => {
  it("is false when nothing has been accepted", () => {
    expect(authorizationCurrent(null)).toBe(false);
  });

  it("is true when the latest accepted version matches the current one", () => {
    expect(
      authorizationCurrent({
        version: EXPENSE_AUTH_VERSION,
        acceptedName: "Cal Barba",
        acceptedAt: "2026-06-16T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("is false when an older version was accepted (terms changed → re-prompt)", () => {
    expect(
      authorizationCurrent(
        {
          version: "2025-01-01",
          acceptedName: "Cal Barba",
          acceptedAt: "2025-01-01T00:00:00Z",
        },
        "2026-06-16",
      ),
    ).toBe(false);
  });
});
