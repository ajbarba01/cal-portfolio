// src/features/seo/business.ts

/** A place the business serves. `region` → AdministrativeArea, `city` → City. */
export type AreaServed = { kind: "region" | "city"; name: string };

/**
 * Single source of truth for business identity + geography.
 * Service-area business on Colorado's Front Range — NO street address.
 * `telephone` and `sameAs` are intentionally omitted until Cal has a public
 * phone + Google Business Profile (omission beats inconsistent NAP).
 */
export const BUSINESS = {
  name: "Cal Barba",
  legalName: "Cal Barba Pet Care",
  description:
    "Reliable dog walking and house sitting across Colorado's Front Range — caring, dependable pet care tailored to your dog.",
  priceRange: "$$",
  addressRegion: "CO",
  addressCountry: "US",
  areaServed: [
    { kind: "region", name: "Front Range, Colorado" },
    { kind: "city", name: "Denver" },
    { kind: "city", name: "Lakewood" },
  ] satisfies AreaServed[],
  // A real service photo, not the (unfinished) brand mark. Cal can swap freely.
  // Must stay an un-hashed path: gallery-sync re-hashes /gallery filenames on
  // every run, which would silently turn this into a dead URL.
  imagePath: "/bg/IMG_0048.JPG",
} as const;
