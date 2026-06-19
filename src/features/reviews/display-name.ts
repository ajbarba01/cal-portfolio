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
 */
export function abbreviateAuthorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${first} ${lastInitial}.`;
}
