# Copy Ledger

> Per-ID tracking that bridges `docs/content/cal-source.md` (authority) and `src/content/marketing.ts` (render target). Drives the copy-sync diff. See `docs/CONTENT.md` for the protocol.

## How to read an entry

- `status`: `placeholder` | `placed` | `changed` | `drift` | `flagged`
- `provenance`: `cal-verbatim` | `cal-confirmed-edit` | `agent-resolved` | `public-fact` | `placeholder`
- `applied-from`: the exact `cal-source` text that produced the current live string (diff anchor).
- `live-text`: the string currently in `marketing.ts`. Differs from `applied-from` only by the listed `transforms`.
- `transforms`: confirmed adaptations (capitalization/punctuation, resolved action items, Cal-approved grammar).

## Entries

### home.hero.hook

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Reliable dog walking and pet care on the Front Range
- live-text: |
  Reliable dog walking and pet care on the Front Range
- transforms: none
- notes: ⚠ region term "Front Range" — flagged per DESIGN.md; user confirmed keep verbatim (2026-06-09).

### home.hero.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover
- live-text: |
  Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover
- transforms: none
- notes: -

### home.trust.1.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Safety first
- live-text: |
  Safety first
- transforms: none
- notes: -

### home.trust.1.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow, I've learned a great deal about pet safety, health, and risk prevention. I incorporate this knowledge into every walk, visit, and house sit, helping keep pets safe, healthy, and happy. I also hope to help pet owners learn more about keeping their animals safe through the resources (<-- hyperlink) available on this site.
- live-text: |
  Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow, I've learned a great deal about pet safety, health, and risk prevention. I incorporate this knowledge into every walk, visit, and house sit, helping keep pets safe, healthy, and happy. I also hope to help pet owners learn more about keeping their animals safe through the [resources](/resources) available on this site.
- transforms: agent-resolved action item — "(<-- hyperlink)" on "resources" → markdown marker [resources](/resources) (target /resources, user-confirmed 2026-06-09); rendered by MarketingCopy. Cal's words unchanged.
- notes: -

### home.trust.2.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Well-trusted
- live-text: |
  Well-trusted
- transforms: none
- notes: -

### home.trust.2.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  I work hard to earn the trust of both pets and their people. I'm grateful for the many kind reviews and recommendations I've received over the years, and I approach every visit, walk, and house sit with the same level of care and attention. You can read reviews and references from past clients here.
- live-text: |
  I work hard to earn the trust of both pets and their people. I'm grateful for the many kind reviews and recommendations I've received over the years, and I approach every visit, walk, and house sit with the same level of care and attention. You can read reviews and references from past clients [here](/reviews).
- transforms: agent-resolved link target — "here" → markdown marker [here](/reviews) (user-confirmed 2026-06-09); rendered by MarketingCopy. Cal's words unchanged.
- notes: -

### home.trust.3.title

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Experienced
- live-text: |
  Experienced
- transforms: none
- notes: -

### home.trust.3.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  I've been working in the pet care industry since 2021 and have cared for hundreds of animals with a wide range of personalities, ages, and needs. While most of my experience is with large-breed dogs, I've worked with all kinds of pets—from chickens and tortoises to senior Chihuahuas and energetic puppies. Every animal is different, and I enjoy getting to know each one as an individual.
- live-text: |
  I've been working in the pet care industry since 2021 and have cared for hundreds of animals with a wide range of personalities, ages, and needs. While most of my experience is with large-breed dogs, I've worked with all kinds of pets—from chickens and tortoises to senior Chihuahuas and energetic puppies. Every animal is different, and I enjoy getting to know each one as an individual.
- transforms: none
- notes: -

### home.cta.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
  Think we might be a good fit?
- live-text: |
  Think we might be a good fit?
- transforms: none
- notes: -
