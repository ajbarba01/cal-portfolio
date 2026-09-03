// src/features/seo/json-ld.ts
import { BUSINESS, type AreaServed } from "./business";
import { absoluteUrl, getSiteUrl } from "./site-url";

export type JsonLdObject = Record<string, unknown>;
export type BreadcrumbItem = { name: string; path: string };

type ServiceLike = { name: string; slug: string; description: string | null };
type ReviewLike = {
  author_name: string;
  rating: number;
  body: string;
  created_at: string;
};

/** Stable @id for the business node, referenced across pages. */
export function businessId(): string {
  return `${getSiteUrl()}/#business`;
}

function areaServedJsonLd(areas: readonly AreaServed[]): JsonLdObject[] {
  return areas.map((a) => ({
    "@type": a.kind === "city" ? "City" : "AdministrativeArea",
    name: a.name,
  }));
}

/**
 * The LocalBusiness node, emitted sitewide by the marketing layout. It carries
 * no offers: reading the live service list to build them would tie every public
 * route — and the build itself — to the database. Offers come from
 * {@link buildBusinessOffersJsonLd} on the one page that already reads them.
 */
export function buildBusinessJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": businessId(),
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    description: BUSINESS.description,
    url: getSiteUrl(),
    image: absoluteUrl(BUSINESS.imagePath),
    priceRange: BUSINESS.priceRange,
    address: {
      "@type": "PostalAddress",
      addressRegion: BUSINESS.addressRegion,
      addressCountry: BUSINESS.addressCountry,
    },
    areaServed: areaServedJsonLd(BUSINESS.areaServed),
  };
}

/**
 * The offers half of the business node — the `@id` plus `makesOffer` and
 * nothing else, so it reads as more properties for the node the layout already
 * emitted rather than a second LocalBusiness entity with the same identifier.
 * Returns null with no services, so no empty offer list is ever published.
 * Emit only from a page that already reads the live service list.
 */
export function buildBusinessOffersJsonLd(
  services: readonly ServiceLike[],
): JsonLdObject | null {
  if (services.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": businessId(),
    makesOffer: services.map((s) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: s.name,
        url: absoluteUrl(`/book/${s.slug}`),
      },
    })),
  };
}

export function buildWebSiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${getSiteUrl()}/#website`,
    url: getSiteUrl(),
    name: BUSINESS.name,
    publisher: { "@id": businessId() },
  };
}

export function buildServiceJsonLd(service: ServiceLike): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    // Only spread description when non-null so the key is absent entirely.
    ...(service.description !== null
      ? { description: service.description }
      : {}),
    url: absoluteUrl(`/book/${service.slug}`),
    areaServed: areaServedJsonLd(BUSINESS.areaServed),
    provider: { "@id": businessId() },
  };
}

export function buildBreadcrumbJsonLd(
  items: readonly BreadcrumbItem[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildPersonJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Cal Barba",
    url: absoluteUrl("/about"),
    jobTitle: "Pet Care Provider",
    worksFor: { "@id": businessId() },
  };
}

/**
 * AggregateRating + Review markup. Returns null when there are no reviews.
 * Render ONLY on /reviews, where the ratings are visible (Google policy).
 */
export function buildReviewsJsonLd(
  reviews: readonly ReviewLike[],
): JsonLdObject | null {
  if (reviews.length === 0) return null;
  const mean = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": businessId(),
    name: BUSINESS.name,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Math.round(mean * 10) / 10,
      reviewCount: reviews.length,
      bestRating: 5,
      worstRating: 1,
    },
    review: reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author_name },
      datePublished: r.created_at.slice(0, 10),
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
      reviewBody: r.body,
    })),
  };
}
