import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Home-sitting profile (account-scoped). Covers the stay-specific details Cal
 * needs for overnight house-sitting: where to sleep, home-care tasks, furniture
 * policy, house rules, and guest policy. Required only for house-sitting; not
 * needed for drop-in check-ins or walks.
 */
export const homeSittingSchema = z.object({
  sleeping_arrangements: z.string().max(FIELD_LIMITS.note).optional(),
  home_care: z.string().max(FIELD_LIMITS.note).optional(),
  furniture_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
  house_rules: z.string().max(FIELD_LIMITS.note).optional(),
  guest_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type HomeSittingInput = z.infer<typeof homeSittingSchema>;
