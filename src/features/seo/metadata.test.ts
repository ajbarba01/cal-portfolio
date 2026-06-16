// src/features/seo/metadata.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { buildPageMetadata } from "./metadata";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("buildPageMetadata", () => {
  it("sets a templated title, description, and absolute canonical", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const meta = buildPageMetadata({
      title: "About",
      description: "Meet Cal.",
      path: "/about",
    });
    expect(meta.title).toBe("About");
    expect(meta.description).toBe("Meet Cal.");
    expect(meta.alternates?.canonical).toBe("https://calbarba.com/about");
    expect(meta.openGraph?.url).toBe("https://calbarba.com/about");
  });

  it("supports an absolute (un-templated) title for the home page", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const meta = buildPageMetadata({
      title: "Cal Barba — Dog Walking & House Sitting on the Front Range",
      description: "Home.",
      path: "/",
      absoluteTitle: true,
    });
    expect(meta.title).toEqual({
      absolute: "Cal Barba — Dog Walking & House Sitting on the Front Range",
    });
  });
});
