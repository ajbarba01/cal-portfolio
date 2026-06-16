import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Required profile fields collected at onboarding.
 * Email comes from auth.users — not collected here.
 */
export const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(FIELD_LIMITS.name),
  phone: z
    .string()
    .min(7, "Phone number is required")
    .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number"),
  address: z
    .string()
    .min(1, "Street address is required")
    .max(FIELD_LIMITS.addressLine),
  zip: z
    .string()
    .min(5, "ZIP code is required")
    .regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code"),
});

export type ProfileInput = z.infer<typeof profileSchema>;
