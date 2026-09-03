/**
 * Shorten a reference's household name to the person it leads with, the way
 * `abbreviateAuthorName` shortens a reviewer's. Cal writes a reference as the
 * whole household, people and pets together — "Ginna, Bill and Niko" — which is
 * too long to sit on a chip beside a photo. The chip carries the leading person
 * ("Ginna"); the full household name stays in the registry and is what the
 * contact dialog is titled with, so nothing is lost, only deferred.
 *
 * Pure, so it is unit-tested on its own and applied once where the chips render.
 *
 * A list separator is a comma or a spaced "and" — "Sandy" is one name, not
 * "S" + "y". A two-word leading name ("Mary Jane and Rex") stays whole: the
 * split is between people, not between words. A blank name yields "".
 */
export function referenceFirstName(name: string): string {
  return name.split(/\s*,\s*|\s+and\s+/i)[0]?.trim() ?? "";
}
