"use client";

import { useState } from "react";
import { useController } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/ui/char-counter";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import type { FormActionResult } from "@/lib/form-action-result";
import { FIELD_LIMITS } from "@/lib/field-limits";
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

// Species stays the dog/cat enum — the species-model expansion is a later pass.
const petFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(FIELD_LIMITS.name),
  species: z.enum(["dog", "cat"]),
  breed: z.string().max(FIELD_LIMITS.shortText).optional().or(z.literal("")),
  notes: z.string().max(FIELD_LIMITS.note).optional().or(z.literal("")),
  birthdate: z.string().optional().or(z.literal("")),
});

type PetFormValues = z.infer<typeof petFormSchema>;

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

  const form = useAppForm(petFormSchema, {
    defaultValues: {
      name: initial?.name ?? "",
      species: initial?.species ?? "dog",
      breed: initial?.breed ?? "",
      notes: initial?.notes ?? "",
      birthdate: initial?.birthdate ?? "",
    },
  });

  // Photo is not a form value — it's a cropped Blob assembled client-side and
  // uploaded after the pet row is saved.
  const [croppedPhoto, setCroppedPhoto] = useState<Blob | null>(null);

  // Species is a custom control (RadioGroup) — wire it through the form.
  const species = useController({ name: "species", control: form.control });

  // Label classes mirror FormField's Field.Label so custom-control groups
  // (species, photo) align with FormField rows in the grid.
  const groupLabel = "text-sm leading-none font-medium";
  const notes = form.watch("notes") ?? "";

  // Persists the pet (create or update), then uploads the cropped photo if
  // present. Any failure surfaces as the form-level (root) error.
  async function savePet(values: PetFormValues): Promise<FormActionResult> {
    const input: PetInput = {
      name: values.name,
      species: values.species,
      breed: values.breed || "",
      notes: values.notes || "",
      birthdate: values.birthdate || "",
    };

    let saved: Pet;
    if (initial) {
      const result = await resolvedActions.update(initial.id, input);
      if (result.kind !== "success") {
        return { ok: false, message: result.message };
      }
      saved = {
        ...initial,
        name: input.name,
        species: input.species,
        breed: input.breed ?? null,
        notes: input.notes ?? null,
        birthdate: input.birthdate ?? null,
      };
    } else {
      const result = await resolvedActions.create(input);
      if (result.kind !== "success") {
        return { ok: false, message: result.message };
      }
      saved = result.pet;
    }

    if (croppedPhoto && croppedPhoto.size > 0) {
      const upload = await resolvedActions.uploadPhoto(
        saved.id,
        croppedPhoto as File,
      );
      if (upload.kind !== "success") {
        return { ok: false, message: upload.message };
      }
    }

    onSaved(saved);
    return { ok: true };
  }

  const isPending = form.formState.isSubmitting;

  return (
    <Form
      form={form}
      onSubmit={submitAction(form, savePet)}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Name"
          name="name"
          type="text"
          maxLength={FIELD_LIMITS.name}
          autoComplete="off"
        />

        {/* Custom control (radiogroup self-labels). Label classes match
            FormField so the control tops align across the 2-col grid. */}
        <div className="flex flex-col gap-1.5">
          <span className={groupLabel}>Species</span>
          <RadioGroup
            ariaLabel="Species"
            value={species.field.value}
            onValueChange={(v) => species.field.onChange(v)}
            options={[
              { value: "dog", label: "🐕 Dog" },
              { value: "cat", label: "🐈 Cat" },
            ]}
          />
        </div>
      </div>

      <FormField
        label="Breed"
        name="breed"
        type="text"
        maxLength={FIELD_LIMITS.shortText}
        optional
        autoComplete="off"
      />

      <FormField
        label="Birth date"
        name="birthdate"
        type="date"
        optional
        autoComplete="off"
      />

      <div className="flex flex-col gap-1.5">
        <FormField
          label="Notes (vet, meds, feeding)"
          name="notes"
          optional
          error={form.formState.errors.notes?.message}
        >
          <Textarea
            rows={3}
            maxLength={FIELD_LIMITS.note}
            aria-describedby="pet-notes-counter"
            {...form.register("notes")}
          />
        </FormField>
        <CharCounter
          id="pet-notes-counter"
          value={notes}
          max={FIELD_LIMITS.note}
          className="text-right"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={groupLabel}>
          Photo
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            optional
          </span>
        </span>
        <PhotoCropField onCroppedBlobChange={setCroppedPhoto} />
      </div>

      <FormRootError />

      <div className="flex gap-2">
        <Button type="submit" variant="brand" disabled={isPending} size="sm">
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
    </Form>
  );
}
