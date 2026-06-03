import { PetAvatar } from "./pet-avatar";
import type { PublicBusyRange } from "../busy-ranges";

/**
 * Pet thumbnails for a public busy block. Identity-free by construction — the
 * source range carries species + signed photo URL only (no owner name/id), so
 * the avatar label is the species, never a name.
 */
export function BusyPets({
  pets,
  size = 24,
}: {
  pets: PublicBusyRange["pets"];
  size?: number;
}) {
  if (pets.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {pets.map((pet, i) => (
        <PetAvatar
          key={i}
          name={pet.species === "cat" ? "Cat" : "Dog"}
          species={pet.species}
          photoUrl={pet.photoUrl}
          size={size}
          className="ring-background ring-2"
        />
      ))}
    </span>
  );
}
