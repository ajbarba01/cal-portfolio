/**
 * Marketing copy registry — the single source for Cal-owned site copy.
 *
 * Each entry is keyed by a stable copy ID (`<page>.<section>[.<index>].<slot>`).
 * The ID is the link: the same token appears in `docs/content/cal-source.md`,
 * `docs/content/copy-ledger.md`, and here as the key. Components import `copy`
 * and read by ID; the copy-sync protocol (`docs/CONTENT.md`) writes by ID.
 *
 * Values start as `[[ ... ]]` placeholders until Cal supplies real text. Grep
 * remaining stubs with `rg "\[\["`.
 */
export const copy = {
  // Home — src/app/(marketing)/page.tsx
  "home.hero.hook": "[[HEADER: hero hook]]",
  "home.hero.body": "[[BODY: services overview and what sets Cal apart]]",
  "home.why.header": "[[HEADER: why-Cal section]]",
  "home.trust.1.title": "[[HEADER: trust point 1]]",
  "home.trust.1.body": "[[BODY: trust point 1 detail]]",
  "home.trust.2.title": "[[HEADER: trust point 2]]",
  "home.trust.2.body": "[[BODY: trust point 2 detail]]",
  "home.trust.3.title": "[[HEADER: trust point 3]]",
  "home.trust.3.body": "[[BODY: trust point 3 detail]]",
  "home.cta.header": "[[HEADER: closing CTA]]",
  "home.cta.body": "[[BODY: short prompt to book]]",

  // About — src/app/(marketing)/about/page.tsx
  "about.eyebrow": "[[HEADER: about eyebrow]]",
  "about.summary": "[[BODY: one-line about summary]]",
  "about.bio.p1": "[[BODY: bio paragraph 1 — background/experience]]",
  "about.bio.p2": "[[BODY: bio paragraph 2 — services offered]]",
  "about.bio.p3": "[[BODY: bio paragraph 3 — additional context]]",
  "about.approach.1.title": "[[Item 1: approach principle]]",
  "about.approach.1.detail": "[[Item 1: detail]]",
  "about.approach.2.title": "[[Item 2: approach principle]]",
  "about.approach.2.detail": "[[Item 2: detail]]",
  "about.approach.3.title": "[[Item 3: approach principle]]",
  "about.approach.3.detail": "[[Item 3: detail]]",
  // Split-JSX: prose wraps an inline link to /reviews (label "Reviews" is real).
  "about.references.pre": "[[BODY: pointer to references — see the]]",
  "about.references.post": "[[page]].",

  // Services — src/app/(marketing)/services/page.tsx
  "services.overview": "[[BODY: services overview]]",
  "services.pricing.header": "[[HEADER: pricing flexibility section]]",
  "services.pricing.body":
    "[[BODY: pricing accessibility statement and how to ask about it]]",

  // Reviews — src/app/(marketing)/reviews/page.tsx
  "reviews.purpose": "[[BODY: reviews section purpose]]",

  // Resources — src/app/(marketing)/resources/page.tsx
  // (r3/r4 are real public-fact entries kept inline in the page, not here.)
  "resources.1.name": "[[Resource 1: name]]",
  "resources.1.desc": "[[Resource 1: one-line description]]",
  "resources.2.name": "[[Resource 2: name]]",
  "resources.2.desc": "[[Resource 2: one-line description]]",
  "resources.faq.1.q": "[[FAQ 1: question]]",
  "resources.faq.1.a": "[[FAQ 1: answer]]",
  "resources.faq.2.q": "[[FAQ 2: question]]",
  "resources.faq.2.a": "[[FAQ 2: answer]]",
  "resources.faq.3.q": "[[FAQ 3: question]]",
  "resources.faq.3.a": "[[FAQ 3: answer]]",
  "resources.faq.4.q": "[[FAQ 4: question]]",
  "resources.faq.4.a": "[[FAQ 4: answer]]",
  "resources.faq.5.q": "[[FAQ 5: question]]",
  "resources.faq.5.a": "[[FAQ 5: answer]]",

  // Gallery — src/app/(marketing)/gallery/page.tsx
  "gallery.eyebrow": "[[HEADER: gallery eyebrow]]",
  "gallery.body": "[[BODY: one line about the photos]]",

  // Contact — src/app/(marketing)/contact/page.tsx
  "contact.header": "[[HEADER: Contact]]",
  "contact.subtitle": "[[BODY: what the contact form is for]]",

  // Footer — src/components/layout/site-footer.tsx
  "footer.tagline": "[[Pet care tagline]]",

  // Service cards — src/features/booking/service-card-display.ts
  "service.house_sitting.card.body":
    "[[BODY: short house-sitting service description]]",
  "service.check_in.card.body": "[[BODY: short check-in service description]]",
  "service.walk.card.body": "[[BODY: short walk service description]]",
  "service.training.card.body": "[[BODY: short training service description]]",
  "service.meet_greet.card.body":
    "[[BODY: short meet-and-greet service description]]",
} as const;

/** Every stable copy ID known to the registry. */
export type CopyId = keyof typeof copy;
