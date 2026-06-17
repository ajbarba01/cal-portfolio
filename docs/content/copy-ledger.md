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
  Pet care on the Front Range
- live-text: |
  Pet care on the Front Range
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

### about.summary

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Hi! I'm Cal.
- live-text: |
  Hi! I'm Cal.
- transforms: none
- notes: renders as the hero body line; hardcoded hero title set to "Meet Cal" per Cal's "Big Header" (2026-06-09).

### about.bio.p1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  I recently graduated from Colorado College with a degree in Anthropology and currently live in Lakewood—though I also spend time in Boulder and throughout the Front Range.
- live-text: |
  I recently graduated from Colorado College with a degree in Anthropology and currently live in Lakewood—though I also spend time in Boulder and throughout the Front Range.
- transforms: none
- notes: ⚠ guardrail override — "Lakewood" + "Boulder" (cities) and "Front Range" (region) are normally disallowed by DESIGN.md; user confirmed keep verbatim (2026-06-09).

### about.bio.p2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Animals have been a part of my life for as long as I can remember. Growing up, my family had three cats and three dogs, and I now have my own husky mix (named Kiche), who is rarely far from my side.
- live-text: |
  Animals have been a part of my life for as long as I can remember. Growing up, my family had three cats and three dogs, and I now have my own husky mix (named Kiche), who is rarely far from my side.
- transforms: none
- notes: -

### about.bio.p3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Over the years, I've had the opportunity to work with hundreds of pets. My experience includes caring for puppies, senior pets, highly anxious dogs, reactive dogs, and multi-pet households, with much of my work centered around large-breed dogs. Beyond hands-on pet care, I've shadowed a veterinarian and have human-focused medical training as well (EMT and WFR). With my own dogs, I've explored activities such as agility, scent work, canicross, and bikejoring, and I enjoy continuing to learn about animal behavior, health, and enrichment.
- live-text: |
  Over the years, I've had the opportunity to work with hundreds of pets. My experience includes caring for puppies, senior pets, highly anxious dogs, reactive dogs, and multi-pet households, with much of my work centered around large-breed dogs. Beyond hands-on pet care, I've shadowed a veterinarian and have human-focused medical training as well (EMT and WFR). With my own dogs, I've explored activities such as agility, scent work, canicross, and bikejoring, and I enjoy continuing to learn about animal behavior, health, and enrichment.
- transforms: none
- notes: -

### about.bio.p4

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  When I'm not working, I like to spend my time outdoors or practicing sports. I enjoy climbing, hiking, running, lifting, and martial arts. My own husky mix, Kiche, has accompanied me on eight Colorado fourteeners so far and we plan to do many more!
- live-text: |
  When I'm not working, I like to spend my time outdoors or practicing sports. I enjoy climbing, hiking, running, lifting, and martial arts. My own husky mix, Kiche, has accompanied me on eight Colorado fourteeners so far and we plan to do many more!
- transforms: none
- notes: new slot added (4th bio paragraph) — registry + about/page.tsx, user-confirmed (2026-06-09).

### about.approach.p1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Every pet has different needs, and every household has different routines, preferences, and expectations. My goal is to provide thoughtful, individualized care that helps both pets and their people feel comfortable and supported. I welcome clients from all backgrounds and strive to create an experience that is respectful, inclusive, and free of judgment.
- live-text: |
  Every pet has different needs, and every household has different routines, preferences, and expectations. My goal is to provide thoughtful, individualized care that helps both pets and their people feel comfortable and supported. I welcome clients from all backgrounds and strive to create an experience that is respectful, inclusive, and free of judgment.
- transforms: none
- notes: Approach section restructured from 3 title—detail bullets to 2 prose paragraphs to match Cal's text; replaced unused placeholder slots about.approach.{1,2,3}.{title,detail} (never placed, no prior ledger entries). User-confirmed (2026-06-09).

### about.approach.p2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Whether I'm taking your dog on a walk, stopping by for a visit, or caring for your pets and your home while you're away, I aim to provide the same level of attention, reliability, and compassion that I would want for my own animals.
- live-text: |
  Whether I'm taking your dog on a walk, stopping by for a visit, or caring for your pets and your home while you're away, I aim to provide the same level of attention, reliability, and compassion that I would want for my own animals.
- transforms: none
- notes: -

### about.references

- status: withheld
- provenance: cal-verbatim
- consumed-by: (none — withheld from site 2026-06-10; placeholder rendered in about/page.tsx)
- applied-from: |
  The following clients have graciously agreed to serve as references. Please feel free to reach out if you have any questions about their experience working with me.
