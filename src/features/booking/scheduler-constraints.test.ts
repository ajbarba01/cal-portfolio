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
  it("allowedSpeciesOf offers every species the service's config accepts", () => {
    // A walk is dogs only, but a house-sit takes the whole taxonomy, and the
    // pet step has to offer the bird the config says Cal will sit for.
    expect(allowedSpeciesOf(walk)).toEqual(["dog"]);
    expect(allowedSpeciesOf(houseSit)).toEqual([
      "dog",
      "cat",
      "bird",
      "rodent",
      "reptile",
      "fish",
      "other",
    ]);
  });
});
