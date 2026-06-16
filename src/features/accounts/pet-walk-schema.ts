import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Pet-walk profile (pet-scoped, dogs only). Covers walk-specific details that
 * are dog-shaped: route, pace, leash/harness, off-leash tag, vehicle restraint,
 * and how Cal enters the home for the walk. Required for house-sitting, check-ins,
 * and walk services — but only when a dog is assigned to the booking.
 */
export const petWalkSchema = z.object({
  walk_route: z.string().max(FIELD_LIMITS.note).optional(),
  walk_pace: z.string().max(FIELD_LIMITS.shortText).optional(),
  leash_harness: z.string().max(FIELD_LIMITS.shortText).optional(),
  offleash: z.string().max(FIELD_LIMITS.shortText).optional(),
  vehicle_restraint: z.string().max(FIELD_LIMITS.note).optional(),
  walk_entry: z.string().max(FIELD_LIMITS.note).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type PetWalkInput = z.infer<typeof petWalkSchema>;
