// src/features/seo/metadata.ts
import type { Metadata } from "next";
import { absoluteUrl } from "./site-url";

export type PageMetadataInput = {
  title: string;
  description: string;
  /** Site-relative path, e.g. "/about". Used for canonical + OG url. */
  path: string;
  /** When true, the title bypasses the root "%s · Cal Barba" template. */
  absoluteTitle?: boolean;
};

/** Per-page metadata: templated title, description, canonical, OG/Twitter text. */
export function buildPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(path);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    twitter: { title, description },
  };
}
