// @vitest-environment jsdom

/**
 * MarketingProse turns one registry string into blocks: blank lines separate
 * paragraphs, a leading `## ` makes a subhead, and `[label](href)` becomes a
 * link. Cal writes that copy as plain text in `marketing.ts`, so the parsing is
 * the only thing standing between her line breaks and the rendered page.
 *
 * The registry is mocked to fixtures here: this suite is about the grammar, not
 * about any particular body, and a copy revision must not turn it red.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/content/marketing", () => ({
  copy: {
    "service.walk.detail.body":
      "A first paragraph.\n\nA second paragraph.\n\nA third.",
    "service.check_in.detail.body":
      "An intro line.\n\n## A subhead\n\nThe text under it.",
    "service.house_sitting.detail.body":
      "Read the [resources](/resources) before booking, then [get in touch](/contact).",
    "service.training.detail.body": "One block, no markers at all.",
  },
}));

import { MarketingProse } from "./marketing-prose";

/** The rendered blocks in document order, as `tagName: text` rows. */
function blocks(container: HTMLElement): string[] {
  return [...container.querySelectorAll("h3, p")].map(
    (node) => `${node.tagName.toLowerCase()}: ${node.textContent}`,
  );
}

describe("MarketingProse", () => {
  it("renders a body with no markers as a single paragraph", () => {
    const { container } = render(
      <MarketingProse id="service.training.detail.body" />,
    );

    expect(blocks(container)).toEqual(["p: One block, no markers at all."]);
  });

  it("splits on blank lines and keeps the author's order", () => {
    const { container } = render(
      <MarketingProse id="service.walk.detail.body" />,
    );

    expect(blocks(container)).toEqual([
      "p: A first paragraph.",
      "p: A second paragraph.",
      "p: A third.",
    ]);
  });

  it("promotes a block opening with the heading marker to a subhead", () => {
    const { container } = render(
      <MarketingProse id="service.check_in.detail.body" />,
    );

    expect(blocks(container)).toEqual([
      "p: An intro line.",
      "h3: A subhead",
      "p: The text under it.",
    ]);
  });

  it("links every inline marker in a paragraph, in place", () => {
    const { container } = render(
      <MarketingProse id="service.house_sitting.detail.body" />,
    );

    const links = [...container.querySelectorAll("a")];
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["resources", "/resources"],
      ["get in touch", "/contact"],
    ]);
    // The prose around them survives: a marker is replaced, not the sentence.
    expect(blocks(container)).toEqual([
      "p: Read the resources before booking, then get in touch.",
    ]);
  });

  it("passes its class through to the block container", () => {
    const { container } = render(
      <MarketingProse id="service.training.detail.body" className="mt-4" />,
    );

    expect(container.firstElementChild?.className).toContain("mt-4");
  });
});
