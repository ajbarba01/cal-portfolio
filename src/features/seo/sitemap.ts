// src/features/seo/sitemap.ts
import type { MetadataRoute } from "next";
import { absoluteUrl } from "./site-url";

/** Public marketing routes that always exist (no DB). */
export const SITEMAP_STATIC_PATHS = [
  "/",
  "/about",
  "/services",
  "/gallery",
  "/reviews",
  "/resources",
  "/book",
  "/contact",
] as const;

export function buildSitemap(opts: {
  serviceSlugs: readonly string[];
  now: Date;
}): MetadataRoute.Sitemap {
  const { serviceSlugs, now } = opts;
  const staticEntries: MetadataRoute.Sitemap = SITEMAP_STATIC_PATHS.map(
    (path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.7,
    }),
  );
  const serviceEntries: MetadataRoute.Sitemap = serviceSlugs.map((slug) => ({
    url: absoluteUrl(`/book/${slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...staticEntries, ...serviceEntries];
}
