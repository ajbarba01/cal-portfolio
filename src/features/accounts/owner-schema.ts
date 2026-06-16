import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

/**
 * Owner profile (account-scoped). Normalizes Cal's "Owner Form": primary owner
 * identity, an optional backup contact method, optional 2nd/3rd owners, and one
 * or two emergency contacts. The expense-authorization e-sign is NOT stored here
 * — it lives in the append-only `authorizations` table (see runAcceptAuthorization).
 *
 * Veterinarian info is intentionally absent: it moved to the per-pet profile
 * (pets.vet_* columns), since a household can use different vets per animal.
 */
const phone = z
  .string()
  .min(7)
  .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number");

const optionalPhone = z
  .string()
  .regex(/^\+?[\d\s\-().]{7,20}$/, "Enter a valid phone number")
  .optional()
  .or(z.literal(""));

export const ownerSchema = z.object({
  // ── Primary owner ──────────────────────────────────────────────────────────
  owner_name: z
    .string()
    .min(1, "Owner name is required")
    .max(FIELD_LIMITS.name),
  owner_pronouns: z.string().max(FIELD_LIMITS.relationship).optional(),
  owner_phone: phone,
  backup_contact: z.string().max(FIELD_LIMITS.shortText).optional(),

  // ── Optional second / third owner ────────────────────────────────────────────
  second_owner_name: z.string().max(FIELD_LIMITS.name).optional(),
  second_owner_phone: optionalPhone,
  third_owner_name: z.string().max(FIELD_LIMITS.name).optional(),
  third_owner_phone: optionalPhone,

  // ── Emergency contact #1 (required) ──────────────────────────────────────────
  emergency1_name: z
    .string()
    .min(1, "Emergency contact name is required")
    .max(FIELD_LIMITS.name),
  emergency1_phone: phone,
  emergency1_relationship: z
    .string()
    .min(1, "Relationship is required")
    .max(FIELD_LIMITS.relationship),
  emergency1_address: z.string().max(FIELD_LIMITS.addressLine).optional(),

  // ── Emergency contact #2 (optional) ──────────────────────────────────────────
  emergency2_name: z.string().max(FIELD_LIMITS.name).optional(),
  emergency2_phone: optionalPhone,
  emergency2_relationship: z.string().max(FIELD_LIMITS.relationship).optional(),
  emergency2_address: z.string().max(FIELD_LIMITS.addressLine).optional(),

  // ── Catch-all ────────────────────────────────────────────────────────────────
  additional_notes: z.string().max(FIELD_LIMITS.note).optional(),
});

export type OwnerInput = z.infer<typeof ownerSchema>;
