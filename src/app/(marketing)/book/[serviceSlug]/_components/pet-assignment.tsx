"use client";

/**
 * Pet assignment for pet-aware services. Lists the client's real pets filtered
 * to the service's allowed species, as multi-select toggles, plus an inline
 * "add a pet" form (the shared PetForm). The server derives dog/cat counts from
 * the assigned pets — counts are never typed in.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PetAvatar,
  type PetSpecies,
} from "@/features/booking/_components/pet-avatar";
import { PetForm } from "@/features/accounts/_components/pet-form";
import type { Pet } from "@/features/accounts/account-actions";

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
        <ul className="flex flex-wrap gap-2">
          {eligible.map((pet) => {
            const isSelected = selected.includes(pet.id);
            return (
              <li key={pet.id}>
                <button
                  type="button"
                  onClick={() => toggle(pet.id)}
                  aria-pressed={isSelected}
                  className={
                    "focus-visible:border-ring focus-visible:ring-ring/50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 " +
                    (isSelected
                      ? "border-foreground bg-secondary text-secondary-foreground"
                      : "border-border bg-background hover:bg-muted")
                  }
                >
                  <PetAvatar
                    name={pet.name}
                    species={pet.species}
                    photoUrl={pet.photoUrl}
                    size={28}
                  />
                  <span>
                    {pet.name}
                    <span className="text-muted-foreground ml-1 font-normal">
                      ({pet.species})
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showAdd ? (
        <div className="border-border rounded-lg border p-4">
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
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowAdd(true)}
        >
          Add a pet
        </Button>
      )}
    </div>
  );
}
