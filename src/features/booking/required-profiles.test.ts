import { describe, it, expect } from "vitest";
import {
  bookingRequirements,
  requirementsSatisfied,
  REQUIRED_PROFILES,
  FRESHNESS_WINDOW_DAYS,
  servicesRequiring,
} from "./required-profiles";

const NOW = new Date("2026-06-16T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const FRESH = daysAgo(10);
const STALE = daysAgo(FRESHNESS_WINDOW_DAYS + 20);

const DOG_A = { id: "pet-a", name: "Rex", species: "dog" as const };
const DOG_B = { id: "pet-b", name: "Milo", species: "dog" as const };
const CAT = { id: "pet-c", name: "Luna", species: "cat" as const };

describe("REQUIRED_PROFILES manifest", () => {
  it("maps every pricing_type to finer form keys", () => {
    expect(REQUIRED_PROFILES.house_sitting.map((f) => f.key)).toEqual([
      "owner",
      "home_access",
      "home_sitting",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.check_in.map((f) => f.key)).toEqual([
      "owner",
      "home_access",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.walk.map((f) => f.key)).toEqual([
      "owner",
      "pet_care",
      "pet_walk",
    ]);
    expect(REQUIRED_PROFILES.training.map((f) => f.key)).toEqual([
      "owner",
      "pet_care",
    ]);
    expect(REQUIRED_PROFILES.meet_greet.map((f) => f.key)).toEqual(["owner"]);
  });

  it("marks pet_walk as dog-only across every service that requires it", () => {
    for (const pt of ["house_sitting", "check_in", "walk"] as const) {
      const walk = REQUIRED_PROFILES[pt].find((f) => f.key === "pet_walk");
      expect(walk).toMatchObject({ scope: "pet", species: "dog" });
    }
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
    expect(items).toEqual([{ formKey: "owner", status: "complete" }]);
  });

  it("marks an account profile missing/stale by submitted_at", () => {
    const missing = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: null },
      petForms: {},
      now: NOW,
    });
    expect(missing).toEqual([{ formKey: "owner", status: "missing" }]);

    const stale = bookingRequirements({
      pricingType: "meet_greet",
      assignedPets: [],
      accountForms: { owner: STALE },
      petForms: {},
      now: NOW,
    });
    expect(stale).toEqual([{ formKey: "owner", status: "stale" }]);
  });

  it("house_sitting yields account forms + per-pet pet_care/pet_walk", () => {
    const items = bookingRequirements({
      pricingType: "house_sitting",
      assignedPets: [DOG_A, DOG_B],
      accountForms: { owner: FRESH, home_access: FRESH, home_sitting: FRESH },
      petForms: {
        "pet-a": { pet_care: FRESH, pet_walk: FRESH },
        "pet-b": { pet_care: null, pet_walk: STALE },
      },
      now: NOW,
    });
    expect(items).toEqual([
      { formKey: "owner", status: "complete" },
      { formKey: "home_access", status: "complete" },
      { formKey: "home_sitting", status: "complete" },
      {
        formKey: "pet_care",
        petId: "pet-a",
        petName: "Rex",
        status: "complete",
      },
      {
        formKey: "pet_walk",
        petId: "pet-a",
        petName: "Rex",
        status: "complete",
      },
      {
        formKey: "pet_care",
        petId: "pet-b",
        petName: "Milo",
        status: "missing",
      },
      { formKey: "pet_walk", petId: "pet-b", petName: "Milo", status: "stale" },
    ]);
  });

  it("skips pet_walk for cats (dog-only predicate) but keeps pet_care", () => {
    const items = bookingRequirements({
      pricingType: "house_sitting",
      assignedPets: [CAT],
      accountForms: { owner: FRESH, home_access: FRESH, home_sitting: FRESH },
      petForms: { "pet-c": { pet_care: FRESH } },
      now: NOW,
    });
    const catItems = items.filter((i) => i.petId === "pet-c");
    expect(catItems).toEqual([
      {
        formKey: "pet_care",
        petId: "pet-c",
        petName: "Luna",
        status: "complete",
      },
    ]);
  });

  it("treats pet requirements as vacuous when no pets are assigned", () => {
    const items = bookingRequirements({
      pricingType: "walk",
      assignedPets: [],
      accountForms: { owner: FRESH },
      petForms: {},
      now: NOW,
    });
    expect(items).toEqual([{ formKey: "owner", status: "complete" }]);
    expect(requirementsSatisfied(items)).toBe(true);
  });

  it("treats a submission exactly at the window edge as still complete", () => {
    const justInside = daysAgo(FRESHNESS_WINDOW_DAYS);
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
        { formKey: "owner", status: "complete" },
        { formKey: "home_access", status: "complete" },
      ]),
    ).toBe(true);
    expect(
      requirementsSatisfied([
        { formKey: "owner", status: "complete" },
        { formKey: "home_access", status: "stale" },
      ]),
    ).toBe(false);
  });
});

describe("servicesRequiring", () => {
  it("returns every pricing_type whose manifest includes the key", () => {
    expect(servicesRequiring("owner")).toEqual([
      "house_sitting",
      "check_in",
      "walk",
      "training",
      "meet_greet",
    ]);
    expect(servicesRequiring("home_sitting")).toEqual(["house_sitting"]);
    expect(servicesRequiring("pet_walk")).toEqual([
      "house_sitting",
      "check_in",
      "walk",
    ]);
  });
});
