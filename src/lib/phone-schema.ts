import { z } from "zod";

/**
 * The one phone-number pattern behind every form that stores a dialable number.
 *
 * Accepts an optional leading `+` followed by 7–20 digits, spaces, hyphens,
 * parentheses or dots — deliberately loose, because the site never dials the
 * number and a rule strict enough to be "correct" rejects real international
 * and extension formats. It is the pattern the account, owner, emergency-contact
 * and veterinarian fields already shipped, reproduced exactly so adopting it
 * cannot reject a number a client has already saved.
 *
 * Fields that show their own message for an empty box keep their `.min()` check
 * and reuse only this pattern — `z.string().min(7, "…").regex(PHONE_PATTERN,
 * "Enter a valid phone number")` — because zod reports the checks in order and
 * the `.min()` message is the one an empty field displays.
 */
export const PHONE_PATTERN = /^\+?[\d\s\-().]{7,20}$/;

/**
 * The pattern as a schema, for fields with no distinct empty-input message.
 * Optional fields chain from here: `phoneSchema.optional().or(z.literal(""))`.
 *
 * Not for the public contact form, whose phone field is free text on purpose
 * (`submitInquirySchema`) — tightening it would silently drop enquiries.
 */
export const phoneSchema = z
  .string()
  .regex(PHONE_PATTERN, "Enter a valid phone number");
