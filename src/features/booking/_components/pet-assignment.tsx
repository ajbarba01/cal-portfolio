"use client";

/**
 * Pet assignment for pet-aware services. Lists the client's real pets filtered
 * to the service's allowed species, as multi-select toggles, plus an inline
 * "add a pet" form (the shared PetForm). The server derives dog/cat counts from
 * the assigned pets — counts are never typed in.
 */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PetAvatar,
  type PetSpecies,
} from "@/features/booking/_components/pet-avatar";
import { PetForm } from "@/features/accounts";
import type { Pet } from "@/features/accounts";
import { Surface } from "@/components/ui/surface";

export interface AssignablePet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  notes: string | null;
  /** Resolved (signed) photo URL, or null. */
  photoUrl: string | null;
}

interface PetAssignmentProps {
  pets: AssignablePet[];
  /** Species this service accepts (e.g. ["dog","cat"] house-sitting, ["dog"] walk). */
  allowedSpecies: PetSpecies[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Called with the freshly created pet so the caller can auto-select + refresh. */
  onPetAdded: (pet: Pet) => void;
}

export function PetAssignment({
  pets,
  allowedSpecies,
  selected,
  onChange,
  onPetAdded,
}: PetAssignmentProps) {
  const [showAdd, setShowAdd] = useState(false);

  const eligible = pets.filter((p) => allowedSpecies.includes(p.species));

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {eligible.length === 0 && !showAdd && (
        <p className="text-muted-foreground text-sm">
          No eligible pets yet. Add one to continue.
        </p>
      )}

      {eligible.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {eligible.map((pet) => {
            const isSelected = selected.includes(pet.id);
            const subtitle =
              pet.breed ?? (pet.species === "dog" ? "Dog" : "Cat");
            return (
              <li key={pet.id}>
                <button
                  type="button"
                  onClick={() => toggle(pet.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2.5 rounded-xl border-[1.5px] p-3 text-left transition-colors outline-none focus-visible:ring-3",
                    isSelected
                      ? "border-brand bg-brand/10"
                      : "border-border bg-card hover:border-brand/30 hover:bg-muted",
                  )}
                >
                  <PetAvatar
                    name={pet.name}
                    species={pet.species}
                    photoUrl={pet.photoUrl}
                    size={38}
                  />
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "truncate text-sm font-semibold",
                        isSelected ? "text-brand-strong" : "text-foreground",
                      )}
                    >
                      {pet.name}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {subtitle}
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      isSelected
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border",
                    )}
                  >
                    {isSelected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd ? (
        <Surface variant="plain" className="p-4">
          <h3 className="text-foreground mb-3 text-sm font-medium">
            Add a pet
          </h3>
          <PetForm
            onSaved={(pet) => {
              setShowAdd(false);
              onPetAdded(pet);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </Surface>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="text-muted-foreground hover:border-brand/40 hover:text-brand-strong hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 sm:w-auto sm:self-start sm:px-6"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          Add a pet
        </button>
      )}
    </div>
  );
}
