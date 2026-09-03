# Copy Ledger

> Per-ID tracking that bridges `docs/content/cal-source.md` (authority) and `src/content/marketing.ts` (render target). Drives the copy-sync diff. See `docs/CONTENT.md` for the protocol.
>
> Marketing copy is tracked per ID under **Entries**. The site's other text — system messages, labels and email templates, which have no copy ID and no Cal source — is tracked as a change log under **System text**, at the end of this file.

## How to read an entry

- `status`: `placeholder` | `placed` | `changed` | `drift` | `flagged` | `dropped` | `pending-owner-signoff`
  - `dropped`: the slot is gone from `marketing.ts`; the entry stays as the record of what was there and why it went.
  - `pending-owner-signoff`: the string is written and in the code, but Cal has not approved the wording.
- `provenance`: `cal-verbatim` | `cal-confirmed-edit` | `agent-resolved` | `public-fact` | `placeholder`
- `applied-from`: the exact `cal-source` text that produced the current live string (diff anchor).
- `live-text`: the string currently in `marketing.ts`. Differs from `applied-from` only by the listed `transforms`.
- `transforms`: confirmed adaptations (capitalization/punctuation, resolved action items, Cal-approved grammar).

## Entries

### home.hero.hook

- status: drift
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Pet care on the Front Range
- live-text: |
  Reliable pet care on the Front Range
- transforms: none recorded — see the drift note.
- notes: ⚠ region term "Front Range" — flagged per DESIGN.md; user confirmed keep verbatim (2026-06-09). ⚠ **drift, found 2026-09-03.** The live string gained the word "Reliable" in `34fa56e` (2026-06-15) without a ledger entry, so this is a hand edit rather than a recorded transform. Neither side was overwritten: `applied-from` is still what Cal wrote, `live-text` is what the page shows. "Reliable" is a claim about Cal's service, which is his to make — confirm it with him, then either record it as a `cal-confirmed-edit` or restore his line.

### home.hero.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover
- live-text: |
  Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover
- transforms: none
- notes: -

### home.why.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Why should pet parents choose me?
- live-text: |
  Why should pet parents choose me?
- transforms: none
- notes: replaced "[[HEADER: why-Cal section]]" placeholder (no prior ledger entry). First-person POV — within DESIGN.md guardrails (2026-06-19).

### home.trust.1.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Safety first
- live-text: |
  Safety first
- transforms: none
- notes: -

### home.trust.1.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow, I've learned a great deal about pet safety, health, and risk prevention. I incorporate this knowledge into every walk, visit, and house sit, helping keep pets safe, healthy, and happy. I also hope to help pet owners learn more about keeping their animals safe through the resources (<-- hyperlink) available on this site.
- live-text: |
  Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow, I've learned a great deal about pet safety, health, and risk prevention. I incorporate this knowledge into every walk, visit, and house sit, helping keep pets safe, healthy, and happy. I also hope to help pet owners learn more about keeping their animals safe through the [resources](/resources) available on this site.
- transforms: agent-resolved action item — "(<-- hyperlink)" on "resources" → markdown marker [resources](/resources) (target /resources, user-confirmed 2026-06-09); rendered by MarketingCopy. Cal's words unchanged.
- notes: -

### home.trust.2.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Well-trusted
- live-text: |
  Well-trusted
- transforms: none
- notes: -

### home.trust.2.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  I work hard to earn the trust of both pets and their people. I'm grateful for the many kind reviews and recommendations I've received over the years, and I approach every visit, walk, and house sit with the same level of care and attention. You can read reviews and references from past clients here.
- live-text: |
  I work hard to earn the trust of both pets and their people. I'm grateful for the many kind reviews and recommendations I've received over the years, and I approach every visit, walk, and house sit with the same level of care and attention. You can read reviews and references from past clients [here](/reviews).
- transforms: agent-resolved link target — "here" → markdown marker [here](/reviews) (user-confirmed 2026-06-09); rendered by MarketingCopy. Cal's words unchanged.
- notes: 📮 **open question for Cal (raised 2026-09-03).** The sentence promises "reviews and references"; the link goes to /reviews, which has the reviews. References now live on /about, under the `id="references"` anchor. Retargeting the marker to `/about#references` would trade one half of the promise for the other, and adding a second marker would be new copy — so nothing was changed here: the current target is a transform Cal confirmed, and the authority rule says a confirmed adaptation stands until Cal's own text changes. His call which destination the word "here" should mean.

### home.trust.3.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Experienced
- live-text: |
  Experienced
- transforms: none
- notes: -

### home.trust.3.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  I've been working in the pet care industry since 2021 and have cared for hundreds of animals with a wide range of personalities, ages, and needs. While most of my experience is with large-breed dogs, I've worked with all kinds of pets—from chickens and tortoises to senior Chihuahuas and energetic puppies. Every animal is different, and I enjoy getting to know each one as an individual.
- live-text: |
  I've been working in the pet care industry since 2021 and have cared for hundreds of animals with a wide range of personalities, ages, and needs. While most of my experience is with large-breed dogs, I've worked with all kinds of pets—from chickens and tortoises to senior Chihuahuas and energetic puppies. Every animal is different, and I enjoy getting to know each one as an individual.
- transforms: none
- notes: -

### home.cta.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  Think we might be a good fit?
- live-text: |
  Think we might be a good fit?
- transforms: none
- notes: -

### home.cta.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  See services and pricing below
- live-text: |
  See services and pricing below
- transforms: none
- notes: replaced "[[BODY: short prompt to book]]" placeholder (no prior ledger entry) (2026-06-19).

### about.summary

- status: drift
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Hi! I'm Cal.
- live-text: |
  And Kiche!
- transforms: none recorded — see the drift note.
- notes: renders as the hero body line; hardcoded hero title set to "Meet Cal" per Cal's "Big Header" (2026-06-09). ⚠ **drift, found 2026-09-03.** The live string was replaced wholesale in `92d653c` (2026-06-19) with no ledger entry. It reads as a deliberate edit — the hero now says "Meet Cal" over "And Kiche!", which is a joke that only works in that position — but nothing records who made it or whether Cal approved it. Neither side was overwritten. Confirm with Cal, then record it as a `cal-confirmed-edit` or restore his line.

### about.bio.p1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  I recently graduated from Colorado College with a degree in Anthropology and currently live in Lakewood—though I also spend time in Boulder and throughout the Front Range.
- live-text: |
  I recently graduated from Colorado College with a degree in Anthropology and currently live in Lakewood—though I also spend time in Boulder and throughout the Front Range.
- transforms: none
- notes: ⚠ guardrail override — "Lakewood" + "Boulder" (cities) and "Front Range" (region) are normally disallowed by DESIGN.md; user confirmed keep verbatim (2026-06-09).

### about.bio.p2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Animals have been a part of my life for as long as I can remember. Growing up, my family had three cats and three dogs, and I now have my own husky mix named Kiche (kee-chay), who is rarely far from my side.
- live-text: |
  Animals have been a part of my life for as long as I can remember. Growing up, my family had three cats and three dogs, and I now have my own husky mix named Kiche (kee-chay), who is rarely far from my side.
- transforms: none
- notes: -

