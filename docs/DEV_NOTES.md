## now

- ensure owing system
- email system and notification settings for admin and maybe user?
- stripe deployment
- There should be a link to make an inquiry on “your inquiries” page
- Pet besides cat and dog? When adding a pet those are the only options
- Can’t edit or delete a review. You should at least be able to edit it within a certain timeframe
- can't cancel a booking
- there should be a max “max hours cal can be away”
- shouldn't allow you to add walk time for cats.
- there should be a max distance away you can live- it should have a pop up or something if you try to save your address or try to enter an address into a form that has a zip code that’s outside of a certain range
- “With other dogs” shows up on form for cat
- Didn’t actually let me book even though it said availables client
- Why is Emergence contact and Vet required?
- When not filling in required information, the information that was entered was cleared.
- No field for apartment / unit
- no fade in for comments
- replace 23 yrs old with 150+ pets served
- replace all gallery pictures with the new set. Cal edited the album.
- more FAQ questions
- "each cat" is a little confusing, maybe "each additioncal cat"
- "ASPCA Animal Poison Control" the 764 number is not ASPCA its a Pet Poison Control helpline.
- remove walks included leash manners
- remove training included anxious dogs
- Trying to save housesitting service as “requires approval” but it won’t let me save without putting in a default duration. Should I just do 1 minute? Or will clients see that and be confused?
- is "premium night" too confusing?
- "each additional animal" -> "each additional small animal"
- Long stay, extended stay, needy pet care (don’t love the wording of that one), should also be defined.
- tooltips for some hovers?
- Long stay, extended stay, needy pet care (don’t love the wording of that one), should also be defined.
- “Couldn’t save your time. Please try another slot (profiles_incomplete). Is this because you haven’t approved my account yet? If so, it should tell people they need to wait to be approved
- need proper form validation and standardization throughout site. like some have different indicators for field required, and the most heinous fault is that onboarding form clears all information if you get an error while filling it out. theres probably a library for this right?

## NOT MVP

- random ass indicator when you don't fill out a required input in contact page
- navbar underline vertical width
- not sure cal discounts are showing up
- site logo + wordmark typeface (included in seo)
- paw print effect
- maybe: try making some sections or areas a window to the page bg
- onboarding styling: why is there page below the footer, the page width changes from step to 1 to 2
- edit booking does not take up proper width
- timeline selector should show your bookings as grayed out (brown) blocks
- repeating bookings system
- broken proximity effect for account dropdown carot.
- Once you get a few more references, it could be interesting to include pictures of the references (or at least their pets) just to give it some more personality. Yah this could be the same picture/s thats attached to their profile. Like my idea about how when they book the calendar shows their pets face in that slot

## Notes for the other project

- make more skills! (skills for frontend design in your project, etc...)
- components need to be standardized and similar components need to use the same styles
- components should have clear categorizations for when they should be used.
- mockups should maybe be grained in the site, with some sort of skill system for creating mockups that can use the actual components and effects of the site.

## Other

- component-system refactor: primitives (control track / card radius / elevation, `Surface`, family primitives, form controls, `/showcase`, `COMPONENT_SYSTEM.md`) shipped earlier. **Composed layer now done:** `FormSection` + `Surface variant="floating"` added; every form migrated to FormField/FormSection (marketing/auth/account/onboarding/booking/admin); all hand-rolled card surfaces routed through `Surface` (variant by the outer=emphasis/nested=plain rule; admin rows/lists kept `plain` for calm density); toast + header dropdowns on the floating Surface. `design-system/no-drift` is now **`error`** (zero violations). Family swaps partially done: inline CTA links → `TextLink`, booking override/paid-lock callouts → `Alert`; legacy `Card` (`card.tsx`) removed (settings/account callers → Surface; `archive/` excluded from tsconfig). `SideLabelSection` extraction **intentionally skipped** — resources/services/about share only a loose two-column pattern (resources already has its own `LedgerSection`); one primitive would be a forced abstraction. Still open (optional): `SectionHeader`/`StatDisplay`/`Badge` sweeps + `space.sectionY` spacing-token pass. (2026-06-16)

# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here; triage them out to the [audit findings register](superpowers/specs/2026-06-10-audit-findings.md) (bugs/UX), the [roadmap](superpowers/specs/2026-06-10-professionalization-roadmap-design.md) (scope), or DESIGN.md open questions (Cal decisions). Snapshot of 2026-06-10 fully triaged into the register.

## Inbox

- `npm run format:check` fails on 65 pre-existing files (src/ + configs, none docs) — repo-wide prettier drift predating SP1; needs a one-shot `prettier --write .` pass with its own commit (candidate: SP3 codebase work). (2026-06-10)
- Link gate (`check-doc-links.mjs`) is manual discipline only — consider wiring into lint-staged for `*.md`; if checked corpus grows, batch blob reads via `git cat-file --batch` (~3s → ~0.2s). (2026-06-10, SP1 review)
- Wordmark + sign-in button re-render on click of either, but not on marketing→marketing nav — perf candidate for SP7. (2026-06-12, maintainer)
- 2026-06-12 "Now" snapshot (booking edit broken, notes-for-Cal on client paths, admin quote error, premium-day errors, header two-row band, booking-page alignment) baked into the SP6 Plan B task list — tracked there, not here.

---

_Last reviewed: 2026-06-10_
