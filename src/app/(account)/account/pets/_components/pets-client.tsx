"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { PetForm } from "@/features/accounts";
import { PetAvatar } from "@/features/booking";
import { deletePet } from "@/features/accounts";
import type { PetView } from "../page";

// Shared "form section" legend (matches the booking + forms surfaces).
const LEGEND_CLASS =
  "text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase";

// ─── Pet row ──────────────────────────────────────────────────────────────────

function PetItem({ pet, onChanged }: { pet: PetView; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    setError(null);
    const ok = await confirm({
      title: `Remove ${pet.name}?`,
      description:
        "This removes the pet from your account. Bookings already placed keep their details.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
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
      <li className="border-brand bg-muted/40 rounded-xl border p-4">
        <p className={LEGEND_CLASS}>Edit pet</p>
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
    <li className="bg-card border-border flex items-start justify-between gap-4 rounded-xl border px-4 py-3">
      <div className="flex items-start gap-3">
        <PetAvatar
          name={pet.name}
          species={pet.species}
          photoUrl={pet.photoUrl}
          size={36}
        />
        <div className="text-sm">
          <p className="text-foreground font-semibold">
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
          variant="outline"
          className="text-destructive hover:text-destructive border-destructive/30"
          onClick={() => void handleDelete()}
          disabled={isPending}
        >
          {isPending ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {dialog}
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
        <div className="border-border bg-card rounded-xl border border-dashed p-8 text-center">
          <div aria-hidden="true" className="mb-2 text-3xl">
            🐾
          </div>
          <p className="text-muted-foreground text-sm">No pets added yet.</p>
        </div>
      )}

      {pets.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pets.map((pet) => (
            <PetItem key={pet.id} pet={pet} onChanged={refresh} />
          ))}
        </ul>
      )}

      {showAddForm ? (
        <div className="border-brand bg-muted/40 rounded-xl border p-4">
          <p className={LEGEND_CLASS}>Add a pet</p>
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
          <Plus className="size-4" aria-hidden="true" />
          Add a pet
        </Button>
      )}
    </div>
  );
}
