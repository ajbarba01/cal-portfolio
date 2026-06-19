/**
 * Pure helper for the booking pet-step heading + optional cap hint, shared by the
 * public, admin-create, and edit surfaces so the wording never diverges. The noun
 * derives from the service's allowed species (dog-only → "dog", else "pet") and
 * pluralizes unless the service takes at most one pet. The "up to N" hint is
 * walk-only (the one capped, multi-pet service), driven by the configured cap.
 */
import type { PricingType } from "@/features/pricing";
import type { PetSpecies } from "./_components/pet-avatar";

export function petStepHeading({
  pricingType,
  allowedSpecies,
  maxPets,
}: {
  pricingType: PricingType;
  allowedSpecies: PetSpecies[];
  maxPets: number | null;
}): { label: string; hint?: string } {
  const noun =
    allowedSpecies.length === 1 && allowedSpecies[0] === "dog" ? "dog" : "pet";
  const label = `Which ${maxPets === 1 ? noun : `${noun}s`}?`;
  const hint =
    pricingType === "walk" && maxPets !== null && maxPets > 1
      ? `up to ${maxPets}`
      : undefined;
  return hint ? { label, hint } : { label };
}
