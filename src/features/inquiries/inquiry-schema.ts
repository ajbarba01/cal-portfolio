import { z } from "zod";

/** Public contact-form input. `company` is a honeypot: real users leave it empty. */
export const submitInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Message is required").max(4000),
  company: z.string().optional(),
});

export type SubmitInquiryInput = z.infer<typeof submitInquirySchema>;