### about.bio.p3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Over the years, I've had the opportunity to work with hundreds of pets. My experience includes caring for puppies, senior pets, highly anxious dogs, reactive dogs, and multi-pet households, with much of my work centered around large-breed dogs. Beyond hands-on pet care, I've shadowed a veterinarian and have human-focused medical training as well (EMT and WFR). With my own dogs, I've explored activities such as agility, scent work, canicross, and bikejoring, and I enjoy continuing to learn about animal behavior, health, and enrichment.
- live-text: |
  Over the years, I've had the opportunity to work with hundreds of pets. My experience includes caring for puppies, senior pets, highly anxious dogs, reactive dogs, and multi-pet households, with much of my work centered around large-breed dogs. Beyond hands-on pet care, I've shadowed a veterinarian and have human-focused medical training as well (EMT and WFR). With my own dogs, I've explored activities such as agility, scent work, canicross, and bikejoring, and I enjoy continuing to learn about animal behavior, health, and enrichment.
- transforms: none
- notes: -

### about.bio.p4

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  When I'm not working, I like to spend my time outdoors or practicing sports. I enjoy climbing, hiking, running, lifting, and martial arts. My own husky mix, Kiche, has accompanied me on eight Colorado fourteeners so far and we plan to do many more!
- live-text: |
  When I'm not working, I like to spend my time outdoors or practicing sports. I enjoy climbing, hiking, running, lifting, and martial arts. My own husky mix, Kiche, has accompanied me on eight Colorado fourteeners so far and we plan to do many more!
- transforms: none
- notes: new slot added (4th bio paragraph) — registry + about/page.tsx, user-confirmed (2026-06-09).

### about.approach.p1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Every pet has different needs, and every household has different routines, preferences, and expectations. My goal is to provide thoughtful, individualized care that helps both pets and their people feel comfortable and supported. I welcome clients from all backgrounds and strive to create an experience that is respectful, inclusive, and free of judgment.
- live-text: |
  Every pet has different needs, and every household has different routines, preferences, and expectations. My goal is to provide thoughtful, individualized care that helps both pets and their people feel comfortable and supported. I welcome clients from all backgrounds and strive to create an experience that is respectful, inclusive, and free of judgment.
- transforms: none
- notes: Approach section restructured from 3 title—detail bullets to 2 prose paragraphs to match Cal's text; replaced unused placeholder slots about.approach.{1,2,3}.{title,detail} (never placed, no prior ledger entries). User-confirmed (2026-06-09).

### about.approach.p2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Whether I'm taking your dog on a walk, stopping by for a visit, or caring for your pets and your home while you're away, I aim to provide the same level of attention, reliability, and compassion that I would want for my own animals.
- live-text: |
  Whether I'm taking your dog on a walk, stopping by for a visit, or caring for your pets and your home while you're away, I aim to provide the same level of attention, reliability, and compassion that I would want for my own animals.
- transforms: none
- notes: -

### about.quote.text

- status: placed
- provenance: public-fact
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  "The least I can do is speak out for those who cannot speak for themselves."
- live-text: |
  The least I can do is speak out for those who cannot speak for themselves.
- transforms: punctuation — stripped the wrapping double-quotes; the page renders the opening `&ldquo;` glyph in chrome (auto-allowed). Dropped trailing U+2060 word-joiner from Cal's dump.
- notes: replaced "[[BODY: a quote Cal likes…]]" placeholder (no prior entry). Real attributed quotation Cal selected (Jane Goodall) — public-fact, not a claim about Cal (2026-06-19).

### about.quote.author

- status: placed
- provenance: public-fact
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: |
  Dr. Jane Goodall
- live-text: |
  Dr. Jane Goodall
- transforms: punctuation — stripped the leading "- " separator from Cal's "…themselves." - Dr. Jane Goodall; the page renders the `&mdash;` before the author (auto-allowed).
- notes: replaced "[[Quote author]]" placeholder (no prior entry) (2026-06-19).

### about.references

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/about/page.tsx (rendered when the references registry is non-empty; else falls back to about.references.pending)
- applied-from: |
  The following clients have graciously agreed to serve as references. Please feel free to reach out if you have any questions about their experience working with me.
- live-text: |
  The following clients have graciously agreed to serve as references. Please feel free to reach out if you have any questions about their experience working with me.
- transforms: none
- notes: slot repurposed from a placeholder "pointer to reviews page" to the references-list intro. Cal's directive "Most reviews taken from Rover (rover link/integration/screenshots?)" is an open implementation question, not copy — surfaced in report, not placed. See the References-registry note below for where the names now live.

> **References moved out of the registry (2026-09-03).** The consent map that used to live in `about/page.tsx` is gone. A reference is now a record rather than a copy string, and the records live in `src/content/references.ts`: a `name`, a `contact` that is either published details or `null`, and an optional `photo` basename under `public/references`. The page renders whatever that array holds, so emptying it falls back to `about.references.pending` on its own — there is no separate consent flag to keep in step. Two records are in the array today, "Abby and Sloane" and "Madeleine, Apollo, Anabella", both carrying `contact: null`: being named is one yes, publishing a phone number is a second yes that neither household has given.
>
> Consequence for this ledger: `about.references.1`–`.8` are no longer read by any code, and on review they were found to be worse than merely dead. `marketing.ts` is imported by `src/components/marketing/faq-accordion.tsx`, which is a `"use client"` component, so the whole registry object is bundled into client JavaScript — the eight name strings were shipping to every browser that loaded a page carrying the FAQ, including the six households that never consented to being named anywhere. Dead keys with a privacy cost are not worth keeping for the record when the record has a better home, so the eight keys were deleted from `marketing.ts` on 2026-09-03 and marked `dropped` here. Nothing is lost: each entry below keeps its `applied-from` and its former `live-text`, and Cal's raw source is still in `cal-source.md`. Neither doc is served. This is the same reasoning that took the two client phone numbers out of the tracked docs on the same day.
>
> Re-placing any of these names is a content decision for Cal, and it now goes through `src/content/references.ts` (a record with an explicit consent-shaped `contact` field) rather than through a copy ID.

### about.references.1

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Ginna, Bill and Niko (phone number and/or email)
- live-text: — (was: "Ginna, Bill and Niko")
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request via intro), user-confirmed 2026-06-09.
- notes: -

### about.references.2

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Simone and Splash (phone number and/or email)
- live-text: — (was: "Simone and Splash")
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.3

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Carol and Millie (phone number and/or email)
- live-text: — (was: "Carol and Millie")
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.4

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Claudia and Sophie (phone number and/or email)
- live-text: — (was: "Claudia and Sophie")
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.5

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Abby and sloane (phone number and/or email)
- live-text: — (was: "Abby and Sloane")
- transforms: capitalization "sloane" → "Sloane" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: ✅ consent to be named granted 2026-06-19 ("Abby D.M."). A phone number was supplied privately and is NOT published; the digits are Cal's to hold and were redacted from this file 2026-09-03 rather than recorded in a tracked doc. Named on /about through the references registry, not through this ID.

### about.references.6

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Kula and lila (phone number and/or email)
- live-text: — (was: "Kula and Lila")
- transforms: capitalization "lila" → "Lila" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.7

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Madeleine, apollo, anabella (phone number and/or email)
- live-text: — (was: "Madeleine, Apollo, Anabella")
- transforms: capitalization "apollo"/"anabella" → "Apollo"/"Anabella" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: ✅ consent to be named granted 2026-06-19 ("Madeleine K.G."). A phone number was supplied privately and is NOT published; the digits are Cal's to hold and were redacted from this file 2026-09-03 rather than recorded in a tracked doc. Named on /about through the references registry, not through this ID.

### about.references.8

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (key removed from the registry 2026-09-03)
- applied-from: |
  Bugaboo (phone number and/or email)
