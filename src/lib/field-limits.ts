/**
 * Maximum character lengths for user-supplied text fields — the single source of
 * truth shared by server-side Zod schemas (`.max(FIELD_LIMITS.x)`) and client
 * inputs (`maxLength={FIELD_LIMITS.x}`). Importing the same constant on both
 * sides guarantees the client hint and the server enforcement never drift.
 *
 * Keys are SEMANTIC (named after the field's meaning, not a size bucket) so call
 * sites read self-documentingly. Numbers are deliberately generous — roughly 2×
 * the realistic worst case. The cap exists to stop abuse (payload bloat, log
 * spam, accidental megabyte pastes), not to police legitimate input.
 *
 * The real enforcement is the server `.max()`; the client `maxLength` is UX only
 * (a script can bypass it). Both are present on every field by convention.
 */
export const FIELD_LIMITS = {
  /** Person, emergency-contact, veterinarian, or pet name. */
  name: 100,
  /** Email address — RFC 5321 caps a deliverable address at 254 chars. */
  email: 254,
  /** Phone number — E.164 is ≤15 digits; allow formatting chars + extension. */
  phone: 32,
  /** "Relationship to emergency contact" and similar one-word/short descriptors. */
  relationship: 60,
  /** A single street-address line (postal convention ~95; doubled for safety). */
  addressLine: 200,
  /** Postal / ZIP code (covers international postal codes). */
  zip: 16,
  /** Short free text — subject lines, labels, pet breed, blurbs. */
  shortText: 200,
  /** Medium free text — review body, booking comments, pet notes. */
  note: 2000,
  /** Long free text — the contact-form message (longest free input on the site). */
  message: 4000,
  /** Password — bcrypt hashes only the first 72 bytes; longer is silently ignored. */
  password: 72,
} as const;

export type FieldLimitKey = keyof typeof FIELD_LIMITS;
