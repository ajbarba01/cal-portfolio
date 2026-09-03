import {
  Bird,
  Cat,
  Dog,
  Fish,
  PawPrint,
  Rat,
  Turtle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECIES, type PetSpecies } from "./species";

/**
 * One badge icon per species, exhaustive by construction: a species added to
 * the taxonomy fails this record until it has a face, rather than silently
 * inheriting the dog's. `other` keeps the generic paw print.
 */
const SPECIES_ICON: Record<PetSpecies, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rodent: Rat,
  reptile: Turtle,
  fish: Fish,
  other: PawPrint,
};

interface PetAvatarProps {
  name: string;
  species: PetSpecies;
  /** Resolved (signed/public) image URL, or null to show the fallback. */
  photoUrl: string | null;
  /** Pixel size of the square avatar. */
  size?: number;
  className?: string;
}

/**
 * Square pet avatar. Shows the photo when a resolved URL is present, otherwise
 * a token-colored circle with the pet's initial and a species icon. Tokens
 * only — no hardcoded colors (wireframe-friendly).
 */
export function PetAvatar({
  name,
  species,
  photoUrl,
  size = 40,
  className,
}: PetAvatarProps) {
  // Callers still cast unvalidated DB strings to PetSpecies, so fall back to the
  // generic paw print rather than rendering `undefined` as a component.
  const Icon = SPECIES_ICON[species] ?? PawPrint;
  const speciesLabel =
    SPECIES.find((s) => s.value === species)?.label ?? species;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dimension = { width: size, height: size };

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed URLs are dynamic; next/image needs known hosts
      <img
        src={photoUrl}
        alt={name}
        style={dimension}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${name} (${speciesLabel})`}
      style={dimension}
      className={cn(
        "bg-muted text-muted-foreground relative inline-flex shrink-0 items-center justify-center rounded-full text-sm font-medium",
        className,
      )}
    >
      {initial}
      <Icon
        aria-hidden
        className="bg-background absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full p-px"
      />
    </span>
  );
}
