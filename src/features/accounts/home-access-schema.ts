import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Home-access profile (account-scoped). Covers the minimum Cal needs to enter
 * the home — address, entry method, alarm, Wi-Fi, and the breaker location.
 * Required by any service that involves entering the client's home (check-ins,
 * house-sitting). Intentionally excludes stay-specific details (sleeping
 * arrangements, house rules) which live in home-sitting-schema.
 */
export const homeAccessSchema = z.object({
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
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type HomeAccessInput = z.infer<typeof homeAccessSchema>;