- live-text: — (was: "Bugaboo")
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### reviews.purpose

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/reviews/page.tsx
- applied-from: |
  Feedback from pet-parents
- live-text: |
  Feedback from pet-parents
- transforms: none
- notes: replaced "[[BODY: reviews section purpose]]" placeholder (no prior ledger entry). From Cal's References-page "Body" (2026-06-19).

### resources.intro

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Over the years, I've spent a lot of time learning about animal health, behavior, training, and safety. The resources below cover topics I frequently discuss with clients, including several hazards that are particularly common in Colorado.
- live-text: |
  Over the years, I've spent a lot of time learning about animal health, behavior, training, and safety. The resources below cover topics I frequently discuss with clients, including several hazards that are particularly common in Colorado.
- transforms: none
- notes: ✅ "Colorado" is state-level — within DESIGN.md guardrails. Resources page restructured from the 2-resource + 5-FAQ placeholder scaffold to a 3-category library + intro/closing + 2 FAQs (user-confirmed 2026-06-09).

### resources.health.note

- status: pending-owner-signoff
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: — (no Cal source)
- live-text: |
  First aid and prevention — the topics I discuss most. Each links to a trusted external guide.
- transforms: none — moved verbatim out of the page.
- notes: The side-column note beside the "Health & Safety" heading, written by an agent in Cal's first person and shipped as a hardcoded literal on the page, never through the registry. Moved into `marketing.ts` on 2026-09-03 with the wording untouched, so the page renders the same sentence it did before; what changed is that the string is now reachable by ID like every other line of Cal's copy. No Cal source exists for it. It also promises something about the links ("a trusted external guide"), which is a claim about the sources Cal picked.

### resources.health.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Animal CPR (https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr?srsltid=AfmBOoppNCvKMXnfTgpz-0aSJqVQmDPKamR8feet-5edyhZWtvRsztF1)
- live-text: |
  Animal CPR
- transforms: agent-resolved link target — name links to https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr (href in page data; name raw inside <a>). Stripped Google tracking token "?srsltid=…" from the URL (user-confirmed 2026-06-09).
- notes: -

### resources.health.1.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Animal CPR is similar to human CPR, but differs in technique due to differences in anatomy. While we hope to never need this skill, knowing the basics can make a critical difference in an emergency and can provide valuable peace of mind.
- live-text: |
  Animal CPR is similar to human CPR, but differs in technique due to differences in anatomy. While we hope to never need this skill, knowing the basics can make a critical difference in an emergency and can provide valuable peace of mind.
- transforms: none
- notes: -

### resources.health.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Animal Poison Control (https://www.aspca.org/pet-care/aspca-poison-control) - (888) 426-4435 or (855) 764-7661
- live-text: |
  Animal Poison Control
- transforms: agent-resolved link target — name links to https://www.aspca.org/pet-care/aspca-poison-control (href in page data). Phone numbers rendered as a page-data detail after the name, each attributed to its org: "ASPCA (888) 426-4435 · Pet Poison Helpline (855) 764-7661" (public-fact correction 2026-07-12 — the 855 number is Pet Poison Helpline, not ASPCA; tester-reported). Same attribution split applied to the emergency-pin banner.
- notes: supersedes the old hardcoded r4 ASPCA placeholder, now dropped.

### resources.health.2.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  If you suspect your pet has ingested or come into contact with a toxic substance, animal poison hotlines can help assess the situation and provide guidance. They will typically ask for information such as your pet's weight, age, medical history, medications, and details about the suspected toxin.
- live-text: |
  If you suspect your pet has ingested or come into contact with a toxic substance, animal poison hotlines can help assess the situation and provide guidance. They will typically ask for information such as your pet's weight, age, medical history, medications, and details about the suspected toxin.
- transforms: none
- notes: -

### resources.health.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Bloat/GVD (https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat)
- live-text: |
  Bloat/GVD
- transforms: agent-resolved link target — name links to https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat (href in page data).
- notes: -

### resources.health.3.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Gastric dilatation volvulus (GDV), also known as "bloat" is a life-threatening condition pet owners, especially large-chested dog owners, should be aware of. To reduce the risk of bloat, I recommend that you avoid feeding your dogs in the hour preceding walks or other physical activity.
- live-text: |
  Gastric dilatation volvulus (GDV), also known as "bloat" is a life-threatening condition pet owners, especially large-chested dog owners, should be aware of. To reduce the risk of bloat, I recommend that you avoid feeding your dogs in the hour preceding walks or other physical activity.
- transforms: punctuation — curly quotes around "bloat" normalized to straight ASCII (auto-allowed).
- notes: -

### resources.health.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Heat stroke (https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke)
- live-text: |
  Heat stroke
- transforms: agent-resolved link target — name links to https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke (href in page data).
- notes: -

### resources.health.4.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Heat stroke is a serious risk for dogs in Colorado (especially for brachiocephalic/short-snouted breeds) and can become life-threatening very quickly. On hot days I pay extra attention to changes in behavior, energy levels, and body language.
- live-text: |
  Heat stroke is a serious risk for dogs in Colorado (especially for brachiocephalic/short-snouted breeds) and can become life-threatening very quickly. On hot days I pay extra attention to changes in behavior, energy levels, and body language.
- transforms: none
- notes: ✅ "Colorado" state-level — within guardrails.

### resources.health.5.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Hot Pavement (https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/)
- live-text: |
  Hot Pavement
- transforms: agent-resolved link target — name links to https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/ (href in page data).
- notes: -

### resources.health.5.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  When temperatures are above 80°F, I recommend checking surface temperatures before walking your dog. I test this by putting the back of my hand on a sunny patch of pavement for 10–15 seconds—if it's too hot for my hand, it's probably too hot for a dog's paws. Keep in mind that some surfaces, including certain patios, concrete, artificial turf, and dark-colored materials, can become even hotter than asphalt.
- live-text: |
  When temperatures are above 80°F, I recommend checking surface temperatures before walking your dog. I test this by putting the back of my hand on a sunny patch of pavement for 10–15 seconds—if it's too hot for my hand, it's probably too hot for a dog's paws. Keep in mind that some surfaces, including certain patios, concrete, artificial turf, and dark-colored materials, can become even hotter than asphalt.
- transforms: none
- notes: preserved °F, en-dash (10–15), and em-dash (—) verbatim.

### resources.health.6.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Parvovirus (https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus)
- live-text: |
  Parvovirus
- transforms: agent-resolved link target — name links to https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus (href in page data).
- notes: -

### resources.health.6.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Parvo is a highly contagious and often-fatal virus that is especially concerning for puppies. While early socialization is important, I caution against taking puppies to places frequented by unknown dogs—such as dog parks, pet store floors, or other high-traffic dog areas—until they have completed their vaccination series.
- live-text: |
  Parvo is a highly contagious and often-fatal virus that is especially concerning for puppies. While early socialization is important, I caution against taking puppies to places frequented by unknown dogs—such as dog parks, pet store floors, or other high-traffic dog areas—until they have completed their vaccination series.
- transforms: none
- notes: -

### resources.health.7.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Foxtails (https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/)
- live-text: |
  Foxtails
- transforms: agent-resolved link target — name links to https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/ (href in page data).
- notes: -

