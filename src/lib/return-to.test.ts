import { describe, it, expect } from "vitest";
import { safeReturnTo } from "./return-to";

describe("safeReturnTo (open-redirect guard)", () => {
  it("accepts a relative path under /book/", () => {
    expect(safeReturnTo("/book/dog-walk?start=x")).toBe(
      "/book/dog-walk?start=x",
    );
  });

  // U4: generalized returnTo — any safe relative path is allowed
  it("accepts any relative in-app path", () => {
    expect(safeReturnTo("/reviews")).toBe("/reviews");
    expect(safeReturnTo("/services")).toBe("/services");
    expect(safeReturnTo("/account/bookings")).toBe("/account/bookings");
    expect(safeReturnTo("/reviews?page=2")).toBe("/reviews?page=2");
  });

  it("rejects null / empty", () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo("")).toBeNull();
  });

  // Redirect-loop protection: auth paths must be rejected to avoid /login → /login loops
  it("rejects auth-loop paths (/login, /signup, /logout)", () => {
    expect(safeReturnTo("/login")).toBeNull();
    expect(safeReturnTo("/signup")).toBeNull();
    expect(safeReturnTo("/logout")).toBeNull();
    expect(safeReturnTo("/login?next=x")).toBeNull();
  });

  it("rejects absolute URLs (open-redirect)", () => {
    expect(safeReturnTo("https://evil.com")).toBeNull();
    expect(safeReturnTo("http://evil.com")).toBeNull();
    expect(safeReturnTo("https://evil.com/looks/like/a/path")).toBeNull();
  });

  it("rejects protocol-relative URLs (open-redirect)", () => {
    expect(safeReturnTo("//evil.com")).toBeNull();
    expect(safeReturnTo("//evil.com/path")).toBeNull();
  });

  it("rejects backslash paths (browser normalisation open-redirect)", () => {
    expect(safeReturnTo("/book/\\evil.com")).toBeNull();
    expect(safeReturnTo("/\\evil.com")).toBeNull();
  });

  it("rejects non-absolute-path strings (no leading slash)", () => {
    expect(safeReturnTo("evil.com")).toBeNull();
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
  });

  // Colons after the leading slash (in a path segment or query value) are safe —
  // the string already starts with "/" so it cannot be a scheme.  Only a colon
  // BEFORE any slash (position 0…first-slash) forms a scheme.
  it("accepts a path with a literal colon in a path segment", () => {
    expect(safeReturnTo("/path:with-colon/sub")).toBe("/path:with-colon/sub");
  });

  // Scheme-like strings that don't start with "/" still rejected (no leading slash
  // check catches them first, but colons confirm intent)
  it("rejects javascript:alert(1) — no leading slash, caught before colon rule", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBeNull();
  });
});
