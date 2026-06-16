// src/features/seo/site-url.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { getSiteUrl, absoluteUrl } from "./site-url";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("getSiteUrl", () => {
  it("falls back to the production origin when env is unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("https://calbarba.com");
  });

  it("uses the env override and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com/";
    expect(getSiteUrl()).toBe("https://preview.example.com");
  });
});

describe("absoluteUrl", () => {
  it("joins a site-relative path to the origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(absoluteUrl("/about")).toBe("https://calbarba.com/about");
  });
});