### resources.health.7.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Foxtails are common throughout Colorado and can cause minor to severe health problems if they become lodged in a dog's eyes, ears, nose, paws, or skin. If your dog enjoys running through tall grass or off-trail areas, I recommend learning how to identify foxtails and considering the use of a protective field guard (such as an OutFox® hood) in high-risk areas.
- live-text: |
  Foxtails are common throughout Colorado and can cause minor to severe health problems if they become lodged in a dog's eyes, ears, nose, paws, or skin. If your dog enjoys running through tall grass or off-trail areas, I recommend learning how to identify foxtails and considering the use of a protective field guard (such as an OutFox® hood) in high-risk areas.
- transforms: none
- notes: ✅ "Colorado" state-level. Preserved ® on "OutFox®" (Cal's brand reference).

### resources.health.8.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Algae Blooms (https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html)
- live-text: |
  Algae Blooms
- transforms: agent-resolved link target — name links to https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html (href in page data).
- notes: -

### resources.health.8.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Harmful algae blooms are not rare in Colorado and occur regularly in ponds, lakes, reservoirs, and slow-moving water during the warmer months. Because exposure can be rapidly fatal, I recommend keeping dogs out of any unfamiliar body of water, especially those that appear unusually green, blue-green, murky, or covered in surface scum.
- live-text: |
  Harmful algae blooms are not rare in Colorado and occur regularly in ponds, lakes, reservoirs, and slow-moving water during the warmer months. Because exposure can be rapidly fatal, I recommend keeping dogs out of any unfamiliar body of water, especially those that appear unusually green, blue-green, murky, or covered in surface scum.
- transforms: none
- notes: ✅ "Colorado" state-level.

### resources.health.9.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Household Toxins (https://www.aspca.org/news/top-10-toxins-2025)
- live-text: |
  Household Toxins
- transforms: agent-resolved link target — name links to https://www.aspca.org/news/top-10-toxins-2025 (href in page data).
- notes: -

### resources.health.9.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  While most pet owners know about hazards like chocolate and grapes, toxins such as minoxidil (Rogaine), xylitol/sugar alcohols, cannabis, and caffeine are often overlooked. It's worth familiarizing yourself with common household hazards, understanding the potential severity of reactions (such as those caused by grapes/raisins/wine), and keeping potentially toxic substances out of reach of pets.
- live-text: |
  While most pet owners know about hazards like chocolate and grapes, toxins such as minoxidil (Rogaine), xylitol/sugar alcohols, cannabis, and caffeine are often overlooked. It's worth familiarizing yourself with common household hazards, understanding the potential severity of reactions (such as those caused by grapes/raisins/wine), and keeping potentially toxic substances out of reach of pets.
- transforms: none
- notes: -

### resources.tools.note

- status: pending-owner-signoff
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: — (no Cal source)
- live-text: |
  Gear and methods I get asked about most.
- transforms: none — moved verbatim out of the page.
- notes: The side-column note beside the "Tools & Training" heading, written by an agent in Cal's first person and shipped as a hardcoded literal on the page, never through the registry. Moved into `marketing.ts` on 2026-09-03 with the wording untouched, so the page renders the same sentence it did before; what changed is that the string is now reachable by ID like every other line of Cal's copy. No Cal source exists for it. It says what clients ask Cal about, which only he can confirm.

### resources.tools.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  E collars
- live-text: |
  E collars
- transforms: none
- notes: name-only (no link/description yet) — Cal listed the topic under "Tools & Training"; may add a link/desc later.

### resources.tools.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Harness vs collar
- live-text: |
  Harness vs collar
- transforms: none
- notes: name-only (no link/description yet).

### resources.tools.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Recall Training
- live-text: |
  Recall Training
- transforms: none
- notes: name-only (no link/description yet).

### resources.tools.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Loose-leash walking
- live-text: |
  Loose-leash walking
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.note

- status: pending-owner-signoff
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: — (no Cal source)
- live-text: |
  Beyond the walk — keeping dogs happy and stimulated.
- transforms: none — moved verbatim out of the page.
- notes: The side-column note beside the "Enrichment & Well-Being" heading, written by an agent in Cal's first person and shipped as a hardcoded literal on the page, never through the registry. Moved into `marketing.ts` on 2026-09-03 with the wording untouched, so the page renders the same sentence it did before; what changed is that the string is now reachable by ID like every other line of Cal's copy. No Cal source exists for it.

### resources.enrichment.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Doggy consent
- live-text: |
  Doggy consent
- transforms: none
- notes: name-only (no link/description yet) — Cal listed the topic under "Enrichment & Well-Being".

### resources.enrichment.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Puppy socialization checklist
- live-text: |
  Puppy socialization checklist
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Mental stimulation ideas
- live-text: |
  Mental stimulation ideas
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Raw food
- live-text: |
  Raw food
- transforms: none
- notes: name-only (no link/description yet).

### resources.closing

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/resources/page.tsx
- applied-from: |
  Please let me know if there are other resources you think I should share. I'm always learning, and I'd love to continue expanding this list with helpful information!
- live-text: |
  Please let me know if there are other resources you think I should share. I'm always learning, and I'd love to continue expanding this list with helpful information!
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: -

> FAQ relocated (2026-06-15, revised 2026-07-22): both questions now live in the single contact-page FAQ — updates as `contact.faq.1.*`, boarding as `contact.faq.2.*` (briefly `services.faq.1.*`). Same Cal-verbatim text; see those IDs below.

> Dropped placeholders (user-confirmed 2026-06-09, "drop everything but Cal's source"): `resources.1.{name,desc}`, `resources.2.{name,desc}`, `resources.faq.{3,4,5}.{q,a}`, and the hardcoded public-fact entries r3 (Animal Emergency & Referral Center of Northern Colorado) + r4 (ASPCA Poison Control). None had prior ledger entries.

> Service copy placed 2026-06-16 (copy-sync from SYNC.md). Cal's text did not map 1-1 to the single-paragraph `detail.body` slot, so the services tab panel was restructured: `detail.body` now renders multi-paragraph block content with `## ` subheads via the new `MarketingProse` component (`src/components/marketing/marketing-prose.tsx`), used in `services/page.tsx`. Still-placeholder service slots (no source in the dump): `services.hero.{eyebrow,title}`, `services.overview`, `services.featured.badge`, `service.*.category` (×4), `service.meet_greet.card.body`, `service.training.included.{3,4}`, `service.walk.included.{1,2,3,4}`.

### services.notice.lede

- status: dropped
- provenance: cal-confirmed-edit
- consumed-by: — (slot removed)
- applied-from: |
  Until August 25, please assume I can't…
  [reason supplied 2026-06-20: I'm recovering from a broken leg]
- live-text: — (was: "I'm recovering from a broken leg, so until August 25, 2026, I am unable to:")
- transforms: reason composition (2026-06-20). "I'm assuming I can't…" → "…August 25, 2026, I am unable to:" (drops the hedge + ellipsis, adds colon to lead the list) and prepends the user-supplied reason "I'm recovering from a broken leg". First person, per the marketing POV guardrail (user briefly tried third person then reverted).
- notes: ⌛ expired as designed. The notice was time-bound from the day it was written — Cal set it to come down after 2026-09-01 — and it did: the band left `services/page.tsx` on 2026-08-13, and the four then-orphaned keys left `marketing.ts` on 2026-09-02. Cal's source text stays in `cal-source.md` so a future notice has a precedent to follow; a new one needs new source, not this one revived.

### services.notice.1

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (slot removed)
- applied-from: |
  Travel more than one mile for a booking
- live-text: — (was: "Travel more than one mile for a booking")
- transforms: none
- notes: see services.notice.lede — removed with the rest of the notice.

### services.notice.2

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (slot removed)
- applied-from: |
  Do walks longer than 15 min for dogs over 40lbs
- live-text: — (was: "Do walks longer than 15 min for dogs over 40lbs")
- transforms: none
- notes: see services.notice.lede — removed with the rest of the notice.

### services.notice.3

- status: dropped
- provenance: cal-verbatim
- consumed-by: — (slot removed)
- applied-from: |
  Housesit for dogs over 40lbs unless they don't need walks over 15 min at a time
- live-text: — (was: "Housesit for dogs over 40lbs unless they don't need walks over 15 min at a time")
- transforms: none
- notes: see services.notice.lede — removed with the rest of the notice.

### services.pricing.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Pricing Flexibility Available
- live-text: |
  Pricing Flexibility Available
- transforms: none
- notes: replaced "[[HEADER: pricing flexibility section]]" placeholder (no prior ledger entry). Rendered in the sliding-scale band (page hardcodes the "Sliding scale" side-label).

### services.pricing.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  To accommodate different financial situations, I offer a limited number of free or discounted slots. Please reach out if this is something you're interested in.
- live-text: |
  To accommodate different financial situations, I offer a limited number of free or discounted slots. Please reach out if this is something you're interested in.
- transforms: punctuation — curly apostrophe normalized to straight ASCII (auto-allowed).
- notes: replaced "[[BODY: pricing accessibility statement…]]" placeholder (no prior ledger entry).

> **Card-description fallbacks are unreachable (found 2026-09-03).** The five `service.*.card.body` IDs are read only by `serviceCardDescription` in `src/features/booking/service-card-display.ts`, which returns the DB `description` and falls back to the copy ID when it is blank. That function is exported from both booking barrels and called from nowhere: every service card renders the database description directly. So these five strings ship in the bundle and render nowhere. Nothing was deleted — the fix is in `src/features/booking`, not in this ledger — and the strings stay as Cal wrote them. Routed to whoever next touches that module: either give the fallback a call site or drop it and these five IDs with it.

### service.training.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts — `serviceCardDescription`, which has no call site today (see the note below)
- applied-from: |
  Puppy training or basic obedience
- live-text: |
  Puppy training or basic obedience
- transforms: none
- notes: from Cal's "Short Summary". Card-description fallback (used when the DB service.description is empty).

### service.training.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Currently, I offer two types of training: puppy training and basic obedience.
- live-text: |
  Currently, I offer two types of training: puppy training and basic obedience.
- transforms: none
- notes: -

### service.training.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Puppy Training
  I'm especially passionate about helping puppies develop into confident, well-mannered adults through positive experiences and thoughtful socialization. I've raised three puppies myself and have had the opportunity to assist with many others. Before getting my own dog, I spent an excessive amount of time researching puppy development, behavior, and training methods so I could be as prepared as possible. I've certainly made mistakes along the way, but I'm excited to share what I've learned from them with other dog owners.

  Basic Obedience
  Basic obedience includes the foundational skills that make everyday life with your dog easier and more enjoyable. We can focus on whatever skills are most important to you and your dog, whether that's loose-leash walking, recall, foundational commands, fun tricks, or anything else that does not fall under behaviour modification.

  My training philosophy is relationship-based and my default approach is positive reinforcement. This includes treats, play, praise, or other rewards depending on what motivates your dog. I also have experience with e-collars and other tools, and I'm happy to discuss these options on an individual basis if you believe they may be beneficial for your dog. For more information about e-collars and my thoughts on their use, please see my resources page (hyperlinked).

  Although I plan to continue my education before offering any other kind of behavioural or advanced training, I do have experience working with highly anxious and reactive dogs and am completely comfortable walking, caring for, and house sitting for dogs with these challenges.

- live-text: |
  ## Puppy Training\n\nI'm especially passionate about helping puppies develop into confident, well-mannered adults through positive experiences and thoughtful socialization. I've raised three puppies myself and have had the opportunity to assist with many others. Before getting my own dog, I spent an excessive amount of time researching puppy development, behavior, and training methods so I could be as prepared as possible. I've certainly made mistakes along the way, but I'm excited to share what I've learned from them with other dog owners.\n\n## Basic Obedience\n\nBasic obedience includes the foundational skills that make everyday life with your dog easier and more enjoyable. We can focus on whatever skills are most important to you and your dog, whether that's loose-leash walking, recall, foundational commands, fun tricks, or anything else that does not fall under behaviour modification.\n\nMy training philosophy is relationship-based and my default approach is positive reinforcement. This includes treats, play, praise, or other rewards depending on what motivates your dog. I also have experience with e-collars and other tools, and I'm happy to discuss these options on an individual basis if you believe they may be beneficial for your dog. For more information about e-collars and my thoughts on their use, please see my [resources page](/resources).\n\nAlthough I plan to continue my education before offering any other kind of behavioural or advanced training, I do have experience working with highly anxious and reactive dogs and am completely comfortable walking, caring for, and house sitting for dogs with these challenges.
- transforms: structural — Cal's subsection labels "Puppy Training"/"Basic Obedience" marked as `## ` subheads, paragraphs separated by blank lines (rendered by MarketingProse). agent-resolved action item — "(hyperlinked)" on "resources page" → markdown marker [resources page](/resources) (target /resources, user-confirmed 2026-06-16). punctuation — curly apostrophes normalized to straight ASCII (auto-allowed). British spellings "behaviour"/"behavioural" kept verbatim. Cal's words unchanged.
- notes: 5-paragraph long-form; did not fit the old single-paragraph slot, prompting the MarketingProse restructure.

### service.training.included.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Customized training plan based on your dog's needs
- live-text: |
  Customized training plan based on your dog's needs
- transforms: none
- notes: from Cal's "What's included". included.{3,4} left placeholder (no source).

### service.training.included.2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Unlimited Q&A support between sessions
- live-text: |
  Unlimited Q&A support between sessions
- transforms: none
- notes: preserved "Q&A" verbatim.

### service.walk.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts — `serviceCardDescription`, which has no call site today (see the note below)
- applied-from: |
  Walks, hikes, runs/jogs, or other adventures
- live-text: |
  Walks, hikes, runs/jogs, or other adventures
- transforms: none
- notes: from Cal's "Summary".

### service.walk.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Walks are scheduled in 15-minute increments and can be tailored to your dog's individual needs and energy level. Whether your pup prefers a leisurely neighborhood stroll or a more vigorous outing, I'm happy to adapt the outing accordingly.
- live-text: |
  Walks are scheduled in 15-minute increments and can be tailored to your dog's individual needs and energy level. Whether your pup prefers a leisurely neighborhood stroll or a more vigorous outing, I'm happy to adapt the outing accordingly.
- transforms: none
- notes: "neighborhood stroll" is generic (not a place name) — within DESIGN.md guardrails.

### service.walk.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  For dogs who enjoy a little extra adventure, I can also provide hikes and other outings that may involve transportation by car. I'm also more than happy to jog or run dogs when weather, health, and fitness levels permit!

  Off-leash outings are offered cautiously and on a case-by-case basis.

- live-text: |
  For dogs who enjoy a little extra adventure, I can also provide hikes and other outings that may involve transportation by car. I'm also more than happy to jog or run dogs when weather, health, and fitness levels permit!\n\nOff-leash outings are offered cautiously and on a case-by-case basis.
- transforms: structural — two source paragraphs kept as two blocks (blank-line separated, rendered by MarketingProse). Cal's words unchanged.
- notes: walk.included.{1,2,3,4} left placeholder (no source bullets).

### service.check_in.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts — `serviceCardDescription`, which has no call site today (see the note below)
- applied-from: |
  Drop-in visits for pet and home care
- live-text: |
  Drop-in visits for pet and home care
- transforms: none
- notes: from Cal's "Summary".

### service.check_in.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Check-ins can include feeding, potty breaks, short walks, playtime, enrichment activities, medication administration, and plenty of attention—whatever your pet needs to stay happy and comfortable while you're away, whether that's for several days or just an evening. I'm also happy to help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- live-text: |
  Check-ins can include feeding, potty breaks, short walks, playtime, enrichment activities, medication administration, and plenty of attention—whatever your pet needs to stay happy and comfortable while you're away, whether that's for several days or just an evening. I'm also happy to help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- transforms: none
- notes: preserved em-dash (—).

### service.check_in.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  To ensure animals receive adequate care and companionship, I generally require a minimum of three check-ins per full day you're away. Check-ins are also only available for trips no longer than one week, though exceptions may be possible depending on your pet's personality, needs, and routine.
- live-text: |
  To ensure animals receive adequate care and companionship, I generally require a minimum of three check-ins per full day you're away. Check-ins are also only available for trips no longer than one week, though exceptions may be possible depending on your pet's personality, needs, and routine.
- transforms: none
- notes: -

### service.check_in.included.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Feeding and medication administration
- live-text: |
  Feeding and medication administration
- transforms: none
- notes: -

### service.check_in.included.2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Potty breaks or short walks
- live-text: |
  Potty breaks or short walks
- transforms: none
- notes: -

### service.check_in.included.3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Home care (mail, plants, trash bins, lights, etc.)
- live-text: |
  Home care (mail, plants, trash bins, lights, etc.)
- transforms: none
- notes: -

### service.check_in.included.4

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Affection and attention
- live-text: |
  Affection and attention
- transforms: none
- notes: -

### service.house_sitting.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts — `serviceCardDescription`, which has no call site today (see the note below)
- applied-from: |
  Overnight pet and home care
- live-text: |
  Overnight pet and home care
- transforms: none
- notes: from Cal's "Summary".

### service.house_sitting.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  House sitting allows your pet to stay in the comfort of their own home and maintain their normal routine while you're away.
- live-text: |
  House sitting allows your pet to stay in the comfort of their own home and maintain their normal routine while you're away.
- transforms: none
- notes: -

### service.house_sitting.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Together, we can determine how much time I spend in the home based on your pet's needs. House sitting includes all of the benefits of check-ins—feeding, walks, playtime, medication administration, enrichment, and plenty of attention—along with overnight companionship. I will also help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- live-text: |
  Together, we can determine how much time I spend in the home based on your pet's needs. House sitting includes all of the benefits of check-ins—feeding, walks, playtime, medication administration, enrichment, and plenty of attention—along with overnight companionship. I will also help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- transforms: none
- notes: preserved em-dashes (—).

### service.house_sitting.included.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Feeding and medication administration
- live-text: |
  Feeding and medication administration
- transforms: none
- notes: -

### service.house_sitting.included.2

- status: placed
- provenance: cal-confirmed-edit
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Daily exercise and enrichment (including 45-minute of daily walks per dog)
- live-text: |
  Daily exercise and enrichment (including 45 minutes of daily walks per dog)
- transforms: grammar (user-confirmed 2026-06-16) — "45-minute of daily walks" → "45 minutes of daily walks".
- notes: -

### service.house_sitting.included.3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Overnight companionship and supervision
- live-text: |
  Overnight companionship and supervision
- transforms: none
- notes: -

### service.house_sitting.included.4

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: |
  Home care (mail, plants, trash bi
- live-text: |
  Home care (mail, plants, trash bins, lights, etc.)
- transforms: agent-resolved — source dump truncated mid-line ("Home care (mail, plants, trash bi"); mirrored the check-in equivalent "Home care (mail, plants, trash bins, lights, etc.)" (user-confirmed 2026-06-16). Replace with Cal's full line once supplied.
- notes: ⚠ source truncated — see cal-source.md note.

> Services FAQ retired (2026-07-22, user-requested "combine the two FAQs"): `services.faq.1.{q,a}` → `contact.faq.2.{q,a}`, the site's one FAQ. Same Cal-verbatim text; entries below under their new IDs.

### contact.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/contact/page.tsx
- applied-from: |
  Contact Me
- live-text: |
  Contact Me
- transforms: none
- notes: replaced the "[[HEADER: Contact]]" placeholder (no prior ledger entry).

### contact.faq.1.q

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/contact/page.tsx
- applied-from: |
  Will I receive updates while I'm away?
- live-text: |
  Will I receive updates while I'm away?
- transforms: punctuation — curly apostrophe normalized to straight ASCII (auto-allowed).
- notes: moved from resources.faq.2.q (2026-06-15) — updates/communication question surfaced beside the contact form.

### contact.faq.1.a

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/contact/page.tsx
- applied-from: |
  Yes! I'm happy to send updates and photos as often as you'd like. I know it can be difficult to be away from your pets, and I strive to provide clear communication and timely responses throughout your booking.
- live-text: |
  Yes! I'm happy to send updates and photos as often as you'd like. I know it can be difficult to be away from your pets, and I strive to provide clear communication and timely responses throughout your booking.
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: moved from resources.faq.2.a (2026-06-15).

### contact.faq.2.q

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/contact/page.tsx
- applied-from: |
  Can you watch my animal at your house?/Can you board my animal?
- live-text: |
  Can you watch my animal at your house?/Can you board my animal?
- transforms: none
- notes: was resources.faq.1.q (2026-06-15) → services.faq.1.q → contact.faq.2.q (2026-07-22, FAQs combined onto /contact). Slash kept verbatim (Cal's two-phrasing question).

### contact.faq.2.a

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/contact/page.tsx
- applied-from: |
  Unfortunately, I'm unable to care for clients' pets in my own home at this time due to housing restrictions and the needs of my own dog. I am, however, happy to take your pup on walks, hikes, and other adventures outside of your home!
- live-text: |
  Unfortunately, I'm unable to care for clients' pets in my own home at this time due to housing restrictions and the needs of my own dog. I am, however, happy to take your pup on walks, hikes, and other adventures outside of your home!
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: was resources.faq.1.a (2026-06-15) → services.faq.1.a → contact.faq.2.a (2026-07-22).

### contact.subtitle

- status: dropped
- provenance: placeholder
- consumed-by: — (slot removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Cal's directive "actually i don't think we need this" → subtitle slot dropped from marketing.ts + the `subtitle` prop removed from contact/page.tsx. Header + contact form retained (user-confirmed 2026-06-09). Was the "[[BODY: what the contact form is for]]" placeholder; no prior ledger entry.

> **Placeholder cleanup batch (2026-06-20, Alex-directed).** Resolved the
> remaining `[[ ]]` stubs. None had a prior ledger entry. No Cal source dump —
> these are structural chrome or Alex-set substance, so provenance is
> `agent-resolved`; substance slots flagged for Cal's verbatim confirm later.

### gallery.eyebrow

- status: dropped
- provenance: placeholder
- consumed-by: — (slot removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Alex-directed drop; slot removed from marketing.ts + `<Eyebrow>` block + import removed from gallery/page.tsx. Was "[[HEADER: gallery eyebrow]]"; no prior entry.

### gallery.body

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/gallery/page.tsx
- applied-from: — (no Cal source; Alex-approved phrasing)
- live-text: |
  A few of the animals I've had the pleasure of caring for.
- transforms: agent-resolved — Alex-approved gallery one-liner. Replaced "[[BODY: one line about the photos]]"; no prior entry.
- notes: ⚠ pending Cal verbatim confirm.

### services.hero.eyebrow

- status: dropped
- provenance: placeholder
- consumed-by: — (slot removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Alex-directed drop; slot removed + `<Eyebrow>` hero block removed from services/page.tsx (the page's other `<Eyebrow>` — "What's included" — is a hardcoded label, retained). Was "[[LABEL: services page eyebrow]]"; no prior entry.

### services.hero.title

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: — (structural label, Alex-set)
- live-text: |
  Services
- transforms: agent-resolved — plain page heading (Alex-set). Replaced "[[HEADER: services page headline]]"; no prior entry.
- notes: -

### services.overview

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: — (no Cal source; mirrors home.hero.body, Alex-approved)
- live-text: |
  Drop-in visits, walks, house sitting, and training—each tailored to your pet's needs.
- transforms: agent-resolved — Alex-approved; phrasing mirrors home.hero.body, all four services already public. Replaced "[[BODY: services overview]]"; no prior entry.
- notes: ⚠ low-risk substance; pending Cal verbatim confirm.

### services.featured.badge

- status: dropped
- provenance: placeholder
- consumed-by: — (slot removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Alex-directed drop (with the category labels). Slot removed + the `badge: index === 0 ? …` wiring removed from services/page.tsx; the `badge` field + kicker markup pruned from service-tabs.tsx. Was "[[LABEL: featured service badge]]"; no prior entry.

### service.house_sitting.category / service.check_in.category / service.walk.category / service.training.category

- status: dropped
- provenance: placeholder
- consumed-by: — (slots removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Alex-directed drop; all 4 category-label slots removed plus their `serviceCategoryCopyId` + `CATEGORY_COPY` wiring (service-card-display.ts) and the barrel export (booking/index.ts). Rendered as an uppercase kicker that merely echoed the service name. Were "[[LABEL: … category]]"; no prior entries.

### about.bio.photo.caption

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/about/page.tsx
- applied-from: — (Alex-supplied)
- live-text: |
  Kiche and her sister Harper having a playdate
- transforms: agent-resolved — Alex-supplied caption. Replaced "[[Caption: what this photo shows]]"; no prior entry.
- notes: ⚠ pending Cal verbatim confirm (names a specific photo).

### service.meet_greet.card.body

- status: placed
- provenance: agent-resolved
- consumed-by: src/features/booking/service-card-display.ts — `serviceCardDescription`, which has no call site today (see the note below)
- applied-from: |
  A free, in-person introduction before your first booking.
- live-text: |
  A free, in-person introduction before your first booking.
- transforms: agent-resolved — mirrors the meet-greet DB seed description (seed_meet_greet_service.sql). Replaced "[[BODY: short meet-and-greet service description]]"; no prior entry.
- notes: keep in sync with the seed text if either changes — but see the card-description note above: the fallback that would read this string has no call site, so it renders nowhere today.

### service.walk.included.1 / .2 / .4

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: — (1/2/4 derived from service.walk.detail.body)
- live-text: |
  1: Exercise tailored to your dog's energy level
  2: Car transport for outings
  4: Off-leash time on a case-by-case basis
- transforms: agent-resolved — "what's included" bullets. .1/.2/.4 paraphrase lines already in Cal's walk.detail.body. Replaced "[[LABEL: walk included item N]]"; no prior entries.
- notes: .3 (leash manners training) REMOVED at Cal's request 2026-07-12 ("remove walks included leash manners") — it was the only bullet with no source line. ID retired; remaining numbers kept stable.

### service.training.included.3

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx (ID chosen by src/features/booking/service-card-display.ts)
- applied-from: — (derived from service.training.detail.body)
- live-text: |
  3: Positive-reinforcement approach
- transforms: agent-resolved — extends the existing .1/.2 bullets; paraphrases the positive-reinforcement line in Cal's training.detail.body. Replaced "[[LABEL: training included item N]]"; no prior entries.
- notes: .4 (support for anxious and reactive dogs) REMOVED at Cal's request 2026-07-12 ("remove training included anxious dogs"). ID retired; remaining numbers kept stable.

### about.stat.pets.value / .label

- status: placed
- provenance: cal-confirmed-edit
- consumed-by: src/app/(site)/(marketing)/page.tsx
- applied-from: |
  replace 23 yrs old with 150+ pets served
- live-text: |
  value: 150+
  label: Pets served
- transforms: Cal's directive (tester-feedback batch, 2026-07-12) split into stat value "150+" + label "Pets served" for the home stat ribbon.
- notes: replaces the derived-age stat (about.stat.age.label "Years old" + DOB-derived value); age ID retired and DOB removed from the page. The other about.stat.\* IDs predate the ledger — see "Registry IDs with no entry of their own" below.

### Registry IDs with no entry of their own

- status: flagged
- provenance: — (unknown; no Cal source captured)
- consumed-by: various — see the list below
- applied-from: —
- live-text: — (read them from `src/content/marketing.ts`)
- transforms: —
- notes: 📮 **audited 2026-09-03.** Fifteen live registry IDs reached
  `marketing.ts` without a ledger entry, all of them before the ledger became a
  habit. Recorded here as one entry rather than fifteen stubs, because what is
  known about each is the same thing: it ships, and no one wrote down where the
  words came from.
  - The eleven `about.stat.*` IDs other than `about.stat.pets.*` — the stat
    ribbon's credentials. They are claims about Cal (a degree, a Rover status,
    counts of clients and pets and fourteeners), so they are exactly the kind of
    substance `docs/DESIGN.md` says Cal supplies. Landed `431418e`, 2026-06-13.
    They render on the home page, not `/about`, despite the `about.` prefix; the
    IDs are keyed to whose facts they are, not to where the ribbon sits.
  - `about.references.pending` — the fallback shown when the references registry
    is empty. Landed `431418e`, 2026-06-13.
  - `contact.intro` and `contact.replyNote` — the two sentences beside the
    contact form. Landed `cbae4df`, 2026-06-12, from a contact-page mockup Alex
    approved. `contact.replyNote` ("I usually reply within a day.") is a promise
    about Cal's response time, which is his to make or withdraw.
  - `footer.tagline` — "Dog Walking · House Sitting · Colorado". Landed
    `a10fab0`, 2026-06-09, alongside the copy-sync skill itself.

  None of these is wrong on its face, and none was changed. They need Cal to
  read them once and say yes, at which point each gets a real entry.

---

## Structural labels from Cal's source dumps

Cal writes his dumps with his own scaffolding — the headings he groups text
under, and the label above a bullet list. Those are signposts for the reader of
the dump, not copy, and none of them has an ID. They are recorded here so a
future copy-sync run does not mistake them for text that never got placed.

| Label in the dump                                            | What the site does with it                                                              | Status                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------ |
| "Sliding Scale"                                              | `services/page.tsx` hardcodes "Sliding scale" as the band's side-label heading.         | not placed — page chrome |
| "What's included:" / "What's Included:"                      | `services/page.tsx` hardcodes "What's included" as the eyebrow above the bullet list.   | not placed — page chrome |
| "Services", "Training", "Walks", "Check-ins", "Housesitting" | Service names come from the `services` table, not from copy.                            | not placed — database    |
| "Puppy Training", "Basic Obedience"                          | Kept as Cal's words, marked up as `## ` subheads inside `service.training.detail.body`. | placed — see that entry  |

---

## System text

Everything above tracks marketing copy: Cal's words, keyed by ID, sourced from
`cal-source.md`. The site's other text has no author but us — error messages,
field hints, button labels, email templates — so it has no ID and no source to
diff against. This section is its change log, so that a question like "where did
this sentence come from, and did Cal ever see it?" has an answer.

The rule for the 2026-09-03 launch-readiness session was that no new
user-facing text ships beyond a list Alex approved up front
(`docs/superpowers/plans/2026-09-02-launch-readiness.md`). Two strings landed
outside that list; both are marked `pending-owner-signoff` below, and neither
changes what the site does. The notification templates are a third case, and a
planned one: Alex approved the system on the condition that its wording gets
read before it goes out, so all of it is `pending-owner-signoff` by design.

#### Added — 2026-09-03 launch-readiness session

| String                                              | Where it appears                                                                                                                              | Slice  | Status                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------- |
| "Your sign-in link has expired. Request a new one." | `SIGN_IN_LINK_EXPIRED`, `src/app/(auth)/_components/auth-errors.ts` — a magic link or invite that was already used or timed out               | W1-S11 | approved              |
| "Sign-in failed. Please try again."                 | `SIGN_IN_FAILED`, same file — every other sign-in failure                                                                                     | W1-S11 | approved              |
| "Too many submissions. Please try again later."     | `src/features/reviews/reviews-action.ts`, when a reviewer is inside the submission window                                                     | W1-S5  | approved              |
| "That address is outside Cal's service area."       | `OUTSIDE_SERVICE_AREA_MESSAGE`, `src/features/accounts/service-area.ts` — the ZIP field on onboarding step 1 and on the /account profile form | W3-S8  | approved              |
| "Street address, apt or unit"                       | Persistent hint under three address fields: onboarding info-step, /account profile form, and the "Home address" field in `profile-fields.tsx` | W3-S8  | approved — see below  |
| "Pick one or more days"                             | `availability-client.tsx`, the day-panel heading when nothing is selected                                                                     | W3-S3  | approved              |
| "N days selected"                                   | The same heading, for a multi-day selection                                                                                                   | W3-S3  | approved              |
| "for these days"                                    | The same panel, the overnight toggle's sub-label in bulk mode                                                                                 | W3-S3  | approved              |
| "Applies to all selected days"                      | `day-painter.tsx`, the hint under the hour controls in bulk mode                                                                              | W3-S3  | approved              |
| "Skip to content"                                   | `page-shell.tsx`, the skip link every page carries                                                                                            | W5-S4  | approved              |
| "Pause" / "Play"                                    | `stat-ticker-track.tsx`, the `aria-label` on the ticker's stop control                                                                        | W5-S4  | approved              |
| "Page N"                                            | `src/components/ui/pagination.tsx`, the `aria-label` on each page number                                                                      | W5-S4  | pending-owner-signoff |
| "Discounts"                                         | `admin-manual-discounts.tsx`, the heading over the discount switches on a booking                                                             | W5-S9  | pending-owner-signoff |

Two notes on that table.

**The address hint repeats its label.** Two of the three fields are labelled
"Street address", and the hint under them reads "Street address, apt or unit",
so the words are announced twice. The approved wording was placed verbatim
because it is the approved wording. If Cal will approve a replacement, something
like "Include an apartment or unit number" carries the same information without
the echo. The third field is labelled "Home address", where the repetition is
milder.

**"Page N" and "Discounts" are the two strings outside the approved list.** Both
are invisible or nearly invisible chrome. "Page N" is a screen-reader label that
a numbered pagination control has to have; the implementation plan prescribed it
verbatim, but Alex's list did not carry it. "Discounts" is a one-word heading
over controls whose own labels come from the database. Everything else on that
admin card is composed from a frame that already shipped, with the database's
label substituted: "Apply {label}?", "{label} applied", "This service doesn't
offer {label}."

#### Notification templates — pending owner sign-off

Alex approved the notification system on the condition that its wording is
reviewed before it goes out. All of it is written, and it lives in
`src/features/notifications/emails.ts`. Exposure differs by audience, and the
difference decides what to read first:

- **Cal's three alerts ship inert.** New booking request, new inquiry and client
  cancellation are all dispatched through `notifyAdmin`, which does nothing while
  `ADMIN_NOTIFICATION_EMAIL` is unset. Subjects and headings: "New booking
  request: {client}" / "New booking request", "New inquiry: {name}" / "New
  inquiry", "Booking cancelled: {client}" / "Booking cancelled". Row labels:
  "Client", "Email", "Name", "Phone", "Subject". Link labels: "View the booking",
  "View inquiries".
- **The client's acknowledgement ships live.** `buildBookingReceivedEmail` is
  sent whenever a request lands `pending_approval`, with no env gate. Subject
  "Booking request received: {service}", heading "Booking request received", body
  "Cal reviews each request and sends a confirmation email when it is approved.",
  link "View your bookings" — a label also added to the already-live confirmation
  and reminder emails. This is the wording to review first: it is the one a
  client receives today.

Existing template text was reused verbatim rather than rewritten: "Questions?
Reply to this email.", "— Cal Barba", "Payment", "Service", "Starts", "Ends",
"Total", and the prepay and refund sentences.

#### Approved but not placed

Two sentences on Alex's list went unused, because a string that already shipped
said the same thing:

- "Finish the required forms below before booking." The /book gate keeps its
  existing "Complete your required profiles before booking."
- "Your account is pending Cal's approval." Nothing renders it. The booking
  flow's own "Request submitted — pending Cal's approval." already covers the
  moment a client meets that state.

The declined-onboarding page was likewise approved to reuse the /book gate's
wording, and does: it renders "Your account needs attention" over "We need to
sort out your account before you can book. Please get in touch and we'll help."
— the gate's own two sentences, so a client who followed "View details" from
there does not read two different explanations.

#### Removed

- Two Kiche-specific sentences, "Kiche is coming along — this booking is
  discounted." and "The client is OK with Kiche tagging along. Turn on to
  discount this booking.", together with the switch's `aria-label` "Apply Kiche
  discount to this booking" (W5-S9). The Kiche row generalized into a list of
  manual discounts, and each switch is now named by its own visible label. The
  row still appears only when the client marked Kiche welcome, so nothing about
  that consent is lost.
- The limited-availability band and its four copy IDs — see the
  `services.notice.*` entries above.
- The eight `about.references.N` name strings — see those entries above. Read by
  nothing, but bundled into client JavaScript along with the rest of the registry,
  so six households who never consented to being named were being served to the
  public. Removed for that reason rather than for being dead.

#### Written, but not by us

"Friends & Family (−50%)" and "Complimentary" are the labels on two pricing
modifiers added in
`supabase/migrations/20260902140000_manual_discount_modifiers.sql`. They render
verbatim from the database wherever a discount is named — the admin switches,
the confirm dialog, the toasts, and the client's own price breakdown — so the
database row is the string's home, not the code. Both are on Alex's approved
list.

Two more strings changed shape rather than wording. Reviews fall back to
"Anonymous" for an author with no profile name, and a stored name containing "@"
is now masked to "Anonymous" at the public read boundary rather than published
(W1-S5). The fallback already existed; the mask is what is new, and it is a
containment rather than a fix — the addresses are still in the database. And
/claim's SDK-failure branch now shows the site's own "Something went wrong.
Please try again." instead of whatever GoTrue or Postgres said (W1-S11).

---

_Last reviewed: 2026-09-03_
