// src/features/seo/robots.ts
import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl } from "./site-url";

/** Route prefixes kept out of the index (private, auth, dev-only). */
export const ROBOTS_DISALLOW = [
  "/admin",
  "/account",
  "/api",
  "/login",
  "/auth",
  "/showcase",
] as const;

export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOW],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
