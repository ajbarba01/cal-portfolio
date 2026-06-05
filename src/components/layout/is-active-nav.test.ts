import { describe, it, expect } from "vitest";
import { isActiveNav } from "./is-active-nav";

describe("isActiveNav", () => {
  it("matches the exact route", () => {
    expect(isActiveNav("/account/pets", "/account/pets")).toBe(true);
  });
  it("does not activate a parent for a child route", () => {
    expect(isActiveNav("/account/pets", "/account")).toBe(false);
  });
  it("ignores trailing slashes", () => {
    expect(isActiveNav("/admin/settings/", "/admin/settings")).toBe(true);
  });
  it("returns false for an unrelated route", () => {
    expect(isActiveNav("/admin/bookings", "/admin/services")).toBe(false);
  });
});
