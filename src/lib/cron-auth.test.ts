import { describe, it, expect } from "vitest";
import { assertCronAuth } from "./cron-auth";

const SECRET = "correct-horse-battery-staple";

/** Builds a request carrying the given Authorization header, or none at all. */
function requestWithAuthorization(header?: string): Request {
  return new Request("https://example.test/api/cron/complete", {
    headers: header === undefined ? undefined : { authorization: header },
  });
}

describe("assertCronAuth", () => {
  it("accepts the exact bearer token", () => {
    expect(
      assertCronAuth(requestWithAuthorization(`Bearer ${SECRET}`), SECRET),
    ).toBe(true);
  });

  it("rejects a request with no Authorization header", () => {
    expect(assertCronAuth(requestWithAuthorization(), SECRET)).toBe(false);
  });

  it("rejects a header that is not a bearer token", () => {
    expect(
      assertCronAuth(requestWithAuthorization(`Basic ${SECRET}`), SECRET),
    ).toBe(false);
  });

  it("rejects a bare secret sent without the bearer scheme", () => {
    expect(assertCronAuth(requestWithAuthorization(SECRET), SECRET)).toBe(
      false,
    );
  });

  it("rejects a token of a different length", () => {
    expect(
      assertCronAuth(requestWithAuthorization(`Bearer ${SECRET}x`), SECRET),
    ).toBe(false);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(
      assertCronAuth(requestWithAuthorization(`Bearer ${wrong}`), SECRET),
    ).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(
      assertCronAuth(requestWithAuthorization(`Bearer ${SECRET}`), undefined),
    ).toBe(false);
    // An empty variable is as good as an unset one; it must not authorize
    // a request that sends an empty bearer token either.
    expect(assertCronAuth(requestWithAuthorization("Bearer "), "")).toBe(false);
  });
});
