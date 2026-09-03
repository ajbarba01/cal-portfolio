// src/features/seo/json-ld.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  buildBusinessJsonLd,
  buildBusinessOffersJsonLd,
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

/** Narrow an unknown value to a plain object for test assertions. */
function asObj(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new Error("expected object");
  return v as Record<string, unknown>;
}

describe("buildBusinessJsonLd", () => {
  it("emits a LocalBusiness with region CO, area served, and NO street address", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = asObj(buildBusinessJsonLd());
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld["@id"]).toBe("https://calbarba.com/#business");
    const address = asObj(ld.address);
    expect(address.addressRegion).toBe("CO");
    expect(address.streetAddress).toBeUndefined();
    expect(ld.telephone).toBeUndefined();
    expect(ld.areaServed).toEqual([
      { "@type": "AdministrativeArea", name: "Front Range, Colorado" },
      { "@type": "City", name: "Denver" },
      { "@type": "City", name: "Lakewood" },
    ]);
  });

  it("carries no offers — they belong to the page that reads the services", () => {
    const ld = asObj(buildBusinessJsonLd());
    expect("makesOffer" in ld).toBe(false);
  });
});

describe("buildBusinessOffersJsonLd", () => {
  it("references the business @id and describes each service as an offer", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = asObj(buildBusinessOffersJsonLd(SERVICES));
    expect(ld["@id"]).toBe("https://calbarba.com/#business");
    const offers = ld.makesOffer as unknown[];
    expect(offers).toHaveLength(2);
    const itemOffered = asObj(asObj(offers[0]).itemOffered);
    expect(itemOffered.url).toBe("https://calbarba.com/book/walk");
  });

  it("carries only the offers, so it is a reference and not a second entity", () => {
    // A same-`@id` node that repeats name/address/areaServed reads as a
    // duplicate LocalBusiness to a strict validator; only the delta is emitted.
    const ld = asObj(buildBusinessOffersJsonLd(SERVICES));
    expect(Object.keys(ld).sort()).toEqual([
      "@context",
      "@id",
      "@type",
      "makesOffer",
    ]);
  });

  it("never fabricates a price on offers", () => {
    const ld = asObj(buildBusinessOffersJsonLd(SERVICES));
    const offer0 = asObj((ld.makesOffer as unknown[])[0]);
    expect(offer0.price).toBeUndefined();
    expect(offer0.priceSpecification).toBeUndefined();
  });

  it("returns null with no services rather than an empty offer list", () => {
    expect(buildBusinessOffersJsonLd([])).toBeNull();
    expect(businessId()).toContain("#business");
  });
});

describe("buildWebSiteJsonLd", () => {
  it("links the publisher to the business @id", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = asObj(buildWebSiteJsonLd());
    expect(ld["@type"]).toBe("WebSite");
    expect(asObj(ld.publisher)["@id"]).toBe(businessId());
  });
});

describe("buildServiceJsonLd", () => {
  it("omits description when null and points provider at the business", () => {
    const ld = asObj(
      buildServiceJsonLd({
        name: "House Sitting",
        slug: "house-sitting",
        description: null,
      }),
    );
    expect(ld["@type"]).toBe("Service");
    expect("description" in ld).toBe(false);
    expect(asObj(ld.provider)["@id"]).toBe(businessId());
  });
});

describe("buildBreadcrumbJsonLd", () => {
  it("numbers items from 1 with absolute item URLs", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const ld = asObj(
      buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "About", path: "/about" },
      ]),
    );
    const items = ld.itemListElement as unknown[];
    expect(asObj(items[0]).position).toBe(1);
    expect(asObj(items[1]).item).toBe("https://calbarba.com/about");
  });
});

describe("buildPersonJsonLd", () => {
  it("describes Cal and links to the business", () => {
    const ld = asObj(buildPersonJsonLd());
    expect(ld["@type"]).toBe("Person");
    expect(ld.name).toBe("Cal Barba");
    expect(asObj(ld.worksFor)["@id"]).toBe(businessId());
  });
});

describe("buildReviewsJsonLd", () => {
  it("returns null for no reviews", () => {
    expect(buildReviewsJsonLd([])).toBeNull();
  });

  it("computes a rounded aggregate rating + review count", () => {
    const ld = asObj(
      buildReviewsJsonLd([
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
      ]),
    );
    const agg = asObj(ld.aggregateRating);
    expect(agg.ratingValue).toBe(4.5);
    expect(agg.reviewCount).toBe(2);
    const reviews = ld.review as unknown[];
    expect(asObj(reviews[0]).datePublished).toBe("2026-01-01");
  });
});
