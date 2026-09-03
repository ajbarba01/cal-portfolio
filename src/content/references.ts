/**
 * Client references — Cal-owned content, placed and revised through the
 * copy-sync protocol (docs/CONTENT.md) like the marketing registry beside it.
 * It lives in its own file because a reference is a small record — a name, a
 * consent decision, a photo — rather than a copy string keyed by ID.
 *
 * Two consent decisions, both Cal's to record, both explicit:
 *
 * 1. Appearing here at all means the client agreed to be named on the site.
 * 2. `contact` means they also agreed to have those details published, so the
 *    site shows them on request. `null` is the answer for everyone else: the
 *    site reveals nothing and sends the visitor to the contact form to ask Cal,
 *    who passes the request on. Details supplied privately stay out of this
 *    file — an entry with no published consent carries `contact: null`.
 *
 * `photo` is a basename under `public/references/`, produced by
 * `npm run gallery:sync` from a `references-originals/` folder.
 *
 * The list below carries the references already named on /about. The rest of
 * Cal's clients stay off it until each one consents.
 */

/**
 * Details a reference agreed to publish. The union is deliberate: one of the
 * two fields is always filled in, so the reveal dialog can never open empty.
 */
export type ReferenceContact =
  | { email: string; phone?: string }
  | { phone: string; email?: string };

export interface Reference {
  /** The household as Cal writes it, people and pets — "Abby and Sloane". */
  name: string;
  /** Published details, or `null` when the visitor has to ask Cal instead. */
  contact: ReferenceContact | null;
  /** Pet photo basename in `public/references`, e.g. "sloane.jpg". */
  photo?: string;
}

export const references: readonly Reference[] = [
  // Consent to be named recorded 2026-06-19 (docs/content/cal-source.md). Both
  // households also gave Cal a phone number privately, and neither is here:
  // publishing a number is a second yes that has not been given.
  { name: "Abby and Sloane", contact: null },
  { name: "Madeleine, Apollo, Anabella", contact: null },
];
