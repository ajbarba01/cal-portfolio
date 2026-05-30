"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDog,
  updateDog,
  deleteDog,
} from "@/features/accounts/account-actions";
import type { DogInput } from "@/features/accounts/account-actions";
import type { DogRow } from "../page";

// ─── Dog form ────────────────────────────────────────────────────────────────

interface DogFormProps {
  /** Prefilled values for edit mode; undefined = add mode. */
  initial?: DogRow;
  onSave: (dog: DogRow) => void;
  onCancel?: () => void;
}

function DogForm({ initial, onSave, onCancel }: DogFormProps) {
  const [values, setValues] = useState<DogInput>({
    name: initial?.name ?? "",
    breed: initial?.breed ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setValues((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      if (initial) {
        const result = await updateDog(initial.id, values);
        if (result.kind === "success") {
          onSave({
            ...initial,
            ...values,
            breed: values.breed ?? null,
            notes: values.notes ?? null,
          });
        } else {
          setError(result.message);
        }
      } else {
        const result = await createDog(values);
        if (result.kind === "success") {
          // Refresh the page to pick up the new dog's server-assigned id.
          window.location.reload();
        } else {
          setError(result.message);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`dog-name-${initial?.id ?? "new"}`}>Name *</Label>
        <Input
          id={`dog-name-${initial?.id ?? "new"}`}
          name="name"
          type="text"
          value={values.name}
          onChange={handleChange}
          required
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`dog-breed-${initial?.id ?? "new"}`}>Breed</Label>
        <Input
          id={`dog-breed-${initial?.id ?? "new"}`}
          name="breed"
          type="text"
          value={values.breed ?? ""}
          onChange={handleChange}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`dog-notes-${initial?.id ?? "new"}`}>
          Notes (vet, meds, feeding)
        </Label>
        <Input
          id={`dog-notes-${initial?.id ?? "new"}`}
          name="notes"
          type="text"
          value={values.notes ?? ""}
          onChange={handleChange}
          autoComplete="off"
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? "Saving…" : initial ? "Update" : "Add dog"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── Dog row ──────────────────────────────────────────────────────────────────

interface DogItemProps {
  dog: DogRow;
  onUpdated: (dog: DogRow) => void;
  onDeleted: (id: string) => void;
}

function DogItem({ dog, onUpdated, onDeleted }: DogItemProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDog(dog.id);
      if (result.kind === "success") {
        onDeleted(dog.id);
      } else {
        setError(result.message);
      }
    });
  }

  if (editing) {
    return (
      <li className="rounded-md border p-4">
        <DogForm
          initial={dog}
          onSave={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
      <div className="text-sm">
        <p className="text-foreground font-medium">{dog.name}</p>
        {dog.breed && <p className="text-muted-foreground">{dog.breed}</p>}
        {dog.notes && (
          <p className="text-muted-foreground mt-1 text-xs">{dog.notes}</p>
        )}
        {error && (
          <p role="alert" className="text-destructive mt-1 text-xs">
            {error}
          </p>
        )}
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

// ─── Dogs list ────────────────────────────────────────────────────────────────

interface DogsClientProps {
  initialDogs: DogRow[];
}

export function DogsClient({ initialDogs }: DogsClientProps) {
  const [dogs, setDogs] = useState<DogRow[]>(initialDogs);
  const [showAddForm, setShowAddForm] = useState(false);

  function handleUpdated(updated: DogRow) {
    setDogs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleDeleted(id: string) {
    setDogs((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {dogs.length === 0 && !showAddForm && (
        <p className="text-muted-foreground text-sm">No dogs added yet.</p>
      )}

      {dogs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {dogs.map((dog) => (
            <DogItem
              key={dog.id}
              dog={dog}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}

      {showAddForm ? (
        <div className="rounded-md border p-4">
          <h3 className="text-foreground mb-4 text-sm font-medium">
            Add a dog
          </h3>
          {/* createDog does window.location.reload on success to get server-assigned id */}
          <DogForm
            onSave={() => {
              setShowAddForm(false);
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
          Add a dog
        </Button>
      )}
    </div>
  );
}