- live-text: |
  The following clients have graciously agreed to serve as references. Please feel free to reach out if you have any questions about their experience working with me.
- transforms: none
- notes: slot repurposed from a placeholder "pointer to reviews page" to the references-list intro. Named clients live in about.references.1–8. Cal's directive "Most reviews taken from Rover (rover link/integration/screenshots?)" is an open implementation question, not copy — surfaced in report, not placed. **Withheld from site 2026-06-10:** intro + about.references.1–8 not rendered, awaiting client permission to publish; copy retained in registry, page shows placeholder. Restore intro + <ul> in about/page.tsx when consent granted. Same applies to about.references.1–8 below (each still marked `placed` in registry but not consumed).

### about.references.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Ginna, Bill and Niko (phone number and/or email)
- live-text: |
  Ginna, Bill and Niko
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request via intro), user-confirmed 2026-06-09.
- notes: -

### about.references.2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Simone and Splash (phone number and/or email)
- live-text: |
  Simone and Splash
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Carol and Millie (phone number and/or email)
- live-text: |
  Carol and Millie
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.4

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Claudia and Sophie (phone number and/or email)
- live-text: |
  Claudia and Sophie
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.5

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Abby and sloane (phone number and/or email)
- live-text: |
  Abby and Sloane
- transforms: capitalization "sloane" → "Sloane" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.6

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Kula and lila (phone number and/or email)
- live-text: |
  Kula and Lila
- transforms: capitalization "lila" → "Lila" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.7

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Madeleine, apollo, anabella (phone number and/or email)
- live-text: |
  Madeleine, Apollo, Anabella
- transforms: capitalization "apollo"/"anabella" → "Apollo"/"Anabella" (auto); agent-resolved — stripped "(phone number and/or email)" directive, contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### about.references.8

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/about/page.tsx
- applied-from: |
  Bugaboo (phone number and/or email)
- live-text: |
  Bugaboo
- transforms: agent-resolved — stripped "(phone number and/or email)" directive; contact NOT published (available on request), user-confirmed 2026-06-09.
- notes: -

### resources.intro

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Over the years, I've spent a lot of time learning about animal health, behavior, training, and safety. The resources below cover topics I frequently discuss with clients, including several hazards that are particularly common in Colorado.
- live-text: |
  Over the years, I've spent a lot of time learning about animal health, behavior, training, and safety. The resources below cover topics I frequently discuss with clients, including several hazards that are particularly common in Colorado.
- transforms: none
- notes: ✅ "Colorado" is state-level — within DESIGN.md guardrails. Resources page restructured from the 2-resource + 5-FAQ placeholder scaffold to a 3-category library + intro/closing + 2 FAQs (user-confirmed 2026-06-09).

### resources.health.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Animal CPR (https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr?srsltid=AfmBOoppNCvKMXnfTgpz-0aSJqVQmDPKamR8feet-5edyhZWtvRsztF1)
- live-text: |
  Animal CPR
- transforms: agent-resolved link target — name links to https://www.redcross.org/take-a-class/cpr/performing-cpr/pet-cpr (href in page data; name raw inside <a>). Stripped Google tracking token "?srsltid=…" from the URL (user-confirmed 2026-06-09).
- notes: -

### resources.health.1.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Animal CPR is similar to human CPR, but differs in technique due to differences in anatomy. While we hope to never need this skill, knowing the basics can make a critical difference in an emergency and can provide valuable peace of mind.
- live-text: |
  Animal CPR is similar to human CPR, but differs in technique due to differences in anatomy. While we hope to never need this skill, knowing the basics can make a critical difference in an emergency and can provide valuable peace of mind.
- transforms: none
- notes: -

### resources.health.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Animal Poison Control (https://www.aspca.org/pet-care/aspca-poison-control) - (888) 426-4435 or (855) 764-7661
- live-text: |
  Animal Poison Control
- transforms: agent-resolved link target — name links to https://www.aspca.org/pet-care/aspca-poison-control (href in page data). Phone numbers "(888) 426-4435 or (855) 764-7661" kept verbatim as a page-data detail rendered after the name (public-fact contact info, user-confirmed 2026-06-09).
- notes: supersedes the old hardcoded r4 ASPCA placeholder, now dropped.

