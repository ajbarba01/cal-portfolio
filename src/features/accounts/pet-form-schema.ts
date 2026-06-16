import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Pet-care profile (pet-scoped: form_responses with form_key='pet', pet_id set).
 * Holds the rich medical / behavior / feeding / exercise narrative from Cal's
 * "Per Animal" form. Structured identity (age, sex, spayed_neutered, weight,
 * vet_*) lives in `pets` COLUMNS, not here — this is the freeform care detail.
 *
 * Distinct from the `petSchema` in account-actions.ts, which validates the pets
 * TABLE row (name/species/breed/notes). Naming is deliberate to keep them apart.
 *
 * All fields optional: a low-medical-needs dog may have nothing to add beyond
 * feeding, and the booking gate treats a saved-and-confirmed row as complete
 * regardless of how many optional fields are filled.
 */
export const petFormSchema = z.object({
  // ── Medical ──────────────────────────────────────────────────────────────────
  current_medications: z.string().max(FIELD_LIMITS.note).optional(),
  allergies: z.string().max(FIELD_LIMITS.note).optional(),
  medical_history: z.string().max(FIELD_LIMITS.note).optional(),
  emergency_history: z.string().max(FIELD_LIMITS.note).optional(),
  vet_emergency_notes: z.string().max(FIELD_LIMITS.note).optional(),

  // ── Behavior ─────────────────────────────────────────────────────────────────
  friendly_strangers: z.string().max(FIELD_LIMITS.shortText).optional(),
  friendly_dogs: z.string().max(FIELD_LIMITS.shortText).optional(),
  friendly_children: z.string().max(FIELD_LIMITS.shortText).optional(),
  behavior_comments: z.string().max(FIELD_LIMITS.note).optional(),

  // ── Feeding ──────────────────────────────────────────────────────────────────
  feeding_schedule: z.string().max(FIELD_LIMITS.note).optional(),
  feeding_amount: z.string().max(FIELD_LIMITS.shortText).optional(),
  food_location: z.string().max(FIELD_LIMITS.shortText).optional(),
  treat_instructions: z.string().max(FIELD_LIMITS.note).optional(),

  // ── Exercise ─────────────────────────────────────────────────────────────────
  exercise_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type PetFormInput = z.infer<typeof petFormSchema>;
