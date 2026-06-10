import { z } from "zod";

/** Emergency contact and veterinarian info collected at onboarding. */
export const emergencySchema = z.object({
  contact_name: z.string().min(1, "Emergency contact name is required"),
  contact_phone: z
    .string()
    .min(7, "Emergency contact phone is required")
    .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number"),
  contact_relationship: z
    .string()
    .min(1, "Relationship to emergency contact is required"),
  vet_name: z.string().min(1, "Veterinarian name is required"),
  vet_phone: z
    .string()
    .min(7, "Veterinarian phone is required")
    .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number"),
});

export type EmergencyInput = z.infer<typeof emergencySchema>;
