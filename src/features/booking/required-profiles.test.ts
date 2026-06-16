/**
 * Unit tests for the pure booking-requirements helper: given a service's
 * pricing_type, the pets assigned to the booking, and the submitted_at of each
 * relevant profile, decide which profiles are complete / stale / missing.
 *
 * Pure (no DB, no clock) — `now` and the freshness window are injected.
 */

import { describe, it, expect } from "vitest";
import {
  bookingRequirements,
  requirementsSatisfied,
  REQUIRED_PROFILES,
  FRESHNESS_WINDOW_DAYS,
} from "./required-profiles";

const NOW = new Date("2026-06-16T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const FRESH = daysAgo(10);
const STALE = daysAgo(FRESHNESS_WINDOW_DAYS + 20);

const PET_A = { id: "pet-a", name: "Rex" };
const PET_B = { id: "pet-b", name: "Milo" };

describe("REQUIRED_PROFILES manifest", () => {
  it("maps every pricing_type", () => {
    expect(REQUIRED_PROFILES.house_sitting).toEqual(["owner", "home", "pet"]);
    expect(REQUIRED_PROFILES.walk).toEqual(["owner", "pet"]);
    expect(REQUIRED_PROFILES.check_in).toEqual(["owner", "pet"]);
    expect(REQUIRED_PROFILES.training).toEqual(["owner", "pet"]);
    expect(REQUIRED_PROFILES.meet_greet).toEqual(["owner"]);
  });
});

describe("bookingRequirements", () => {
  it("meet_greet requires only a fresh owner profile", () => {
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: FRESH },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ profile: "owner", status: "complete" }]);
  });

  it("marks an account profile missing when never submitted", () => {
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: null },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ profile: "owner", status: "missing" }]);
  });

  it("marks an account profile stale when older than the freshness window", () => {
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: STALE },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ profile: "owner", status: "stale" }]);
  });

  it("house_sitting yields owner + home + one pet item per assigned pet", () => {
    const items = bookingRequirements({
      pricingType: "house_sitting",
      assignedPets: [PET_A, PET_B],
      accountForms: { owner: FRESH, home: FRESH },
      petForms: { "pet-a": FRESH, "pet-b": null },
      now: NOW,
    });
    expect(items).toEqual([
      { profile: "owner", status: "complete" },
      { profile: "home", status: "complete" },
      { profile: "pet", petId: "pet-a", petName: "Rex", status: "complete" },
      { profile: "pet", petId: "pet-b", petName: "Milo", status: "missing" },
    ]);
  });

  it("flags a stale pet profile per pet", () => {
    const items = bookingRequirements({
      pricingType: "walk",
      assignedPets: [PET_A],
      accountForms: { owner: FRESH },
      petForms: { "pet-a": STALE },
      now: NOW,
    });
    expect(items).toContainEqual({
      profile: "pet",
      petId: "pet-a",
      petName: "Rex",
      status: "stale",
    });
  });

  it("treats a pet requirement as vacuous when no pets are assigned (gate not permanently blockable; pet selection enforced elsewhere)", () => {
    const items = bookingRequirements({
      pricingType: "walk",
      assignedPets: [],
      accountForms: { owner: FRESH },
      petForms: {},
      now: NOW,
    });
    // owner only; no pet item emitted, so the gate passes once owner is complete.
    expect(items).toEqual([{ profile: "owner", status: "complete" }]);
    expect(requirementsSatisfied(items)).toBe(true);
  });

  it("treats a submission exactly at the window edge as still complete", () => {
    const justInside = daysAgo(FRESHNESS_WINDOW_DAYS); // age == window, not > window
    const items = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: justInside },
      petForms: {},
      now: NOW,
    });
    expect(items[0].status).toBe("complete");
  });
});

describe("requirementsSatisfied", () => {
  it("is true only when every item is complete", () => {
    expect(
      requirementsSatisfied([
        { profile: "owner", status: "complete" },
        { profile: "home", status: "complete" },
      ]),
    ).toBe(true);
  });

  it("is false when any item is stale or missing", () => {
    expect(
      requirementsSatisfied([
        { profile: "owner", status: "complete" },
        { profile: "home", status: "stale" },
      ]),
    ).toBe(false);
    expect(
      requirementsSatisfied([{ profile: "owner", status: "missing" }]),
    ).toBe(false);
  });
});
