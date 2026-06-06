"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createPet,
  updatePet,
  uploadPetPhoto,
} from "@/features/accounts/account-actions";
import type { Pet, PetInput } from "@/features/accounts/account-actions";

interface PetFormProps {
  /** Prefilled values for edit mode; undefined = add mode. */
  initial?: Pet;
  /** Called with the saved pet (server-assigned id on create). */
  onSaved: (pet: Pet) => void;
  onCancel?: () => void;
}

/**
 * Shared create/edit form for a pet (species + optional breed/notes/photo).
 * Reused by the account pets page and the booking pet-assignment dialog.
 * `createPet` returns the inserted row so callers get the new id without a
 * full-page reload.
 */
export function PetForm({ initial, onSaved, onCancel }: PetFormProps) {
  const [values, setValues] = useState<PetInput>({
    name: initial?.name ?? "",
    species: initial?.species ?? "dog",
    breed: initial?.breed ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const fieldId = (f: string) => `pet-${f}-${initial?.id ?? "new"}`;

  function set<K extends keyof PetInput>(key: K, value: PetInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let saved: Pet;
      if (initial) {
        const result = await updatePet(initial.id, values);
        if (result.kind !== "success") {
          setError(result.message);
          return;
        }
        saved = {
          ...initial,
          name: values.name,
          species: values.species,
          breed: values.breed ?? null,
          notes: values.notes ?? null,
        };
      } else {
        const result = await createPet(values);
        if (result.kind !== "success") {
          setError(result.message);
          return;
        }
        saved = result.pet;
      }

      const file = fileRef.current?.files?.[0];
      if (file && file.size > 0) {
        const fd = new FormData();
        fd.set("petId", saved.id);
        fd.set("file", file);
        const upload = await uploadPetPhoto(fd);
        if (upload.kind !== "success") {
          setError(upload.message);
          return;
        }
      }

      onSaved(saved);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fieldId("name")}>Name *</Label>
          <Input
            id={fieldId("name")}
            name="name"
            type="text"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Species</legend>
          <div
            role="radiogroup"
            aria-label="Species"
            className="border-border inline-flex w-fit overflow-hidden rounded-md border"
          >
            {(["dog", "cat"] as const).map((sp) => {
              const active = values.species === sp;
              return (
                <button
                  key={sp}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("species", sp)}
                  className={cn(
                    "focus-visible:ring-ring px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
                    active
                      ? "bg-brand/15 text-brand-strong font-semibold"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {sp === "dog" ? "🐕 Dog" : "🐈 Cat"}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId("breed")}>Breed</Label>
        <Input
          id={fieldId("breed")}
          name="breed"
          type="text"
          value={values.breed ?? ""}
          onChange={(e) => set("breed", e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId("notes")}>Notes (vet, meds, feeding)</Label>
        <Input
          id={fieldId("notes")}
          name="notes"
          type="text"
          value={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId("photo")}>Photo</Label>
        <Input
          id={fieldId("photo")}
          ref={fileRef}
          name="file"
          type="file"
          accept="image/*"
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? "Saving…" : initial ? "Update" : "Add pet"}
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