### resources.health.2.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  If you suspect your pet has ingested or come into contact with a toxic substance, animal poison hotlines can help assess the situation and provide guidance. They will typically ask for information such as your pet's weight, age, medical history, medications, and details about the suspected toxin.
- live-text: |
  If you suspect your pet has ingested or come into contact with a toxic substance, animal poison hotlines can help assess the situation and provide guidance. They will typically ask for information such as your pet's weight, age, medical history, medications, and details about the suspected toxin.
- transforms: none
- notes: -

### resources.health.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Bloat/GVD (https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat)
- live-text: |
  Bloat/GVD
- transforms: agent-resolved link target — name links to https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/gastric-dilatation-volvulus-gdv-or-bloat (href in page data).
- notes: -

### resources.health.3.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Gastric dilatation volvulus (GDV), also known as "bloat" is a life-threatening condition pet owners, especially large-chested dog owners, should be aware of. To reduce the risk of bloat, I recommend that you avoid feeding your dogs in the hour preceding walks or other physical activity.
- live-text: |
  Gastric dilatation volvulus (GDV), also known as "bloat" is a life-threatening condition pet owners, especially large-chested dog owners, should be aware of. To reduce the risk of bloat, I recommend that you avoid feeding your dogs in the hour preceding walks or other physical activity.
- transforms: punctuation — curly quotes around "bloat" normalized to straight ASCII (auto-allowed).
- notes: -

### resources.health.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Heat stroke (https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke)
- live-text: |
  Heat stroke
- transforms: agent-resolved link target — name links to https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/heatstroke (href in page data).
- notes: -

### resources.health.4.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Heat stroke is a serious risk for dogs in Colorado (especially for brachiocephalic/short-snouted breeds) and can become life-threatening very quickly. On hot days I pay extra attention to changes in behavior, energy levels, and body language.
- live-text: |
  Heat stroke is a serious risk for dogs in Colorado (especially for brachiocephalic/short-snouted breeds) and can become life-threatening very quickly. On hot days I pay extra attention to changes in behavior, energy levels, and body language.
- transforms: none
- notes: ✅ "Colorado" state-level — within guardrails.

### resources.health.5.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Hot Pavement (https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/)
- live-text: |
  Hot Pavement
- transforms: agent-resolved link target — name links to https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/ (href in page data).
- notes: -

### resources.health.5.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  When temperatures are above 80°F, I recommend checking surface temperatures before walking your dog. I test this by putting the back of my hand on a sunny patch of pavement for 10–15 seconds—if it's too hot for my hand, it's probably too hot for a dog's paws. Keep in mind that some surfaces, including certain patios, concrete, artificial turf, and dark-colored materials, can become even hotter than asphalt.
- live-text: |
  When temperatures are above 80°F, I recommend checking surface temperatures before walking your dog. I test this by putting the back of my hand on a sunny patch of pavement for 10–15 seconds—if it's too hot for my hand, it's probably too hot for a dog's paws. Keep in mind that some surfaces, including certain patios, concrete, artificial turf, and dark-colored materials, can become even hotter than asphalt.
- transforms: none
- notes: preserved °F, en-dash (10–15), and em-dash (—) verbatim.

### resources.health.6.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Parvovirus (https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus)
- live-text: |
  Parvovirus
- transforms: agent-resolved link target — name links to https://www.avma.org/resources-tools/pet-owners/petcare/canine-parvovirus (href in page data).
- notes: -

### resources.health.6.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Parvo is a highly contagious and often-fatal virus that is especially concerning for puppies. While early socialization is important, I caution against taking puppies to places frequented by unknown dogs—such as dog parks, pet store floors, or other high-traffic dog areas—until they have completed their vaccination series.
- live-text: |
  Parvo is a highly contagious and often-fatal virus that is especially concerning for puppies. While early socialization is important, I caution against taking puppies to places frequented by unknown dogs—such as dog parks, pet store floors, or other high-traffic dog areas—until they have completed their vaccination series.
- transforms: none
- notes: -

### resources.health.7.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Foxtails (https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/)
- live-text: |
  Foxtails
- transforms: agent-resolved link target — name links to https://www.sfspca.org/blog/protect-your-pet-from-the-dangers-of-foxtails/ (href in page data).
- notes: -

### resources.health.7.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Foxtails are common throughout Colorado and can cause minor to severe health problems if they become lodged in a dog's eyes, ears, nose, paws, or skin. If your dog enjoys running through tall grass or off-trail areas, I recommend learning how to identify foxtails and considering the use of a protective field guard (such as an OutFox® hood) in high-risk areas.
- live-text: |
  Foxtails are common throughout Colorado and can cause minor to severe health problems if they become lodged in a dog's eyes, ears, nose, paws, or skin. If your dog enjoys running through tall grass or off-trail areas, I recommend learning how to identify foxtails and considering the use of a protective field guard (such as an OutFox® hood) in high-risk areas.
