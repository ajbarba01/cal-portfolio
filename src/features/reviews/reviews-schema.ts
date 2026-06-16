/**
 * Zod schema for client review submissions.
 */

import { z } from "zod";
import { FIELD_LIMITS } from "@/lib/field-limits";

export const submitReviewSchema = z.object({
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  body: z
    .string()
    .min(1, "Review text is required")
    .max(
      FIELD_LIMITS.note,
      `Review text must be ${FIELD_LIMITS.note} characters or fewer`,
    ),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
