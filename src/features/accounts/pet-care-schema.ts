import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Pet-care profile (pet-scoped). Covers the rich medical / behavior / feeding
 * narrative from Cal's "Per Animal" form. Applies to all species (dogs, cats).
 * Required by any service involving the pet: house-sitting, check-ins, walks,
 * training. Structured identity (age, sex, weight, vet_*) lives in `pets`
 * columns — this is the freeform care detail.
 *
 * All fields optional: the gate treats a saved-and-confirmed row as complete
 * regardless of how many optional fields are filled.
 */
export const petCareSchema = z.object({
  // ── Feeding ──────────────────────────────────────────────────────────────────
  feeding_schedule: z.string().max(FIELD_LIMITS.note).optional(),
  feeding_amount: z.string().max(FIELD_LIMITS.shortText).optional(),
  food_location: z.string().max(FIELD_LIMITS.shortText).optional(),
  treat_instructions: z.string().max(FIELD_LIMITS.note).optional(),

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

  // ── Catch-all ────────────────────────────────────────────────────────────────
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type PetCareInput = z.infer<typeof petCareSchema>;
