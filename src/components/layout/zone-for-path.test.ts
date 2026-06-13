import { describe, it, expect } from "vitest";
import { zoneNavForPath } from "./zone-for-path";
import { accountNav, adminNav } from "./nav-config";

describe("zoneNavForPath", () => {
  it("returns the admin nav inside /admin", () => {
    expect(zoneNavForPath("/admin")).toBe(adminNav);
    expect(zoneNavForPath("/admin/bookings")).toBe(adminNav);
  });
  it("returns the account nav inside /account", () => {
    expect(zoneNavForPath("/account")).toBe(accountNav);
    expect(zoneNavForPath("/account/pets")).toBe(accountNav);
  });
  it("returns undefined on marketing routes", () => {
    expect(zoneNavForPath("/")).toBeUndefined();
    expect(zoneNavForPath("/services")).toBeUndefined();
  });
});
