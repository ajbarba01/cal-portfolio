import { describe, it, expect } from "vitest";
import {
  activeNavHref,
  isActiveNav,
  isActiveNavItem,
  isActiveSection,
  isCurrentNavItem,
} from "./is-active-nav";

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

const ACCOUNT = [
  "/account",
  "/account/pets",
  "/account/forms",
  "/account/bookings",
];
const ADMIN = ["/admin", "/admin/clients", "/admin/bookings"];

describe("activeNavHref", () => {
  it("picks the most specific matching href", () => {
    expect(activeNavHref("/account/pets", ACCOUNT)).toBe("/account/pets");
  });
  it("matches the index route exactly", () => {
    expect(activeNavHref("/account", ACCOUNT)).toBe("/account");
  });
  it("stays active on a nested detail route", () => {
    expect(activeNavHref("/admin/clients/abc-123", ADMIN)).toBe(
      "/admin/clients",
    );
  });
  it("returns null when nothing matches", () => {
    expect(activeNavHref("/services", ACCOUNT)).toBeNull();
  });
});

describe("isActiveNavItem", () => {
  const servicesItem = {
    href: "/services",
    label: "Services",
    activeSections: ["/book"],
  };

  it("matches the item's primary section", () => {
    expect(isActiveNavItem("/services", servicesItem)).toBe(true);
  });

  it("matches a nested aliased section", () => {
    expect(isActiveNavItem("/book/training", servicesItem)).toBe(true);
  });

  it("does not match an unrelated section", () => {
    expect(isActiveNavItem("/reviews", servicesItem)).toBe(false);
  });
});

describe("isCurrentNavItem", () => {
  const servicesItem = {
    href: "/services",
    label: "Services",
    activeSections: ["/book"],
  };

  it("does not mark an aliased section as the current linked section", () => {
    expect(isCurrentNavItem("/book/training", servicesItem)).toBe(false);
  });
});
