# SEO Technical Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, geographically-correct technical SEO surface (metadata, canonicals, sitemap, robots, JSON-LD, OG image) driven by a single business-identity source of truth.

**Architecture:** A centralized `src/features/seo/` module holds the business-identity constant + pure builder functions (metadata, JSON-LD, sitemap, robots). App Router files (`layout.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`, `opengraph-image.tsx`) and marketing pages stay declarative — they call builders, they hold no facts. Geography is modeled as a service-area business on Colorado's Front Range (region CO, no street address, no fabricated phone/price).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Vitest · `next/og` `ImageResponse`. Data reads use the existing `createStaticClient()` (anon, cookie-free) + `listActiveServices` / `listPublishedReviews`.

**Spec:** [docs/superpowers/specs/2026-06-16-seo-technical-foundation-design.md](../specs/2026-06-16-seo-technical-foundation-design.md)

**Conventions in this repo (read before starting):**

- Features are imported **only** via their `index.ts` barrel (`eslint-plugin-boundaries` `entry-point` rule). App/pages import `@/features/seo`, never deep paths.
- Tests are co-located `*.test.ts`, Vitest with `globals: true` (`describe`/`it`/`expect` available; explicit imports also fine). Run a single file with `npx vitest run <path>`.
- Commit messages: **Conventional Commits, subject line only** — no body, no `Co-Authored-By`, no footer. No internal identifiers (no "phase"/"SP#"/plan codename) in the subject.
- Do **not** use `--no-verify`. The pre-commit hook runs `lint-staged` + `npm run typecheck`; let it run.
- `design-system/no-drift` lint only inspects `className` / `cn` / `cva` / `clsx` strings. `style={{}}` object props (used by `ImageResponse`) are not inspected, so raw hex there is fine.

---

## File Structure

**New — SEO module (`src/features/seo/`):**

- `site-url.ts` — origin resolver `getSiteUrl()` + `absoluteUrl(path)`.
- `business.ts` — `BUSINESS` identity constant + `AreaServed` type.
- `metadata.ts` — `buildPageMetadata()` helper.
- `json-ld.ts` — JSON-LD builder functions + `businessId()`.
- `json-ld-script.tsx` — `<JsonLd>` server component.
- `sitemap.ts` — pure `buildSitemap()` + `SITEMAP_STATIC_PATHS`.
- `robots.ts` — pure `buildRobots()` + `ROBOTS_DISALLOW`.
- `index.ts` — barrel (the only entry point).
- Tests: `site-url.test.ts`, `metadata.test.ts`, `json-ld.test.ts`, `sitemap.test.ts`, `robots.test.ts`.

**New — App Router convention files:**

- `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/manifest.ts`, `src/app/opengraph-image.tsx`.

**Modified:**

- `src/app/layout.tsx` — expand root metadata, fix "Boulder".
- `src/app/(site)/(marketing)/layout.tsx` — inject `LocalBusiness` + `WebSite` JSON-LD.
- Marketing pages (`page.tsx` for home, about, services, gallery, reviews, resources, contact, book, book/[serviceSlug]) — add `metadata` / `generateMetadata` + breadcrumb JSON-LD.
- `reviews/page.tsx` — `aggregateRating` + `Review` JSON-LD. `about/page.tsx` — `Person` JSON-LD.
- `src/app/(site)/(account)/layout.tsx`, `src/app/(site)/(admin)/layout.tsx`, `src/app/showcase/page.tsx` — `robots: noindex`.
- `docs/DESIGN.md` — fix/flag any stale geographic line (same-commit doc rule).

---

## Task 1: Origin resolver (`site-url.ts`)

**Files:**

