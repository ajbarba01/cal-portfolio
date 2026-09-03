// src/features/seo/json-ld-script.tsx
import type { JsonLdObject } from "./json-ld";

/**
 * Renders a JSON-LD <script>. Server component; the object is serialized inline.
 * `<script>` is valid HTML in <body>, so this may be placed in layouts/pages.
 *
 * Payloads carry visitor-supplied text (review bodies, author names), so every
 * `<` is escaped: without it a body containing `</script>` closes this element
 * and everything after it is parsed as markup. The escape is valid JSON, so
 * crawlers still read the original character.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