- transforms: none
- notes: ✅ "Colorado" state-level. Preserved ® on "OutFox®" (Cal's brand reference).

### resources.health.8.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Algae Blooms (https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html)
- live-text: |
  Algae Blooms
- transforms: agent-resolved link target — name links to https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html (href in page data).
- notes: -

### resources.health.8.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Harmful algae blooms are not rare in Colorado and occur regularly in ponds, lakes, reservoirs, and slow-moving water during the warmer months. Because exposure can be rapidly fatal, I recommend keeping dogs out of any unfamiliar body of water, especially those that appear unusually green, blue-green, murky, or covered in surface scum.
- live-text: |
  Harmful algae blooms are not rare in Colorado and occur regularly in ponds, lakes, reservoirs, and slow-moving water during the warmer months. Because exposure can be rapidly fatal, I recommend keeping dogs out of any unfamiliar body of water, especially those that appear unusually green, blue-green, murky, or covered in surface scum.
- transforms: none
- notes: ✅ "Colorado" state-level.

### resources.health.9.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Household Toxins (https://www.aspca.org/news/top-10-toxins-2025)
- live-text: |
  Household Toxins
- transforms: agent-resolved link target — name links to https://www.aspca.org/news/top-10-toxins-2025 (href in page data).
- notes: -

### resources.health.9.desc

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  While most pet owners know about hazards like chocolate and grapes, toxins such as minoxidil (Rogaine), xylitol/sugar alcohols, cannabis, and caffeine are often overlooked. It's worth familiarizing yourself with common household hazards, understanding the potential severity of reactions (such as those caused by grapes/raisins/wine), and keeping potentially toxic substances out of reach of pets.
- live-text: |
  While most pet owners know about hazards like chocolate and grapes, toxins such as minoxidil (Rogaine), xylitol/sugar alcohols, cannabis, and caffeine are often overlooked. It's worth familiarizing yourself with common household hazards, understanding the potential severity of reactions (such as those caused by grapes/raisins/wine), and keeping potentially toxic substances out of reach of pets.
- transforms: none
- notes: -

### resources.tools.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  E collars
- live-text: |
  E collars
- transforms: none
- notes: name-only (no link/description yet) — Cal listed the topic under "Tools & Training"; may add a link/desc later.

### resources.tools.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Harness vs collar
- live-text: |
  Harness vs collar
- transforms: none
- notes: name-only (no link/description yet).

### resources.tools.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Recall Training
- live-text: |
  Recall Training
- transforms: none
- notes: name-only (no link/description yet).

### resources.tools.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Loose-leash walking
- live-text: |
  Loose-leash walking
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.1.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Doggy consent
- live-text: |
  Doggy consent
- transforms: none
- notes: name-only (no link/description yet) — Cal listed the topic under "Enrichment & Well-Being".

### resources.enrichment.2.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Puppy socialization checklist
- live-text: |
  Puppy socialization checklist
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.3.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Mental stimulation ideas
- live-text: |
  Mental stimulation ideas
- transforms: none
- notes: name-only (no link/description yet).

### resources.enrichment.4.name

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Raw food
- live-text: |
  Raw food
- transforms: none
- notes: name-only (no link/description yet).

### resources.closing

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/resources/page.tsx
- applied-from: |
  Please let me know if there are other resources you think I should share. I'm always learning, and I'd love to continue expanding this list with helpful information!
- live-text: |
  Please let me know if there are other resources you think I should share. I'm always learning, and I'd love to continue expanding this list with helpful information!
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: -

> FAQ relocated by page (2026-06-15): the boarding question moved to the services page (`services.faq.1.*`), the updates question to the contact page (`contact.faq.1.*`). Same Cal-verbatim text; see those IDs below. Entries split by intent so each answer renders where the question arises.

> Dropped placeholders (user-confirmed 2026-06-09, "drop everything but Cal's source"): `resources.1.{name,desc}`, `resources.2.{name,desc}`, `resources.faq.{3,4,5}.{q,a}`, and the hardcoded public-fact entries r3 (Animal Emergency & Referral Center of Northern Colorado) + r4 (ASPCA Poison Control). None had prior ledger entries.

> Service copy placed 2026-06-16 (copy-sync from SYNC.md). Cal's text did not map 1-1 to the single-paragraph `detail.body` slot, so the services tab panel was restructured: `detail.body` now renders multi-paragraph block content with `## ` subheads via the new `MarketingProse` component (`src/components/marketing/marketing-prose.tsx`), used in `services/page.tsx`. Still-placeholder service slots (no source in the dump): `services.hero.{eyebrow,title}`, `services.overview`, `services.featured.badge`, `service.*.category` (×4), `service.meet_greet.card.body`, `service.training.included.{3,4}`, `service.walk.included.{1,2,3,4}`.

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

### service.training.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts
- applied-from: |
  Puppy training or basic obedience
- live-text: |
  Puppy training or basic obedience
- transforms: none
- notes: from Cal's "Short Summary". Card-description fallback (used when the DB service.description is empty).

### service.training.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Currently, I offer two types of training: puppy training and basic obedience.
- live-text: |
  Currently, I offer two types of training: puppy training and basic obedience.
- transforms: none
- notes: -

### service.training.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
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
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Customized training plan based on your dog's needs
- live-text: |
  Customized training plan based on your dog's needs
- transforms: none
- notes: from Cal's "What's included". included.{3,4} left placeholder (no source).

### service.training.included.2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Unlimited Q&A support between sessions
- live-text: |
  Unlimited Q&A support between sessions
- transforms: none
- notes: preserved "Q&A" verbatim.

### service.walk.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts
- applied-from: |
  Walks, hikes, runs/jogs, or other adventures
- live-text: |
  Walks, hikes, runs/jogs, or other adventures
- transforms: none
- notes: from Cal's "Summary".

### service.walk.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Walks are scheduled in 15-minute increments and can be tailored to your dog's individual needs and energy level. Whether your pup prefers a leisurely neighborhood stroll or a more vigorous outing, I'm happy to adapt the outing accordingly.
- live-text: |
  Walks are scheduled in 15-minute increments and can be tailored to your dog's individual needs and energy level. Whether your pup prefers a leisurely neighborhood stroll or a more vigorous outing, I'm happy to adapt the outing accordingly.
- transforms: none
- notes: "neighborhood stroll" is generic (not a place name) — within DESIGN.md guardrails.

### service.walk.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
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
- consumed-by: src/features/booking/service-card-display.ts
- applied-from: |
  Drop-in visits for pet and home care
- live-text: |
  Drop-in visits for pet and home care
- transforms: none
- notes: from Cal's "Summary".

### service.check_in.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Check-ins can include feeding, potty breaks, short walks, playtime, enrichment activities, medication administration, and plenty of attention—whatever your pet needs to stay happy and comfortable while you're away, whether that's for several days or just an evening. I'm also happy to help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- live-text: |
  Check-ins can include feeding, potty breaks, short walks, playtime, enrichment activities, medication administration, and plenty of attention—whatever your pet needs to stay happy and comfortable while you're away, whether that's for several days or just an evening. I'm also happy to help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- transforms: none
- notes: preserved em-dash (—).

### service.check_in.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  To ensure animals receive adequate care and companionship, I generally require a minimum of three check-ins per full day you're away. Check-ins are also only available for trips no longer than one week, though exceptions may be possible depending on your pet's personality, needs, and routine.
- live-text: |
  To ensure animals receive adequate care and companionship, I generally require a minimum of three check-ins per full day you're away. Check-ins are also only available for trips no longer than one week, though exceptions may be possible depending on your pet's personality, needs, and routine.
- transforms: none
- notes: -

### service.check_in.included.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Feeding and medication administration
- live-text: |
  Feeding and medication administration
- transforms: none
- notes: -

### service.check_in.included.2

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Potty breaks or short walks
- live-text: |
  Potty breaks or short walks
- transforms: none
- notes: -

### service.check_in.included.3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Home care (mail, plants, trash bins, lights, etc.)
- live-text: |
  Home care (mail, plants, trash bins, lights, etc.)
- transforms: none
- notes: -

### service.check_in.included.4

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Affection and attention
- live-text: |
  Affection and attention
- transforms: none
- notes: -

### service.house_sitting.card.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/features/booking/service-card-display.ts
- applied-from: |
  Overnight pet and home care
- live-text: |
  Overnight pet and home care
- transforms: none
- notes: from Cal's "Summary".

### service.house_sitting.detail.lede

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  House sitting allows your pet to stay in the comfort of their own home and maintain their normal routine while you're away.
- live-text: |
  House sitting allows your pet to stay in the comfort of their own home and maintain their normal routine while you're away.
- transforms: none
- notes: -

### service.house_sitting.detail.body

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Together, we can determine how much time I spend in the home based on your pet's needs. House sitting includes all of the benefits of check-ins—feeding, walks, playtime, medication administration, enrichment, and plenty of attention—along with overnight companionship. I will also help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- live-text: |
  Together, we can determine how much time I spend in the home based on your pet's needs. House sitting includes all of the benefits of check-ins—feeding, walks, playtime, medication administration, enrichment, and plenty of attention—along with overnight companionship. I will also help with home upkeep such as watering plants, bringing in mail, or taking out the trash.
- transforms: none
- notes: preserved em-dashes (—).

### service.house_sitting.included.1

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Feeding and medication administration
- live-text: |
  Feeding and medication administration
- transforms: none
- notes: -

### service.house_sitting.included.2

- status: placed
- provenance: cal-confirmed-edit
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Daily exercise and enrichment (including 45-minute of daily walks per dog)
- live-text: |
  Daily exercise and enrichment (including 45 minutes of daily walks per dog)
- transforms: grammar (user-confirmed 2026-06-16) — "45-minute of daily walks" → "45 minutes of daily walks".
- notes: -

### service.house_sitting.included.3

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Overnight companionship and supervision
- live-text: |
  Overnight companionship and supervision
- transforms: none
- notes: -

### service.house_sitting.included.4

- status: placed
- provenance: agent-resolved
- consumed-by: src/app/(site)/(marketing)/services/page.tsx
- applied-from: |
  Home care (mail, plants, trash bi
- live-text: |
  Home care (mail, plants, trash bins, lights, etc.)
- transforms: agent-resolved — source dump truncated mid-line ("Home care (mail, plants, trash bi"); mirrored the check-in equivalent "Home care (mail, plants, trash bins, lights, etc.)" (user-confirmed 2026-06-16). Replace with Cal's full line once supplied.
- notes: ⚠ source truncated — see cal-source.md note.

### services.faq.1.q

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/services/page.tsx
- applied-from: |
  Can you watch my animal at your house?/Can you board my animal?
- live-text: |
  Can you watch my animal at your house?/Can you board my animal?
- transforms: none
- notes: moved from resources.faq.1.q (2026-06-15) — scope question surfaced on the services page. Slash kept verbatim (Cal's two-phrasing question).

### services.faq.1.a

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/services/page.tsx
- applied-from: |
  Unfortunately, I'm unable to care for clients' pets in my own home at this time due to housing restrictions and the needs of my own dog. I am, however, happy to take your pup on walks, hikes, and other adventures outside of your home!
- live-text: |
  Unfortunately, I'm unable to care for clients' pets in my own home at this time due to housing restrictions and the needs of my own dog. I am, however, happy to take your pup on walks, hikes, and other adventures outside of your home!
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: moved from resources.faq.1.a (2026-06-15).

### contact.header

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/contact/page.tsx
- applied-from: |
  Contact Me
- live-text: |
  Contact Me
- transforms: none
- notes: replaced the "[[HEADER: Contact]]" placeholder (no prior ledger entry).

### contact.faq.1.q

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/contact/page.tsx
- applied-from: |
  Will I receive updates while I'm away?
- live-text: |
  Will I receive updates while I'm away?
- transforms: punctuation — curly apostrophe normalized to straight ASCII (auto-allowed).
- notes: moved from resources.faq.2.q (2026-06-15) — updates/communication question surfaced beside the contact form.

### contact.faq.1.a

- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/contact/page.tsx
- applied-from: |
  Yes! I'm happy to send updates and photos as often as you'd like. I know it can be difficult to be away from your pets, and I strive to provide clear communication and timely responses throughout your booking.
- live-text: |
  Yes! I'm happy to send updates and photos as often as you'd like. I know it can be difficult to be away from your pets, and I strive to provide clear communication and timely responses throughout your booking.
- transforms: punctuation — curly apostrophes normalized to straight ASCII (auto-allowed).
- notes: moved from resources.faq.2.a (2026-06-15).

### contact.subtitle

- status: dropped
- provenance: placeholder
- consumed-by: — (slot removed)
- applied-from: —
- live-text: —
- transforms: agent-resolved — Cal's directive "actually i don't think we need this" → subtitle slot dropped from marketing.ts + the `subtitle` prop removed from contact/page.tsx. Header + contact form retained (user-confirmed 2026-06-09). Was the "[[BODY: what the contact form is for]]" placeholder; no prior ledger entry.
