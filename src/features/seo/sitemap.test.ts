// src/features/seo/sitemap.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { buildSitemap, SITEMAP_STATIC_PATHS } from "./sitemap";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("buildSitemap", () => {
  it("includes every static path plus one entry per service slug", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const now = new Date("2026-06-16T00:00:00Z");
    const entries = buildSitemap({
      serviceSlugs: ["walk", "house-sitting"],
      now,
    });
    expect(entries).toHaveLength(SITEMAP_STATIC_PATHS.length + 2);
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://calbarba.com/");
    expect(urls).toContain("https://calbarba.com/book/walk");
  });

  it("excludes private routes", () => {
    const urls = buildSitemap({ serviceSlugs: [], now: new Date() }).map(
      (e) => e.url,
    );
    expect(urls.some((u) => u.includes("/admin"))).toBe(false);
    expect(urls.some((u) => u.includes("/account"))).toBe(false);
    expect(urls.some((u) => u.includes("/showcase"))).toBe(false);
  });
});
