import { describe, it, expect } from "vitest";
import { isActiveNav, isActiveSection } from "./is-active-nav";

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

describe("isActiveSection", () => {
  it("exact match returns true", () => {
    expect(isActiveSection("/account", "/account")).toBe(true);
  });
  it("nested route returns true", () => {
    expect(isActiveSection("/account/pets", "/account")).toBe(true);
  });
  it("sibling with longer name returns false", () => {
    expect(isActiveSection("/accounts", "/account")).toBe(false);
  });
  it("unrelated route returns false", () => {
    expect(isActiveSection("/admin", "/account")).toBe(false);
  });
  it("trailing-slash insensitive", () => {
    expect(isActiveSection("/account/", "/account")).toBe(true);
  });
});
