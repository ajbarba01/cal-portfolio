## now

- component-system refactor: primitives (control track / card radius / elevation, `Surface`, family primitives, form controls, `/showcase`, `COMPONENT_SYSTEM.md`) shipped earlier. **Composed layer now done:** `FormSection` + `Surface variant="floating"` added; every form migrated to FormField/FormSection (marketing/auth/account/onboarding/booking/admin); all hand-rolled card surfaces routed through `Surface` (variant by the outer=emphasis/nested=plain rule; admin rows/lists kept `plain` for calm density); toast + header dropdowns on the floating Surface. `design-system/no-drift` is now **`error`** (zero violations). Remaining = optional quality follow-ups: family swaps (TextLink for `text-brand-strong hover:underline` CTAs, Alert for inline callouts, SectionHeader/StatDisplay/Badge sweeps), the `SideLabelSection` marketing extraction + `space.*` spacing-token enforcement, and removing the legacy `Card` (`card.tsx`). (2026-06-16)
- hero images should also ease in on load (?)
- word count/character count for pretty much any user input.
- kiche discount
- booking details redesign
- paw print effect
- enter site page
- onboarding styling: why is there page below the footer, the page width changes from step to 1 to 2
- ssg
- maybe: try making some sections or areas a window to the page bg
- what pronouns are being used? most of the site its like Cal is speaking directly to the user but there some text when it says like "Cal will get back to you soon"
- reviews filtering and pagination + mini redesign
- scrolling bar should follow the mouse while hovering it + momentum
- /home should redirect to actual home

## Notes for the future

- make more skills! (skills for frontend design in your project, etc...)
- components need to be standardized and similar components need to use the same styles
- components should have clear categorizations for when they should be used.
- mockups should maybe be grained in the site, with some sort of skill system for creating mockups that can use the actual components and effects of the site.

# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here; triage them out to the [audit findings register](superpowers/specs/2026-06-10-audit-findings.md) (bugs/UX), the [roadmap](superpowers/specs/2026-06-10-professionalization-roadmap-design.md) (scope), or DESIGN.md open questions (Cal decisions). Snapshot of 2026-06-10 fully triaged into the register.

## Inbox

- `npm run format:check` fails on 65 pre-existing files (src/ + configs, none docs) — repo-wide prettier drift predating SP1; needs a one-shot `prettier --write .` pass with its own commit (candidate: SP3 codebase work). (2026-06-10)
- Link gate (`check-doc-links.mjs`) is manual discipline only — consider wiring into lint-staged for `*.md`; if checked corpus grows, batch blob reads via `git cat-file --batch` (~3s → ~0.2s). (2026-06-10, SP1 review)
- Wordmark + sign-in button re-render on click of either, but not on marketing→marketing nav — perf candidate for SP7. (2026-06-12, maintainer)
- 2026-06-12 "Now" snapshot (booking edit broken, notes-for-Cal on client paths, admin quote error, premium-day errors, header two-row band, booking-page alignment) baked into the SP6 Plan B task list — tracked there, not here.

---

_Last reviewed: 2026-06-10_
