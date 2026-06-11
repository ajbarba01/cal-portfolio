"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { PetForm } from "./pet-form";
import { PetAvatar } from "@/features/booking/index.client";
import type { Pet } from "@/features/accounts/account-actions";
import type { ActionResult } from "@/features/accounts/account-actions";

// Shared "form section" legend (matches the booking + forms surfaces).
const LEGEND_CLASS =
  "text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A pet plus a resolved (signed) photo URL for display. */
export interface PetViewLike extends Pet {
  photoUrl: string | null;
}

export interface PetListProps {
  pets: PetViewLike[];
  /**
   * Called after any mutation so the parent can refresh server data.
   * The parent is responsible for re-fetching (e.g. router.refresh() in the
   * account zone, or a profile-scoped reload in the admin zone).
   */
  onChanged: () => void;
  /**
   * Injected delete action — account passes `deletePet`; admin passes a
   * profile-scoped on-behalf variant that owns the pet-id check.
   */
  onDelete: (petId: string) => Promise<ActionResult>;
}

// ─── Pet item ─────────────────────────────────────────────────────────────────

function PetItem({
  pet,
  onChanged,
  onDelete,
}: {
  pet: PetViewLike;
  onChanged: () => void;
  onDelete: (petId: string) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
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
      const result = await onDelete(pet.id);
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
    <li className="bg-card border-border overflow-hidden rounded-xl border">
      {/* Identity row — always visible */}
      <div className="flex items-center gap-3 px-4 py-3">
        <PetAvatar
          name={pet.name}
          species={pet.species}
          photoUrl={pet.photoUrl}
          size={36}
        />
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-foreground font-semibold">
            {pet.name}{" "}
            <span className="text-muted-foreground font-normal">
              ({pet.species})
            </span>
          </p>
          {pet.breed && <p className="text-muted-foreground">{pet.breed}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Collapse pet details" : "Expand pet details"}
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded focus-visible:ring-2 focus-visible:outline-none"
          >
            <ChevronRight
              className="size-4 transition-transform duration-150"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Detail panel — behind toggle */}
      {open && (
        <div className="border-border bg-muted/40 border-t px-4 py-3 text-sm">
          {pet.notes && <p className="text-muted-foreground">{pet.notes}</p>}
          {!pet.notes && !pet.breed && (
            <p className="text-muted-foreground italic">No additional notes.</p>
          )}
          {error && (
            <p role="alert" className="text-destructive mt-1 text-xs">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Error shown even when collapsed */}
      {!open && error && (
        <p role="alert" className="text-destructive px-4 pb-2 text-xs">
          {error}
        </p>
      )}

      {dialog}
    </li>
  );
}

// ─── Pet list ─────────────────────────────────────────────────────────────────

export function PetList({ pets, onChanged, onDelete }: PetListProps) {
  const [showAddForm, setShowAddForm] = useState(false);

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
            <PetItem
              key={pet.id}
              pet={pet}
              onChanged={onChanged}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {showAddForm ? (
        <div className="border-brand bg-muted/40 rounded-xl border p-4">
          <p className={LEGEND_CLASS}>Add a pet</p>
          <PetForm
            onSaved={() => {
              setShowAddForm(false);
              onChanged();
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
