import { describe, it, expect } from "vitest";
import { allowedSpeciesOf, maxPetsOf } from "./use-booking-scheduler";
import type { Constraints } from "@/features/pricing";

const walk: Constraints = {
  intervalMin: 15,
  maxDogs: 2,
  allowedSpecies: ["dog"],
};
const houseSit: Constraints = {
  intervalMin: 15,
  allowedSpecies: ["dog", "cat", "bird", "rodent", "reptile", "fish", "other"],
};

describe("scheduler constraint reads", () => {
  it("maxPetsOf returns maxDogs, or null when absent", () => {
    expect(maxPetsOf(walk)).toBe(2);
    expect(maxPetsOf(houseSit)).toBeNull();
  });
  it("allowedSpeciesOf narrows config species to the avatar's dog/cat set", () => {
    // pets are dog/cat by DB enum, so non-dog/cat config entries are dropped
    expect(allowedSpeciesOf(walk)).toEqual(["dog"]);
    expect(allowedSpeciesOf(houseSit)).toEqual(["dog", "cat"]);
  });
});
