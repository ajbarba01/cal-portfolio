// src/features/seo/site-url.ts
const FALLBACK_ORIGIN = "https://calbarba.com";

/** Canonical site origin, no trailing slash. Env override allows preview deploys. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_ORIGIN;
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a site-relative path (path must start with "/"). */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path}`;
}
