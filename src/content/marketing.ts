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
  "home.hero.hook": "Reliable pet care on the Front Range",
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
  "about.summary": "And Kiche!",
  "about.bio.p1":
    "I recently graduated from Colorado College with a degree in Anthropology and currently live in Lakewood—though I also spend time in Boulder and throughout the Front Range.",
  "about.bio.p2":
    "Animals have been a part of my life for as long as I can remember. Growing up, my family had three cats and three dogs, and I now have my own husky mix (named Kiche), who is rarely far from my side.",
  "about.bio.p3":
    "Over the years, I've had the opportunity to work with hundreds of pets. My experience includes caring for puppies, senior pets, highly anxious dogs, reactive dogs, and multi-pet households, with much of my work centered around large-breed dogs. Beyond hands-on pet care, I've shadowed a veterinarian and have human-focused medical training as well (EMT and WFR). With my own dogs, I've explored activities such as agility, scent work, canicross, and bikejoring, and I enjoy continuing to learn about animal behavior, health, and enrichment.",
  "about.bio.p4":
    "When I'm not working, I like to spend my time outdoors or practicing sports. I enjoy climbing, hiking, running, lifting, and martial arts. My own husky mix, Kiche, has accompanied me on eight Colorado fourteeners so far and we plan to do many more!",
  "about.approach.p1":
    "Every pet has different needs, and every household has different routines, preferences, and expectations. My goal is to provide thoughtful, individualized care that helps both pets and their people feel comfortable and supported. I welcome clients from all backgrounds and strive to create an experience that is respectful, inclusive, and free of judgment.",
  "about.approach.p2":
    "Whether I'm taking your dog on a walk, stopping by for a visit, or caring for your pets and your home while you're away, I aim to provide the same level of attention, reliability, and compassion that I would want for my own animals.",
  // Stat ribbon (about page) — short, factual credentials Cal can tune. The CC
  // entry renders as the Colorado College logo; age is derived from Cal's DOB
  // in the page, so only its label lives here.
  "about.stat.cc.label": "B.A. Anthropology",
  "about.stat.age.label": "Years old",
  "about.stat.rover.value": '"Star Sitter"',
  "about.stat.rover.label": "Top-rated on Rover",
  "about.stat.clients.value": "100+",
  "about.stat.clients.label": "Happy clients",
  "about.stat.experience.value": "6 years",
  "about.stat.experience.label": "Of pet-care experience",
  "about.stat.training.value": "EMT · WFR",
  "about.stat.training.label": "Medical & safety trained",
  "about.stat.fourteeners.value": "8 fourteeners",
  "about.stat.fourteeners.label": "Climbed with Kiche",
  // Favorite-quote epigraph (a line Cal likes — NOT a client testimonial),
  // shown just before References.
  "about.quote.text":
    "[[BODY: a quote Cal likes — about animals, care, or the outdoors]]",
  "about.quote.author": "[[Quote author]]",
  // Caption for the offset bio photo.
  "about.bio.photo.caption": "[[Caption: what this photo shows]]",
  // Shown while the real reference names below stay withheld pending consent.
  "about.references.pending":
    "References from past clients are coming soon. In the meantime, reach out and I'll gladly put you in touch.",
  // References intro + named clients. Contact info is intentionally NOT published
  // (privacy) — it's "available on request" via the reach-out line in the intro.
  "about.references":
    "The following clients have graciously agreed to serve as references. Please feel free to reach out if you have any questions about their experience working with me.",
  "about.references.1": "Ginna, Bill and Niko",
  "about.references.2": "Simone and Splash",
  "about.references.3": "Carol and Millie",
  "about.references.4": "Claudia and Sophie",
  "about.references.5": "Abby and Sloane",
  "about.references.6": "Kula and Lila",
  "about.references.7": "Madeleine, Apollo, Anabella",
  "about.references.8": "Bugaboo",

  // Services — src/app/(marketing)/services/page.tsx
  "services.hero.eyebrow": "[[LABEL: services page eyebrow]]",
  "services.hero.title": "[[HEADER: services page headline]]",
  "services.overview": "[[BODY: services overview]]",
  "services.featured.badge": "[[LABEL: featured service badge]]",
  "services.pricing.header": "Pricing Flexibility Available",
  "services.pricing.body":
    "To accommodate different financial situations, I offer a limited number of free or discounted slots. Please reach out if this is something you're interested in.",
  // FAQ — scope question, surfaced where buyers weigh services (moved from resources, 2026-06-15).
  "services.faq.1.q":
    "Can you watch my animal at your house?/Can you board my animal?",
  "services.faq.1.a":
    "Unfortunately, I'm unable to care for clients' pets in my own home at this time due to housing restrictions and the needs of my own dog. I am, however, happy to take your pup on walks, hikes, and other adventures outside of your home!",

  // Reviews — src/app/(marketing)/reviews/page.tsx
  "reviews.purpose": "[[BODY: reviews section purpose]]",

  // Resources — src/app/(marketing)/resources/page.tsx
  // Names link to the external URL Cal supplied; href lives in the page data, the
  // name stays raw copy (a link can't nest in the <a>). Section headings are
  // hardcoded structural labels, not copy IDs. Tools/Enrichment are names only.
  "resources.intro":
    "Over the years, I've spent a lot of time learning about animal health, behavior, training, and safety. The resources below cover topics I frequently discuss with clients, including several hazards that are particularly common in Colorado.",

  // Health & Safety
  "resources.health.1.name": "Animal CPR",
  "resources.health.1.desc":
    "Animal CPR is similar to human CPR, but differs in technique due to differences in anatomy. While we hope to never need this skill, knowing the basics can make a critical difference in an emergency and can provide valuable peace of mind.",
  "resources.health.2.name": "Animal Poison Control",
  "resources.health.2.desc":
    "If you suspect your pet has ingested or come into contact with a toxic substance, animal poison hotlines can help assess the situation and provide guidance. They will typically ask for information such as your pet's weight, age, medical history, medications, and details about the suspected toxin.",
  "resources.health.3.name": "Bloat/GVD",
  "resources.health.3.desc":
    'Gastric dilatation volvulus (GDV), also known as "bloat" is a life-threatening condition pet owners, especially large-chested dog owners, should be aware of. To reduce the risk of bloat, I recommend that you avoid feeding your dogs in the hour preceding walks or other physical activity.',
  "resources.health.4.name": "Heat stroke",
  "resources.health.4.desc":
    "Heat stroke is a serious risk for dogs in Colorado (especially for brachiocephalic/short-snouted breeds) and can become life-threatening very quickly. On hot days I pay extra attention to changes in behavior, energy levels, and body language.",
  "resources.health.5.name": "Hot Pavement",
  "resources.health.5.desc":
    "When temperatures are above 80°F, I recommend checking surface temperatures before walking your dog. I test this by putting the back of my hand on a sunny patch of pavement for 10–15 seconds—if it's too hot for my hand, it's probably too hot for a dog's paws. Keep in mind that some surfaces, including certain patios, concrete, artificial turf, and dark-colored materials, can become even hotter than asphalt.",
  "resources.health.6.name": "Parvovirus",
  "resources.health.6.desc":
    "Parvo is a highly contagious and often-fatal virus that is especially concerning for puppies. While early socialization is important, I caution against taking puppies to places frequented by unknown dogs—such as dog parks, pet store floors, or other high-traffic dog areas—until they have completed their vaccination series.",
  "resources.health.7.name": "Foxtails",
  "resources.health.7.desc":
    "Foxtails are common throughout Colorado and can cause minor to severe health problems if they become lodged in a dog's eyes, ears, nose, paws, or skin. If your dog enjoys running through tall grass or off-trail areas, I recommend learning how to identify foxtails and considering the use of a protective field guard (such as an OutFox® hood) in high-risk areas.",
  "resources.health.8.name": "Algae Blooms",
  "resources.health.8.desc":
    "Harmful algae blooms are not rare in Colorado and occur regularly in ponds, lakes, reservoirs, and slow-moving water during the warmer months. Because exposure can be rapidly fatal, I recommend keeping dogs out of any unfamiliar body of water, especially those that appear unusually green, blue-green, murky, or covered in surface scum.",
  "resources.health.9.name": "Household Toxins",
  "resources.health.9.desc":
    "While most pet owners know about hazards like chocolate and grapes, toxins such as minoxidil (Rogaine), xylitol/sugar alcohols, cannabis, and caffeine are often overlooked. It's worth familiarizing yourself with common household hazards, understanding the potential severity of reactions (such as those caused by grapes/raisins/wine), and keeping potentially toxic substances out of reach of pets.",

  // Tools & Training (names only — links/descriptions may come later)
  "resources.tools.1.name": "E collars",
  "resources.tools.2.name": "Harness vs collar",
  "resources.tools.3.name": "Recall Training",
  "resources.tools.4.name": "Loose-leash walking",

  // Enrichment & Well-Being (names only)
  "resources.enrichment.1.name": "Doggy consent",
  "resources.enrichment.2.name": "Puppy socialization checklist",
  "resources.enrichment.3.name": "Mental stimulation ideas",
  "resources.enrichment.4.name": "Raw food",

  "resources.closing":
    "Please let me know if there are other resources you think I should share. I'm always learning, and I'd love to continue expanding this list with helpful information!",

  // Gallery — src/app/(marketing)/gallery/page.tsx
  "gallery.eyebrow": "[[HEADER: gallery eyebrow]]",
  "gallery.body": "[[BODY: one line about the photos]]",

  // Contact — src/app/(marketing)/contact/page.tsx
  // No subtitle: Cal dropped it ("actually i don't think we need this") — 2026-06-09.
  // intro + replyNote: from the maintainer-approved SP6 contact mockup (2026-06-11).
  "contact.header": "Contact Me",
  "contact.intro":
    "Questions about walks, sitting, or whether we're a fit — send a note.",
  "contact.replyNote": "I usually reply within a day.",
  // FAQ — communication/reassurance question, surfaced beside the contact form (moved from resources, 2026-06-15).
  "contact.faq.1.q": "Will I receive updates while I'm away?",
  "contact.faq.1.a":
    "Yes! I'm happy to send updates and photos as often as you'd like. I know it can be difficult to be away from your pets, and I strive to provide clear communication and timely responses throughout your booking.",

  // Footer — src/components/layout/site-footer.tsx
  "footer.tagline": "Dog Walking · House Sitting · Colorado",

  // Service cards — src/features/booking/service-card-display.ts
  "service.house_sitting.card.body": "Overnight pet and home care",
  "service.check_in.card.body": "Drop-in visits for pet and home care",
  "service.walk.card.body": "Walks, hikes, runs/jogs, or other adventures",
  "service.training.card.body": "Puppy training or basic obedience",
  "service.meet_greet.card.body":
    "[[BODY: short meet-and-greet service description]]",

  // Service category labels (eyebrow on the /services index rows)
  "service.house_sitting.category": "[[LABEL: house-sitting category]]",
  "service.check_in.category": "[[LABEL: check-in category]]",
  "service.walk.category": "[[LABEL: walk category]]",
  "service.training.category": "[[LABEL: training category]]",

  // Long-form service detail — src/app/(marketing)/book/[serviceSlug]/page.tsx
  "service.house_sitting.detail.lede":
    "House sitting allows your pet to stay in the comfort of their own home and maintain their normal routine while you're away.",
  "service.house_sitting.detail.body":
    "Together, we can determine how much time I spend in the home based on your pet's needs. House sitting includes all of the benefits of check-ins—feeding, walks, playtime, medication administration, enrichment, and plenty of attention—along with overnight companionship. I will also help with home upkeep such as watering plants, bringing in mail, or taking out the trash.",
  "service.house_sitting.included.1": "Feeding and medication administration",
  "service.house_sitting.included.2":
    "Daily exercise and enrichment (including 45 minutes of daily walks per dog)",
  "service.house_sitting.included.3": "Overnight companionship and supervision",
  "service.house_sitting.included.4":
    "Home care (mail, plants, trash bins, lights, etc.)",
  "service.check_in.detail.lede":
    "Check-ins can include feeding, potty breaks, short walks, playtime, enrichment activities, medication administration, and plenty of attention—whatever your pet needs to stay happy and comfortable while you're away, whether that's for several days or just an evening. I'm also happy to help with home upkeep such as watering plants, bringing in mail, or taking out the trash.",
  "service.check_in.detail.body":
    "To ensure animals receive adequate care and companionship, I generally require a minimum of three check-ins per full day you're away. Check-ins are also only available for trips no longer than one week, though exceptions may be possible depending on your pet's personality, needs, and routine.",
  "service.check_in.included.1": "Feeding and medication administration",
  "service.check_in.included.2": "Potty breaks or short walks",
  "service.check_in.included.3":
    "Home care (mail, plants, trash bins, lights, etc.)",
  "service.check_in.included.4": "Affection and attention",
  "service.walk.detail.lede":
    "Walks are scheduled in 15-minute increments and can be tailored to your dog's individual needs and energy level. Whether your pup prefers a leisurely neighborhood stroll or a more vigorous outing, I'm happy to adapt the outing accordingly.",
  "service.walk.detail.body":
    "For dogs who enjoy a little extra adventure, I can also provide hikes and other outings that may involve transportation by car. I'm also more than happy to jog or run dogs when weather, health, and fitness levels permit!\n\nOff-leash outings are offered cautiously and on a case-by-case basis.",
  "service.walk.included.1": "[[LABEL: walk included item 1]]",
  "service.walk.included.2": "[[LABEL: walk included item 2]]",
  "service.walk.included.3": "[[LABEL: walk included item 3]]",
  "service.walk.included.4": "[[LABEL: walk included item 4]]",
  "service.training.detail.lede":
    "Currently, I offer two types of training: puppy training and basic obedience.",
  "service.training.detail.body":
    "## Puppy Training\n\nI'm especially passionate about helping puppies develop into confident, well-mannered adults through positive experiences and thoughtful socialization. I've raised three puppies myself and have had the opportunity to assist with many others. Before getting my own dog, I spent an excessive amount of time researching puppy development, behavior, and training methods so I could be as prepared as possible. I've certainly made mistakes along the way, but I'm excited to share what I've learned from them with other dog owners.\n\n## Basic Obedience\n\nBasic obedience includes the foundational skills that make everyday life with your dog easier and more enjoyable. We can focus on whatever skills are most important to you and your dog, whether that's loose-leash walking, recall, foundational commands, fun tricks, or anything else that does not fall under behaviour modification.\n\nMy training philosophy is relationship-based and my default approach is positive reinforcement. This includes treats, play, praise, or other rewards depending on what motivates your dog. I also have experience with e-collars and other tools, and I'm happy to discuss these options on an individual basis if you believe they may be beneficial for your dog. For more information about e-collars and my thoughts on their use, please see my [resources page](/resources).\n\nAlthough I plan to continue my education before offering any other kind of behavioural or advanced training, I do have experience working with highly anxious and reactive dogs and am completely comfortable walking, caring for, and house sitting for dogs with these challenges.",
  "service.training.included.1":
    "Customized training plan based on your dog's needs",
  "service.training.included.2": "Unlimited Q&A support between sessions",
  "service.training.included.3": "[[LABEL: training included item 3]]",
  "service.training.included.4": "[[LABEL: training included item 4]]",
} as const;

/** Every stable copy ID known to the registry. */
export type CopyId = keyof typeof copy;