- Create: `src/features/seo/site-url.ts`
- Test: `src/features/seo/site-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/seo/site-url.test.ts`
Expected: FAIL — cannot resolve `./site-url`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/seo/site-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seo/site-url.ts src/features/seo/site-url.test.ts
git commit -m "feat(seo): add site-url origin resolver"
```

---

## Task 2: Business identity constant (`business.ts`)

**Files:**

- Create: `src/features/seo/business.ts`

No test (pure data, no logic) — its correctness is asserted indirectly by the JSON-LD tests in Task 4.

- [ ] **Step 1: Write the implementation**

```ts
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
  imagePath: "/gallery/IMG_0048.8b25e086.jpg",
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/seo/business.ts
git commit -m "feat(seo): add business identity source of truth"
```

---

## Task 3: Page metadata helper (`metadata.ts`)

**Files:**

- Create: `src/features/seo/metadata.ts`
- Test: `src/features/seo/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seo/metadata.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { buildPageMetadata } from "./metadata";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("buildPageMetadata", () => {
  it("sets a templated title, description, and absolute canonical", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const meta = buildPageMetadata({
      title: "About",
      description: "Meet Cal.",
      path: "/about",
    });
    expect(meta.title).toBe("About");
    expect(meta.description).toBe("Meet Cal.");
    expect(meta.alternates?.canonical).toBe("https://calbarba.com/about");
    expect(meta.openGraph?.url).toBe("https://calbarba.com/about");
  });

  it("supports an absolute (un-templated) title for the home page", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const meta = buildPageMetadata({
      title: "Cal Barba — Dog Walking & House Sitting on the Front Range",
      description: "Home.",
      path: "/",
      absoluteTitle: true,
    });
    expect(meta.title).toEqual({
      absolute: "Cal Barba — Dog Walking & House Sitting on the Front Range",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/seo/metadata.test.ts`
Expected: FAIL — cannot resolve `./metadata`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/seo/metadata.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seo/metadata.ts src/features/seo/metadata.test.ts
git commit -m "feat(seo): add per-page metadata helper"
```

---

## Task 4: JSON-LD builders (`json-ld.ts`)

**Files:**

- Create: `src/features/seo/json-ld.ts`
- Test: `src/features/seo/json-ld.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seo/json-ld.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  buildBusinessJsonLd,
  buildWebSiteJsonLd,
  buildServiceJsonLd,
  buildBreadcrumbJsonLd,
  buildPersonJsonLd,
  buildReviewsJsonLd,
  businessId,
} from "./json-ld";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

const SERVICES = [
  { name: "Dog Walking", slug: "walk", description: "On-leash walks." },
  { name: "House Sitting", slug: "house-sitting", description: null },
];

describe("buildBusinessJsonLd", () => {
  it("emits a LocalBusiness with region CO, area served, and NO street address", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = buildBusinessJsonLd(SERVICES) as Record<string, any>;
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld["@id"]).toBe("https://calbarba.com/#business");
    expect(ld.address.addressRegion).toBe("CO");
    expect(ld.address.streetAddress).toBeUndefined();
    expect(ld.telephone).toBeUndefined();
    expect(ld.areaServed).toEqual([
      { "@type": "AdministrativeArea", name: "Front Range, Colorado" },
      { "@type": "City", name: "Denver" },
      { "@type": "City", name: "Lakewood" },
    ]);
    expect(ld.makesOffer).toHaveLength(2);
    expect(ld.makesOffer[0].itemOffered.url).toBe(
      "https://calbarba.com/book/walk",
    );
  });

  it("never fabricates a price on offers", () => {
    const ld = buildBusinessJsonLd(SERVICES) as Record<string, any>;
    expect(ld.makesOffer[0].price).toBeUndefined();
    expect(ld.makesOffer[0].priceSpecification).toBeUndefined();
  });
});

describe("buildWebSiteJsonLd", () => {
  it("links the publisher to the business @id", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = buildWebSiteJsonLd() as Record<string, any>;
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.publisher["@id"]).toBe(businessId());
  });
});

describe("buildServiceJsonLd", () => {
  it("omits description when null and points provider at the business", () => {
    const ld = buildServiceJsonLd({
      name: "House Sitting",
      slug: "house-sitting",
      description: null,
    }) as Record<string, any>;
    expect(ld["@type"]).toBe("Service");
    expect("description" in ld).toBe(false);
    expect(ld.provider["@id"]).toBe(businessId());
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers items from 1 with absolute item URLs", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "About", path: "/about" },
    ]) as Record<string, any>;
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[1].item).toBe("https://calbarba.com/about");
  });
});

describe("buildPersonJsonLd", () => {
  it("describes Cal and links to the business", () => {
    const ld = buildPersonJsonLd() as Record<string, any>;
    expect(ld["@type"]).toBe("Person");
    expect(ld.name).toBe("Cal Barba");
    expect(ld.worksFor["@id"]).toBe(businessId());
  });
});

describe("buildReviewsJsonLd", () => {
  it("returns null for no reviews", () => {
    expect(buildReviewsJsonLd([])).toBeNull();
  });

  it("computes a rounded aggregate rating + review count", () => {
    const ld = buildReviewsJsonLd([
      {
        author_name: "A",
        rating: 5,
        body: "Great",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        author_name: "B",
        rating: 4,
        body: "Good",
        created_at: "2026-02-01T00:00:00Z",
      },
    ]) as Record<string, any>;
    expect(ld.aggregateRating.ratingValue).toBe(4.5);
    expect(ld.aggregateRating.reviewCount).toBe(2);
    expect(ld.review[0].datePublished).toBe("2026-01-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/seo/json-ld.test.ts`
Expected: FAIL — cannot resolve `./json-ld`.

- [ ] **Step 3: Write the implementation**

```ts
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

export function buildBusinessJsonLd(
  services: readonly ServiceLike[],
): JsonLdObject {
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
    // `undefined` keys are dropped by JSON.stringify — no empty description.
    description: service.description ?? undefined,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/seo/json-ld.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seo/json-ld.ts src/features/seo/json-ld.test.ts
git commit -m "feat(seo): add structured-data builders"
```

---

## Task 5: JsonLd render component (`json-ld-script.tsx`)

**Files:**

- Create: `src/features/seo/json-ld-script.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/features/seo/json-ld-script.tsx
import type { JsonLdObject } from "./json-ld";

/**
 * Renders a JSON-LD <script>. Server component; the object is serialized inline.
 * `<script>` is valid HTML in <body>, so this may be placed in layouts/pages.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/seo/json-ld-script.tsx
git commit -m "feat(seo): add JsonLd render component"
```

---

## Task 6: Sitemap + robots pure builders

**Files:**

- Create: `src/features/seo/sitemap.ts`
- Create: `src/features/seo/robots.ts`
- Test: `src/features/seo/sitemap.test.ts`
- Test: `src/features/seo/robots.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

```ts
// src/features/seo/robots.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { buildRobots } from "./robots";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("buildRobots", () => {
  it("allows root, disallows private trees, and points at the sitemap", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const r = buildRobots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/admin",
        "/account",
        "/login",
        "/auth",
        "/showcase",
      ]),
    );
    expect(r.sitemap).toBe("https://calbarba.com/sitemap.xml");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/seo/sitemap.test.ts src/features/seo/robots.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Write the implementations**

```ts
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
```

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/seo/sitemap.test.ts src/features/seo/robots.test.ts`
Expected: PASS (3 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/features/seo/sitemap.ts src/features/seo/robots.ts src/features/seo/sitemap.test.ts src/features/seo/robots.test.ts
git commit -m "feat(seo): add sitemap and robots builders"
```

---

## Task 7: Barrel export (`index.ts`)

**Files:**

- Create: `src/features/seo/index.ts`

- [ ] **Step 1: Write the implementation**

```ts
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
```

- [ ] **Step 2: Verify lint + typecheck (boundaries clean)**

Run: `npm run typecheck && npm run lint`
Expected: no errors (the barrel is the feature's entry point).

- [ ] **Step 3: Commit**

```bash
git add src/features/seo/index.ts
git commit -m "feat(seo): expose seo module barrel"
```

---

## Task 8: Root layout metadata + Boulder fix

**Files:**

- Modify: `src/app/layout.tsx` (replace the `metadata` export, lines 27-31)
- Modify: `docs/DESIGN.md` (flag/fix any stale geo line)

- [ ] **Step 1: Replace the metadata export**

In `src/app/layout.tsx`, add to the imports near the top:

```ts
import { getSiteUrl } from "@/features/seo";
```

Replace the existing `export const metadata` block:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Cal Barba — Dog Walking & House Sitting on the Front Range",
    template: "%s · Cal Barba",
  },
  description:
    "Professional dog walking and house sitting across Colorado's Front Range. Reliable, caring pet care tailored to your dog's needs.",
  applicationName: "Cal Barba",
  openGraph: {
    type: "website",
    siteName: "Cal Barba",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};
```

- [ ] **Step 2: Fix the stale geo reference in DESIGN.md**

Run: `git grep -n "Boulder" docs/DESIGN.md`
For any line describing the service area as Boulder, change it to "Front Range, Colorado". If the only match is incidental (e.g. inside an unrelated example), leave it and note it in the commit. (The visible marketing copy in `src/content/marketing.ts` is already correct — do not touch it.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors. (`metadataBase` now resolves OG/canonical URLs absolutely.)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx docs/DESIGN.md
git commit -m "feat(seo): expand root metadata and correct service-area geography"
```

---

## Task 9: Inject business + website JSON-LD in the marketing layout

**Files:**

- Modify: `src/app/(site)/(marketing)/layout.tsx`

- [ ] **Step 1: Rewrite the layout to fetch services and inject JSON-LD**

```tsx
// src/app/(site)/(marketing)/layout.tsx
import { ContentArea } from "@/components/layout/content-area";
import { createStaticClient } from "@/lib/supabase/static";
import { listActiveServices } from "@/features/booking";
import {
  JsonLd,
  buildBusinessJsonLd,
  buildWebSiteJsonLd,
} from "@/features/seo";

/** Public marketing routes. Chrome (header/footer/sheet) is provided by the
 *  parent (site) shell; this layout supplies the content main + sitewide
 *  LocalBusiness/WebSite structured data. */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const services = await listActiveServices(createStaticClient());
  return (
    <main className="flex-1">
      <JsonLd data={buildBusinessJsonLd(services)} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <ContentArea>{children}</ContentArea>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build still prerenders the marketing routes**

Run: `npm run build`
Expected: build succeeds; marketing routes remain static (`listActiveServices` uses the cookie-free static client, same as the existing `/services` page).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(site)/(marketing)/layout.tsx"
git commit -m "feat(seo): inject LocalBusiness and WebSite structured data"
```

---

## Task 10: Per-page metadata + breadcrumb JSON-LD (static marketing pages)

Apply the **same pattern** to each static marketing page below. The pattern is identical; only the tabulated values differ. For each page: add the imports, add a `metadata` export, and render a breadcrumb `<JsonLd>` as the first child of the page's returned fragment.

**Pattern (imports):**

```ts
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  JsonLd,
} from "@/features/seo";
```

**Pattern (metadata export — non-home):**

```ts
export const metadata = buildPageMetadata({
  title: "<TITLE>",
  description: "<DESCRIPTION>",
  path: "<PATH>",
});
```

**Pattern (breadcrumb, rendered first inside the page's returned JSX):**

```tsx
<JsonLd
  data={buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "<TITLE>", path: "<PATH>" },
  ])}
/>
```

If a page's root return is a single element (not a fragment), wrap it in a `<>...</>` fragment so the `<JsonLd>` can sit beside it.

**Per-page values:**

| File                                            | TITLE     | PATH       | DESCRIPTION                                                                                                                |
| ----------------------------------------------- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(site)/(marketing)/about/page.tsx`     | About     | /about     | Meet Cal Barba — a Lakewood-based dog walker and house sitter serving Colorado's Front Range, with his husky mix Kiche.    |
| `src/app/(site)/(marketing)/services/page.tsx`  | Services  | /services  | Dog walking, house sitting, drop-in check-ins, and training across the Front Range — what's offered and how pricing works. |
| `src/app/(site)/(marketing)/gallery/page.tsx`   | Gallery   | /gallery   | Photos from walks, sits, and Colorado adventures with the dogs in Cal Barba's care.                                        |
| `src/app/(site)/(marketing)/resources/page.tsx` | Resources | /resources | Pet-care guidance and Colorado-specific safety notes — heat, foxtails, algae blooms — from Cal Barba.                      |
| `src/app/(site)/(marketing)/contact/page.tsx`   | Contact   | /contact   | Get in touch with Cal Barba about dog walking or house sitting on Colorado's Front Range.                                  |
| `src/app/(site)/(marketing)/book/page.tsx`      | Book      | /book      | Check availability and book dog walking or house sitting with Cal Barba across the Front Range.                            |

**Notes per file:**

- `contact/page.tsx` — **replace** the existing `export const metadata = { title: "Contact" };` (line 10) with the `buildPageMetadata` form above.
- `services/page.tsx` and `gallery/page.tsx` are `async`/data pages — the `metadata` export is a sibling module export, unaffected by the component being async.

- [ ] **Step 1: Apply the imports + metadata export + breadcrumb to all six files above.**

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint (breadcrumb JSX introduces no className drift)**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/(marketing)/about/page.tsx" "src/app/(site)/(marketing)/services/page.tsx" "src/app/(site)/(marketing)/gallery/page.tsx" "src/app/(site)/(marketing)/resources/page.tsx" "src/app/(site)/(marketing)/contact/page.tsx" "src/app/(site)/(marketing)/book/page.tsx"
git commit -m "feat(seo): add per-page metadata and breadcrumbs to marketing routes"
```

---

## Task 11: Home page metadata + Person on About + reviews aggregateRating

**Files:**

- Modify: `src/app/(site)/(marketing)/page.tsx` (home)
- Modify: `src/app/(site)/(marketing)/about/page.tsx` (add Person JSON-LD)
- Modify: `src/app/(site)/(marketing)/reviews/page.tsx` (metadata + aggregateRating)

- [ ] **Step 1: Home page metadata (absolute title, canonical "/")**

In `src/app/(site)/(marketing)/page.tsx` add the import and metadata export:

```ts
import { buildPageMetadata } from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Cal Barba — Dog Walking & House Sitting on the Front Range",
  description:
    "Reliable dog walking and house sitting across Colorado's Front Range. Caring, dependable pet care tailored to your dog.",
  path: "/",
  absoluteTitle: true,
});
```

(No breadcrumb on the home page — it is the breadcrumb root.)

- [ ] **Step 2: Add Person JSON-LD to the About page**

In `src/app/(site)/(marketing)/about/page.tsx`, extend the seo import to include `buildPersonJsonLd`, and render `<JsonLd data={buildPersonJsonLd()} />` alongside the breadcrumb added in Task 10:

```ts
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildPersonJsonLd,
  JsonLd,
} from "@/features/seo";
```

```tsx
<JsonLd data={buildPersonJsonLd()} />
```

- [ ] **Step 3: Reviews page — metadata + aggregateRating JSON-LD**

`src/app/(site)/(marketing)/reviews/page.tsx` already loads `reviews` via `listPublishedReviews(createStaticClient())` (line 48). Add the seo imports, a `metadata` export, a breadcrumb, and the reviews JSON-LD (only when non-null):

```ts
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildReviewsJsonLd,
  JsonLd,
} from "@/features/seo";

export const metadata = buildPageMetadata({
  title: "Reviews",
  description:
    "What Front Range clients say about Cal Barba's dog walking and house sitting.",
  path: "/reviews",
});
```

Inside `ReviewsPage`, after `const reviews = await listPublishedReviews(...)`, build the node and render it first:

```tsx
const reviewsLd = buildReviewsJsonLd(reviews);
// ...in the returned JSX, before the page content:
<JsonLd
  data={buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Reviews", path: "/reviews" },
  ])}
/>;
{
  reviewsLd ? <JsonLd data={reviewsLd} /> : null;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(site)/(marketing)/page.tsx" "src/app/(site)/(marketing)/about/page.tsx" "src/app/(site)/(marketing)/reviews/page.tsx"
git commit -m "feat(seo): add home metadata, founder Person, and review ratings"
```

---

## Task 12: Dynamic service page metadata (`book/[serviceSlug]`)

**Files:**

- Modify: `src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx`

- [ ] **Step 1: Add `generateMetadata` + a Service breadcrumb**

Add the imports:

```ts
import {
  buildPageMetadata,
  buildBreadcrumbJsonLd,
  buildServiceJsonLd,
  JsonLd,
} from "@/features/seo";
import { createStaticClient } from "@/lib/supabase/static";
```

Add a `generateMetadata` export (the route already receives `params: Promise<{ serviceSlug: string }>`):

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const services = await listActiveServices(createStaticClient());
  const service = services.find((s) => s.slug === serviceSlug);
  const title = service?.name ?? "Book";
  return buildPageMetadata({
    title,
    description:
      service?.description ??
      "Check availability and book with Cal Barba across Colorado's Front Range.",
    path: `/book/${serviceSlug}`,
  });
}
```

In the page component, render a breadcrumb + `Service` JSON-LD for the resolved service (the component already resolves `serviceSlug` and loads service data; reuse the loaded service if available, otherwise look it up from `listActiveServices`). Render first in the returned JSX:

```tsx
{
  service ? (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Book", path: "/book" },
          { name: service.name, path: `/book/${service.slug}` },
        ])}
      />
      <JsonLd
        data={buildServiceJsonLd({
          name: service.name,
          slug: service.slug,
          description: service.description,
        })}
      />
    </>
  ) : null;
}
```

If the existing component does not already have a `PublicService`-shaped `service` in scope, add `const service = (await listActiveServices(createStaticClient())).find((s) => s.slug === serviceSlug) ?? null;` near the top of the component body and use it for the JSON-LD only (do not disturb existing booking-data loading).

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build`
Expected: build succeeds; the dynamic route renders per-service titles.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(site)/(marketing)/book/[serviceSlug]/page.tsx"
git commit -m "feat(seo): add per-service metadata and Service structured data"
```

---

## Task 13: sitemap.ts + robots.ts route files

**Files:**

- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.ts`

