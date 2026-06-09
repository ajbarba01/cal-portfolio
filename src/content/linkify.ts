/**
 * Inline-link parsing for marketing copy.
 *
 * A copy body in `marketing.ts` stays a single string. Inline links are written
 * into that string with **markdown link syntax** — `[label](href)` — which
 * encodes the link's exact position, so duplicate labels and repeated words are
 * never ambiguous. `segmentCopy` is the pure parser that turns such a string
 * into ordered segments; the `MarketingCopy` component renders them with
 * `next/link`.
 *
 * The marker cannot collide with the `[[ ... ]]` copy-placeholder grammar: a
 * link requires `](` adjacency, which `[[ ... ]]` never produces.
 */

/** One ordered piece of a body: plain prose, or a linked run when `href` is set. */
export type CopySegment = { text: string; href?: string };

/** `[label](href)` — label is any run without `]`, href any run without `)`. */
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Parse `text` into ordered segments, turning every `[label](href)` marker into
 * a linked segment and leaving the rest as prose. Position-based, so duplicate
 * labels are unambiguous. A string with no markers returns a single prose
 * segment. Pure — no React — and fully testable.
 */
export function segmentCopy(text: string): CopySegment[] {
  const segments: CopySegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start) });
    }
    segments.push({ text: match[1], href: match[2] });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }
  // An empty string yields no markers and no tail — return one empty segment so
  // callers always get at least something to render.
  return segments.length > 0 ? segments : [{ text }];
}
