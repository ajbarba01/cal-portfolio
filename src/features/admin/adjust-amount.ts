import { z } from "zod";

const schema = z.number().int().positive();

/** Parse an admin-entered adjust amount (cents). Returns null when invalid.
 * Zero is rejected on purpose — clearing a debit entirely is a waive. */
export function parseAdjustAmountCents(raw: unknown): number | null {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