- [ ] **Step 1: Write `src/app/sitemap.ts`**

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { buildSitemap } from "@/features/seo";
import { createStaticClient } from "@/lib/supabase/static";
import { listActiveServices } from "@/features/booking";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let serviceSlugs: string[] = [];
  try {
    const services = await listActiveServices(createStaticClient());
    serviceSlugs = services.map((s) => s.slug);
  } catch {
    // Degrade to the static route set if the services read fails.
    serviceSlugs = [];
  }
  return buildSitemap({ serviceSlugs, now: new Date() });
}
```

- [ ] **Step 2: Write `src/app/robots.ts`**

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";
import { buildRobots } from "@/features/seo";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
```

- [ ] **Step 3: Verify the generated routes**

Run: `npm run build`
Expected: build output lists `/sitemap.xml` and `/robots.txt` as generated routes.

- [ ] **Step 4: Commit**

```bash
git add src/app/sitemap.ts src/app/robots.ts
git commit -m "feat(seo): add sitemap.xml and robots.txt routes"
```

---

## Task 14: Web manifest + Open Graph image

**Files:**

- Create: `src/app/manifest.ts`
- Create: `src/app/opengraph-image.tsx`

- [ ] **Step 1: Write `src/app/manifest.ts`** (icons deferred — brand mark not finalized)

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cal Barba — Pet Care",
    short_name: "Cal Barba",
    description: "Dog walking and house sitting across Colorado's Front Range.",
    start_url: "/",
    display: "browser",
    background_color: "#faf6f0", // sand-50
    theme_color: "#ae5a35", // clay-fill
    // Icons intentionally omitted until the brand mark is finalized.
    icons: [],
  };
}
```

- [ ] **Step 2: Write `src/app/opengraph-image.tsx`** (wordmark/text-only)

```tsx
// src/app/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Cal Barba — Dog Walking & House Sitting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Mirror of Trail palette tokens (ImageResponse can't read CSS vars).
const SAND_50 = "#faf6f0";
const SAND_900 = "#2b2520";
const CLAY = "#ae5a35";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        backgroundColor: SAND_50,
      }}
    >
      <div style={{ fontSize: 80, fontWeight: 700, color: SAND_900 }}>
        Cal Barba
      </div>
      <div style={{ fontSize: 36, color: CLAY, marginTop: 20 }}>
        Dog Walking · House Sitting · Front Range, Colorado
      </div>
    </div>,
    { ...size },
  );
}
```

Note: uses the `ImageResponse` default font (no Newsreader fetch) to keep the build network-free and robust. Loading the brand heading font is a future refinement, not required for a valid card.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: build succeeds; `/opengraph-image` and `/manifest.webmanifest` appear as generated routes. Lint passes (the OG hex lives in `style={{}}`, which `no-drift` does not inspect).

- [ ] **Step 4: Commit**

```bash
git add src/app/manifest.ts src/app/opengraph-image.tsx
git commit -m "feat(seo): add web manifest and Open Graph image"
```

---

## Task 15: Noindex private trees (defense-in-depth)

**Files:**

- Modify: `src/app/(site)/(account)/layout.tsx`
- Modify: `src/app/(site)/(admin)/layout.tsx`
- Modify: `src/app/showcase/page.tsx`

- [ ] **Step 1: Add a noindex metadata export to each private layout**

For `src/app/(site)/(account)/layout.tsx` and `src/app/(site)/(admin)/layout.tsx`, confirm the file has no `"use client"` directive at the top (these are server layouts). Add:

```ts
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

