/**
 * Zod schema for client review submissions.
 */

import { z } from "zod";

export const submitReviewSchema = z.object({
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  body: z
    .string()
    .min(1, "Review text is required")
    .max(2000, "Review text must be 2000 characters or fewer"),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
