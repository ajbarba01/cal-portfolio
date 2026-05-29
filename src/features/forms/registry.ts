import { type ZodSchema } from "zod";
import { emergencySchema } from "./emergency-schema";

/**
 * Maps each form_key to its Zod validation schema.
 * Service-specific form schemas are added in Phase 10.
 * The `data` jsonb column in form_responses accommodates future schema definitions
 * moving to the DB with no storage change.
 */
export const formRegistry = {
  emergency: emergencySchema,
} satisfies Record<string, ZodSchema>;

export type FormKey = keyof typeof formRegistry;