If a `Metadata` import already exists, reuse it. If the layout is a client component (`"use client"` present), instead add the same `metadata` export to each private **page** in that tree (a client component cannot export `metadata`).

- [ ] **Step 2: Noindex the showcase page**

`src/app/showcase/page.tsx` already exports `metadata`. Merge in `robots: { index: false, follow: false }`:

```ts
robots: { index: false, follow: false },
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/(account)/layout.tsx" "src/app/(site)/(admin)/layout.tsx" src/app/showcase/page.tsx
git commit -m "feat(seo): noindex account, admin, and showcase routes"
```

---

## Task 16: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite (unit only)**

Run: `npx vitest run src/features/seo`
Expected: all SEO tests PASS.

- [ ] **Step 2: Typecheck + lint + format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors. (If `format:check` flags only pre-existing unrelated files, that is the known repo drift; ensure your new files are clean.)

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. Confirm in the route list: `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/opengraph-image`. Marketing routes remain static (`○`/prerendered), not dynamic.

- [ ] **Step 4: Manual structured-data + metadata spot check**

Start the built app (`npm run start`) and verify:

- `view-source` on `/` shows `<meta name="description">`, `<link rel="canonical">`, OG tags, and `<script type="application/ld+json">` containing `LocalBusiness` with `"addressRegion":"CO"` and `areaServed` Front Range/Denver/Lakewood — and **no** `streetAddress`/`telephone`/fabricated price.
- `/reviews` source contains an `AggregateRating` (when published reviews exist).
- `curl -s localhost:3000/robots.txt` lists the disallows + sitemap URL.
- `curl -s localhost:3000/sitemap.xml` lists public routes only.
- Paste the home page HTML into Google's Rich Results Test — `LocalBusiness` validates with no errors.

- [ ] **Step 5: Update DEV_NOTES inbox**

Remove or check off the `- seo stuff` line in `docs/DEV_NOTES.md` "now" list and note the two deferred follow-ups (content/keyword pass; icon art once the brand mark lands).

- [ ] **Step 6: Commit**

```bash
git add docs/DEV_NOTES.md
git commit -m "docs: mark SEO foundation done, note follow-ups"
```

---

## Deferred follow-ups (separate specs/plans)

- **Content/keyword pass** over `src/content/marketing.ts` (needs Cal's voice + `copy-sync`).
- **Icon art** — `app/icon`, `app/apple-icon`, manifest icons, favicon — once the brand mark is finalized.
- **OG heading font** — load Newsreader into `ImageResponse` for brand-consistent cards.
- **Off-page (Cal)** — Google Business Profile, NAP mirror into `business.ts`, citations, reviews (see spec appendix).

```

```
