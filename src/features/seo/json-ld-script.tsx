// src/features/seo/json-ld-script.tsx
import type { JsonLdObject } from "./json-ld";

/**
 * Renders a JSON-LD <script>. Server component; the object is serialized inline.
 * `<script>` is valid HTML in <body>, so this may be placed in layouts/pages.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
