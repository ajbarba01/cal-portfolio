// src/features/seo/json-ld-script.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonLd } from "./json-ld-script";

describe("JsonLd", () => {
  it("escapes angle brackets so payload text cannot close the script tag", () => {
    const html = renderToStaticMarkup(
      <JsonLd data={{ reviewBody: "</script><img src=x onerror=alert(1)>" }} />,
    );
    // The only literal </script> in the markup is the element's own closing tag.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain("\\u003c/script>\\u003cimg");
  });
});
