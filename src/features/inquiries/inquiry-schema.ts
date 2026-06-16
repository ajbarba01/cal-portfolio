import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/** Public contact-form input. `company` is a honeypot: real users leave it empty. */
export const submitInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(FIELD_LIMITS.name),
  email: z.string().trim().email("Enter a valid email").max(FIELD_LIMITS.email),
  phone: z.string().trim().min(1, "Phone is required").max(FIELD_LIMITS.phone),
  subject: z
    .string()
    .trim()
    .max(FIELD_LIMITS.shortText)
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(FIELD_LIMITS.message),
  company: z.string().max(FIELD_LIMITS.shortText).optional(),
});

export type SubmitInquiryInput = z.infer<typeof submitInquirySchema>;

/** Client-side edit of an existing inquiry. Subject optional; message required. */
export const editInquirySchema = z.object({
  subject: z
    .string()
    .trim()
    .max(FIELD_LIMITS.shortText)
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(FIELD_LIMITS.message),
});

export type EditInquiryInput = z.infer<typeof editInquirySchema>;
