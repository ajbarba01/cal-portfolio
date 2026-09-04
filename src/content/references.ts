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
  /**
   * The consented display name — a first name. Nothing else about the household
   * belongs here: this file reaches the browser in full.
   */
  name: string;
  /** Published details, or `null` when the visitor has to ask Cal instead. */
  contact: ReferenceContact | null;
  /** Pet photo basename in `public/references`, e.g. "sloane.jpg". */
  photo?: string;
}

export const references: readonly Reference[] = [
  // Consent recorded 2026-06-19 for Abby and Madeleine, and 2026-09-04 (Alex,
  // relaying Cal) for the other four. All six agreed to be named by first name
  // only, so a first name is all this file holds: the registry is imported by a
  // client component, and everything in it ships in the browser bundle, so a
  // household member or pet named here would be published whether or not the
  // page draws it. Cal's fuller household names live in docs/content/cal-source.md,
  // which is never served.
  //
  // Every entry is `contact: null` by owner decision on 2026-09-04: treat all
  // six the same for now, so each chip routes to the contact form and Cal makes
  // the introduction. Two households are willing to have details published;
  // which two, and what those details are, is still Cal's to say.
  //
  // `photo` is unset until Cal supplies the pet pictures. The chip draws its
  // fallback face in the meantime, so adding photos later changes nothing about
  // the layout.
  { name: "Ginna", contact: null },
  { name: "Simone", contact: null },
  { name: "Carol", contact: null },
  { name: "Claudia", contact: null },
  { name: "Abby", contact: null },
  { name: "Madeleine", contact: null },
];
