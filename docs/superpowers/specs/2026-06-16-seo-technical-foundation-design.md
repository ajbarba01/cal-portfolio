# SEO — Technical On-Page Foundation (design)

_Status: design approved 2026-06-16. Scope: code-only technical SEO. Content/keyword work and off-page execution are out of scope (off-page captured as a non-code appendix for Cal)._

## Problem

The site ships almost no machine-readable SEO surface. Today only a root `title` + `description` exist ([src/app/layout.tsx](../../../src/app/layout.tsx)), plus ad-hoc metadata on `contact` and `showcase`. Missing: `metadataBase`, per-page metadata/canonicals, `sitemap.ts`, `robots.ts`, Open Graph / Twitter cards, and any structured data. For a **local service business** (dog walking / house sitting on Colorado's Front Range) the largest gap is the absence of `LocalBusiness` JSON-LD and a correct geographic signal.

A secondary defect: the root metadata description hardcodes **"Boulder, CO"** ([layout.tsx:30](../../../src/app/layout.tsx#L30)), which contradicts the actual service area. Visible marketing copy is already correct ("Front Range", "Colorado", "Lakewood"); only the metadata string is stale.

## Goals

- Correct, complete metadata on every public route (title, description, canonical, OG, Twitter).
- A single source of truth for business identity + geography, consumed everywhere.
- `sitemap.ts` + `robots.ts` reflecting the real public/private route split.
- `LocalBusiness` / `WebSite` / `Service` / `BreadcrumbList` JSON-LD, geographically accurate to the Front Range.
- Branded Open Graph image (wordmark-only for now).
- Fix the stale "Boulder" metadata.

## Non-goals

- Content/keyword rewriting of marketing copy (separate sub-project; needs Cal's voice + `copy-sync`).
- Off-page execution (Google Business Profile, citations, review acquisition) — documented only.
- **Favicon / app-icon / manifest icon artwork** — deferred: the brand mark is not finalized. Manifest _metadata_ is authored now; icon files are a follow-up.
- Hard-coded price markup in structured data (pricing is rule-based + distance-variable; fake prices risk Google penalties).

## Geography decision (load-bearing)

Modeled as a **service-area business** — no public street address.

- `addressRegion`: `"CO"`
- `areaServed`: Lakewood, Denver, and "Front Range, Colorado" (service area, not a storefront)
- Lakewood is the base locality, surfaced only where a `City`/locality is required.
- `telephone` and `sameAs` are **omitted** until Cal has a public phone + Google Business Profile. Omission beats inconsistent NAP.

## Architecture

A single centralized module, `src/features/seo/`, holding (a) the business-identity source of truth and (b) pure builder functions. Pages stay declarative — they call builders, they don't hold facts.

Rejected alternatives: inline per-page metadata (scatters NAP → drift, violates single-source-of-truth); a third-party SEO lib (App Router's native `Metadata` + file conventions make it a needless dependency).

### Units

- **`src/features/seo/business.ts`** — typed `BUSINESS` constant: `name`, `legalName`, `url`, `description`, `areaServed[]`, `addressRegion`, `priceRange`, `logo`/`image`. The one file to edit when phone/socials/NAP become available. Pure data, no I/O.
- **`src/features/seo/site-url.ts`** — resolves the origin: `process.env.NEXT_PUBLIC_SITE_URL ?? "https://calbarba.com"`. Used by `metadataBase`, sitemap, robots, JSON-LD `@id`s.
- **`src/features/seo/metadata.ts`** — pure `buildPageMetadata({ title, description, path, image? }) => Metadata`: sets per-page `title`, `description`, `alternates.canonical`, and OG `url`/`title`/`description`. DRYs every marketing page.
- **`src/features/seo/json-ld.ts`** — pure builders returning typed JSON-LD objects: `buildBusinessJsonLd()`, `buildWebSiteJsonLd()`, `buildServiceJsonLd(service)`, `buildBreadcrumbJsonLd(items)`, `buildPersonJsonLd()`, `buildReviewsJsonLd(reviews)`. A small `<JsonLd data={...} />` server component renders `<script type="application/ld+json">`.

### Metadata layer

- **Root** ([layout.tsx](../../../src/app/layout.tsx)): add `metadataBase`, `title.template = "%s · Cal Barba"`, a default OG (`type: website`, `siteName`, `locale: en_US`) + Twitter (`summary_large_image`), and `robots: { index: true, follow: true }`. Rewrite the description off "Boulder".
- **Each public marketing page** (`home`, `about`, `services`, `gallery`, `reviews`, `resources`, `book`, `book/[serviceSlug]`, `contact`) exports `metadata` (or `generateMetadata` for the dynamic service route) via `buildPageMetadata`. `contact` migrates its existing ad-hoc metadata onto the helper.
- **Private trees** (`(account)`, `(admin)`, `showcase`): `robots: { index: false, follow: false }` at the layout level — defense-in-depth alongside `robots.ts` disallow.

### Routing files

- **`src/app/sitemap.ts`** — static marketing routes + dynamic `/book/[serviceSlug]` enumerated from active `services` (public anon read). Per-entry `lastModified`, `changeFrequency`, `priority`. Excludes admin/account/api/showcase/auth.
- **`src/app/robots.ts`** — `allow: "/"`, `disallow: ["/admin", "/account", "/api", "/showcase", <auth routes>]`, plus `sitemap` URL and `host`.

### Structured data placement

- **Root layout**: `LocalBusiness` node (`@id = {url}#business`) — name, description, url, `areaServed`, `addressRegion`, `priceRange`, `logo`, and `makesOffer` → the four services. Plus a `WebSite` node. No `SearchAction` (no site search). No `aggregateRating` here (see below).
- **`/reviews` only**: `aggregateRating` + individual `Review` items built from published reviews, referencing the business `@id`. Scoped to this page because Google requires the rating be visible on the same page; sitewide placement would be policy-risky.
- **Per marketing page**: `BreadcrumbList`.
- **About page**: `Person` (Cal), linked as `founder` of the business node.
- **Service entries** omit hard prices — names + `areaServed` + `provider` only.

### Open Graph image

- **`src/app/opengraph-image.tsx`** via `next/og` `ImageResponse`, 1200×630: **wordmark/text-only** — "Cal Barba" in Newsreader + tagline on the Trail palette, **no brand mark** (icon not finalized). Inherited by all routes. Per-page imagery (e.g. a gallery photo) is deferred (YAGNI). `twitter-image` reuses the same.

### Deferred: icons + manifest art

- Author **`src/app/manifest.ts`** metadata now (name, `short_name`, `theme_color`/`background_color` from Trail tokens, `display`), but **leave `icons` minimal/empty and do not add `app/icon`, `app/apple-icon`, or replace `favicon.ico`** until the brand mark is final. Tracked as a follow-up.

### Boulder fix (same-commit doc rule)

- Rewrite [layout.tsx:30](../../../src/app/layout.tsx#L30) description to Front Range / Colorado wording.
- Grep `docs/DESIGN.md` for any geographic line and correct/flag it in the same commit. Visible `src/content/marketing.ts` copy is already correct — untouched.

## Data flow

Build/request time: `business.ts` + `site-url.ts` feed the pure builders → metadata exports and `<JsonLd>` components render server-side into static HTML. `sitemap.ts` reads active services once. No client JS, no runtime cost; public routes stay static.

## Error handling

Builders are total functions over typed input — no throw paths. The services query in `sitemap.ts` degrades to the static route set if the read fails (sitemap still valid). `ImageResponse` font load failures fall back to a system font rather than failing the route.

## Testing

- Unit-test every pure builder (`buildPageMetadata`, `buildBusinessJsonLd`, `buildServiceJsonLd`, `buildBreadcrumbJsonLd`, `buildReviewsJsonLd`): assert required-field shape + geographic correctness (region CO, areaServed, no street address, no fabricated phone/price).
- Shape-test `sitemap()` and `robots()` outputs (expected route inclusion/exclusion).
- Manual gate: `npm run build` stays static; view-source confirms `<meta>` + `<script type="application/ld+json">`; Google Rich Results Test validates the JSON-LD; Lighthouse SEO target 100.

## Verification

`npm run build` (static, no regressions) · typecheck · lint (`design-system/no-drift` unaffected) · unit tests green · rendered-HTML spot check for meta + JSON-LD.

## Open items flagged to maintainer

- **No public phone / social profiles** → schema omits `telephone` + `sameAs`. Add to `business.ts` when available.
- **`aggregateRating` scoped to `/reviews`** — deliberate, Google policy compliance.
- **Icons deferred** — unblock when the brand mark is finalized.

## Appendix — off-page checklist (non-code, for Cal)

Not executed by this work; tracked here so it isn't lost.

- **Google Business Profile** — create + verify (service-area, hours, service list). Highest-leverage local asset; feeds the map pack.
- **NAP consistency** — keep Name / area / phone identical across the Profile, the site's `business.ts`, and any directory listing.
- **Citations** — consistent listings on Yelp, Nextdoor, Rover where relevant.
- **Reviews** — steady flow of Google reviews (distinct from on-site reviews, which feed the `/reviews` JSON-LD).

---

_Follow-up sub-projects (separate spec → plan each): content/keyword pass over `src/content/marketing.ts`; finalized brand mark → icon/favicon/manifest art._
