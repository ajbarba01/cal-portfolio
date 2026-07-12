import { z } from "zod";

/**
 * Canonical pet taxonomy — the single source of truth for species across pet
 * forms, the booking gate, and pricing (which re-exports `Species` from here).
 * Pure, no runtime deps. Ordered for display: the two common pets first, then
 * the small-animal tail. `other` is the catch-all.
 *
 * Only dogs are walkable — that stays a direct `=== "dog"` check at the call
 * sites (the dog-only `pet_walk` gate), not a helper here, so the module makes
 * no promise that the walkable set could grow.
 */
export const SPECIES_VALUES = [
  "dog",
  "cat",
  "bird",
  "rodent",
  "reptile",
  "fish",
  "other",
] as const;

export type PetSpecies = (typeof SPECIES_VALUES)[number];

export const SPECIES: readonly {
  value: PetSpecies;
  label: string;
  emoji: string;
}[] = [
  { value: "dog", label: "Dog", emoji: "🐕" },
  { value: "cat", label: "Cat", emoji: "🐈" },
  { value: "bird", label: "Bird", emoji: "🐦" },
  { value: "rodent", label: "Small mammal", emoji: "🐹" },
  { value: "reptile", label: "Reptile", emoji: "🦎" },
  { value: "fish", label: "Fish", emoji: "🐠" },
  { value: "other", label: "Other", emoji: "🐾" },
];

export const speciesEnum = z.enum(SPECIES_VALUES);
