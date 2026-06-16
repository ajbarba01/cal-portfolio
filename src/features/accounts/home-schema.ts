import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Home profile (account-scoped). Normalizes the Home Access / Home Care sections
 * shared across Cal's Check-ins and House-sitting forms into one reusable record.
 * One home per account today; the schema carries no home_id, so multi-home later
 * is additive (a pet_id-style scope column on form_responses) and non-breaking.
 *
 * Only address + entry instructions are required (the minimum Cal needs to get
 * in the door); everything else is optional and service-dependent (sleeping
 * arrangements matter for sitting, not for a drop-in check-in).
 */
export const homeSchema = z.object({
  address: z
    .string()
    .min(1, "Home address is required")
    .max(FIELD_LIMITS.addressLine),
  entry_instructions: z
    .string()
    .min(1, "Entry instructions are required")
    .max(FIELD_LIMITS.note),
  alarm_instructions: z.string().max(FIELD_LIMITS.note).optional(),
  wifi: z.string().max(FIELD_LIMITS.shortText).optional(),
  breaker_location: z.string().max(FIELD_LIMITS.shortText).optional(),
  sleeping_arrangements: z.string().max(FIELD_LIMITS.note).optional(),
  home_care: z.string().max(FIELD_LIMITS.note).optional(),
  furniture_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
  house_rules: z.string().max(FIELD_LIMITS.note).optional(),
  guest_policy: z.string().max(FIELD_LIMITS.shortText).optional(),
});

export type HomeInput = z.infer<typeof homeSchema>;
