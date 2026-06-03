"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { PetForm } from "@/features/accounts/_components/pet-form";
import { PetAvatar } from "@/features/booking/_components/pet-avatar";
import { deletePet } from "@/features/accounts/account-actions";
import type { PetView } from "../page";

// ─── Pet row ──────────────────────────────────────────────────────────────────

function PetItem({ pet, onChanged }: { pet: PetView; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deletePet(pet.id);
      if (result.kind === "success") {
        onChanged();
      } else {
        setError(result.message);
      }
    });
  }

  if (editing) {
    return (
      <li className="rounded-md border p-4">
        <PetForm
          initial={pet}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
      <div className="flex items-start gap-3">
        <PetAvatar
          name={pet.name}
          species={pet.species}
          photoUrl={pet.photoUrl}
        />
        <div className="text-sm">
          <p className="text-foreground font-medium">
            {pet.name}{" "}
            <span className="text-muted-foreground font-normal">
              ({pet.species})
            </span>
          </p>
          {pet.breed && <p className="text-muted-foreground">{pet.breed}</p>}
          {pet.notes && (
            <p className="text-muted-foreground mt-1 text-xs">{pet.notes}</p>
          )}
          {error && (
            <p role="alert" className="text-destructive mt-1 text-xs">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
          disabled={isPending}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </li>
  );
}

// ─── Pets list ────────────────────────────────────────────────────────────────

export function PetsClient({ pets }: { pets: PetView[] }) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);

  // Re-pull server data (fresh ids + signed photo URLs) after any mutation.
  const refresh = () => router.refresh();

  return (
    <div className="flex flex-col gap-6">
      {pets.length === 0 && !showAddForm && (
        <p className="text-muted-foreground text-sm">No pets added yet.</p>
      )}

      {pets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pets.map((pet) => (
            <PetItem key={pet.id} pet={pet} onChanged={refresh} />
          ))}
        </ul>
      )}

      {showAddForm ? (
        <div className="rounded-md border p-4">
          <h3 className="text-foreground mb-4 text-sm font-medium">
            Add a pet
          </h3>
          <PetForm
            onSaved={() => {
              setShowAddForm(false);
              refresh();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      ) : (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setShowAddForm(true)}
        >
          Add a pet
        </Button>
      )}
    </div>
  );
}
