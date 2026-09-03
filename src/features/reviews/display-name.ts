/**
 * Public display masking for review author names. Reviews are shown publicly
 * (the /reviews wall + its SEO JSON-LD), so we surface the reviewer's first
 * name plus a last initial — "Priya Sharma" → "Priya S." — never the full
 * surname. Pure + injected nothing, so it is unit-tested independently and
 * applied once at the public read boundary (listPublishedReviews).
 *
 * Single-token names ("Priya") have no surname to abbreviate and pass through.
 * Empty input (a review submitted before the profile name was filled in)
 * returns "". Multi-token names abbreviate the LAST token, so "Mary Jane
 * Watson" → "Mary W.". Re-applying is stable: "Priya S." → "Priya S.".
 *
 * A stored name containing "@" is an email — the submit action used to fall
 * back to the reviewer's address when their profile had no name — and becomes
 * "Anonymous" rather than being published.
 */
export function abbreviateAuthorName(fullName: string): string {
  if (fullName.includes("@")) return "Anonymous";

  const [first, ...rest] = fullName.trim().split(/\s+/).filter(Boolean);
  if (first === undefined) return "";
  const last = rest.at(-1);
  if (last === undefined) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
