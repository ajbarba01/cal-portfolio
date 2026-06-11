"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PhotoCropField } from "./photo-crop-field";
import {
  createPet,
  updatePet,
  uploadPetPhoto,
} from "@/features/accounts/account-actions";
import type {
  Pet,
  PetInput,
  ActionResult,
  CreatePetResult,
} from "@/features/accounts/account-actions";

/**
 * Injectable action overrides for PetForm.
 *
 * The account zone omits this prop and falls back to the session-scoped
 * account actions. The admin zone injects the on-behalf variants so writes
 * go to the target client's profile, not the admin's own.
 */
export interface PetFormActions {
  create: (input: PetInput) => Promise<CreatePetResult>;
  update: (petId: string, input: PetInput) => Promise<ActionResult>;
  uploadPhoto: (petId: string, file: File) => Promise<ActionResult>;
}

interface PetFormProps {
  /** Prefilled values for edit mode; undefined = add mode. */
  initial?: Pet;
  /** Called with the saved pet (server-assigned id on create). */
  onSaved: (pet: Pet) => void;
  onCancel?: () => void;
  /**
   * Optional action overrides. When omitted the form uses the standard
   * session-scoped account actions (account zone — unchanged behavior).
   * Inject admin on-behalf actions to write to a target client's profile.
   */
  actions?: PetFormActions;
}

/**
 * Shared create/edit form for a pet (species + optional breed/notes/photo).
 * Reused by the account pets page and the booking pet-assignment dialog.
 * `createPet` returns the inserted row so callers get the new id without a
 * full-page reload.
 */
export function PetForm({ initial, onSaved, onCancel, actions }: PetFormProps) {
  // Resolve to injected actions (admin zone) or default account actions.
  const resolvedActions: PetFormActions = actions ?? {
    create: createPet,
    update: updatePet,
    uploadPhoto: async (petId: string, file: File) => {
      const fd = new FormData();
      fd.set("petId", petId);
      fd.set("file", file, "pet.jpg");
      return uploadPetPhoto(fd);
    },
  };
  const [values, setValues] = useState<PetInput>({
    name: initial?.name ?? "",
    species: initial?.species ?? "dog",
    breed: initial?.breed ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [croppedPhoto, setCroppedPhoto] = useState<Blob | null>(null);
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
        const result = await resolvedActions.update(initial.id, values);
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
        const result = await resolvedActions.create(values);
        if (result.kind !== "success") {
          setError(result.message);
          return;
        }
        saved = result.pet;
      }

      if (croppedPhoto && croppedPhoto.size > 0) {
        const upload = await resolvedActions.uploadPhoto(
          saved.id,
          croppedPhoto as File,
        );
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

        {/* Mirror the Name field's div+Label structure exactly so the control
            tops align across the 2-col grid. */}
        <div className="flex flex-col gap-1.5">
          <Label>Species</Label>
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
        </div>
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
        <Label>Photo (optional)</Label>
        <PhotoCropField onCroppedBlobChange={setCroppedPhoto} />
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
