import { describe, it, expect } from "vitest";
import { SPECIES, SPECIES_VALUES, speciesEnum } from "./species";

describe("pet species taxonomy", () => {
  it("exposes the 7 canonical species in order", () => {
    expect(SPECIES_VALUES).toEqual([
      "dog",
      "cat",
      "bird",
      "rodent",
      "reptile",
      "fish",
      "other",
    ]);
  });

  it("gives every species a non-empty label and emoji", () => {
    expect(SPECIES.map((s) => s.value)).toEqual([...SPECIES_VALUES]);
    for (const s of SPECIES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.emoji.length).toBeGreaterThan(0);
    }
  });

  it("speciesEnum accepts every value and rejects unknown", () => {
    for (const v of SPECIES_VALUES) expect(speciesEnum.parse(v)).toBe(v);
    expect(speciesEnum.safeParse("dragon").success).toBe(false);
  });
});
