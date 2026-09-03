import { describe, it, expect } from "vitest";

import { isGatedPath, onboardingRedirect } from "./onboarding-redirect";

const approved = { onboarding_status: "approved" };
const pending = { onboarding_status: "info_pending" };

describe("isGatedPath", () => {
  it("covers the wizard and the whole account area", () => {
    expect(isGatedPath("/onboarding")).toBe(true);
    expect(isGatedPath("/account")).toBe(true);
    expect(isGatedPath("/account/pets")).toBe(true);
  });

  it("leaves every other path alone, including account-lookalikes", () => {
    expect(isGatedPath("/")).toBe(false);
    expect(isGatedPath("/book/dog-walk")).toBe(false);
    expect(isGatedPath("/accountant")).toBe(false);
  });
});

describe("onboardingRedirect", () => {
  it("lets an approved client into the account area", () => {
    expect(
      onboardingRedirect({
        profile: approved,
        error: null,
        pathname: "/account/pets",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("sends an approved client off the wizard", () => {
    expect(
      onboardingRedirect({
        profile: approved,
        error: null,
        pathname: "/onboarding",
      }),
    ).toEqual({ kind: "redirect", to: "/account" });
  });

  it("sends an un-approved client to the wizard", () => {
    expect(
      onboardingRedirect({
        profile: pending,
        error: null,
        pathname: "/account",
      }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
  });

  it("leaves an un-approved client on the wizard", () => {
    expect(
      onboardingRedirect({
        profile: pending,
        error: null,
        pathname: "/onboarding",
      }),
    ).toEqual({ kind: "allow" });
  });

  it("treats a missing profile row as un-approved", () => {
    expect(
      onboardingRedirect({ profile: null, error: null, pathname: "/account" }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
  });

  // The regression this rule exists for: a read that failed says nothing about
  // approval, so an approved client must not be bounced to the wizard on a blip.
  it("reports a failed read instead of guessing at approval", () => {
    expect(
      onboardingRedirect({
        profile: null,
        error: { message: "connection reset" },
        pathname: "/account",
      }),
    ).toEqual({ kind: "error" });
  });

  it("reports a failed read on the wizard too", () => {
    expect(
      onboardingRedirect({
        profile: null,
        error: { message: "connection reset" },
        pathname: "/onboarding",
      }),
    ).toEqual({ kind: "error" });
  });

  it("allows an ungated path without consulting the profile", () => {
    expect(
      onboardingRedirect({
        profile: null,
        error: { message: "connection reset" },
        pathname: "/services",
      }),
    ).toEqual({ kind: "allow" });
  });
});
