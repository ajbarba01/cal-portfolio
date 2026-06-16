// src/features/seo/index.ts
// Public API of the seo feature. Import only from here (boundaries rule).
export { getSiteUrl, absoluteUrl } from "./site-url";
export { BUSINESS, type AreaServed } from "./business";
export { buildPageMetadata, type PageMetadataInput } from "./metadata";
export {
  buildBusinessJsonLd,
  buildWebSiteJsonLd,
  buildServiceJsonLd,
  buildBreadcrumbJsonLd,
  buildPersonJsonLd,
  buildReviewsJsonLd,
  businessId,
  type JsonLdObject,
  type BreadcrumbItem,
} from "./json-ld";
export { JsonLd } from "./json-ld-script";
export { buildSitemap, SITEMAP_STATIC_PATHS } from "./sitemap";
export { buildRobots, ROBOTS_DISALLOW } from "./robots";
