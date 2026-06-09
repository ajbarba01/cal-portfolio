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
 *
 * Inline links are written into a body with markdown syntax — `[label](href)` —
 * and rendered by the `MarketingCopy` component (see `src/content/linkify.ts`).
 */
export const copy = {
  // Home — src/app/(marketing)/page.tsx
  "home.hero.hook": "Reliable dog walking and pet care on the Front Range",
  "home.hero.body":
    "Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover",
  "home.why.header": "[[HEADER: why-Cal section]]",
  "home.trust.1.title": "Safety first",
  "home.trust.1.body":
    "Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow, I've learned a great deal about pet safety, health, and risk prevention. I incorporate this knowledge into every walk, visit, and house sit, helping keep pets safe, healthy, and happy. I also hope to help pet owners learn more about keeping their animals safe through the [resources](/resources) available on this site.",
  "home.trust.2.title": "Well-trusted",
  "home.trust.2.body":
    "I work hard to earn the trust of both pets and their people. I'm grateful for the many kind reviews and recommendations I've received over the years, and I approach every visit, walk, and house sit with the same level of care and attention. You can read reviews and references from past clients [here](/reviews).",
  "home.trust.3.title": "Experienced",
  "home.trust.3.body":
    "I've been working in the pet care industry since 2021 and have cared for hundreds of animals with a wide range of personalities, ages, and needs. While most of my experience is with large-breed dogs, I've worked with all kinds of pets—from chickens and tortoises to senior Chihuahuas and energetic puppies. Every animal is different, and I enjoy getting to know each one as an individual.",
  "home.cta.header": "Think we might be a good fit?",
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
  // Inline /reviews link: when Cal's real copy lands, write it into the body as
  // a `[Reviews](/reviews)` markdown marker (rendered by MarketingCopy).
  "about.references": "[[BODY: pointer to references and the reviews page]]",

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
