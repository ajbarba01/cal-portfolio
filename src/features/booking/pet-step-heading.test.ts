import { describe, it, expect } from "vitest";
import { petStepHeading } from "./pet-step-heading";

describe("petStepHeading", () => {
  it("walk: dog-only, plural, with 'up to 2' hint", () => {
    expect(
      petStepHeading({
        pricingType: "walk",
        allowedSpecies: ["dog"],
        maxPets: 2,
      }),
    ).toEqual({ label: "Which dogs?", hint: "up to 2" });
  });

  it("check_in: dog+cat, plural, no hint", () => {
    expect(
      petStepHeading({
        pricingType: "check_in",
        allowedSpecies: ["dog", "cat"],
        maxPets: null,
      }),
    ).toEqual({ label: "Which pets?" });
  });

  it("training: single dog, singular noun, no hint", () => {
    expect(
      petStepHeading({
        pricingType: "training",
        allowedSpecies: ["dog"],
        maxPets: 1,
      }),
    ).toEqual({ label: "Which dog?" });
  });

  it("house_sitting: dog+cat plural, no hint even if a cap exists", () => {
    expect(
      petStepHeading({
        pricingType: "house_sitting",
        allowedSpecies: ["dog", "cat"],
        maxPets: null,
      }),
    ).toEqual({ label: "Which pets?" });
  });
});
