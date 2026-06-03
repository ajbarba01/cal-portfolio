import { Dog, Cat } from "lucide-react";
import { cn } from "@/lib/utils";

export type PetSpecies = "dog" | "cat";

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
  const Icon = species === "cat" ? Cat : Dog;
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
      aria-label={`${name} (${species})`}
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
