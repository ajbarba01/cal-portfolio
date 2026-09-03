# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here as they happen, then triage them out: bugs and UX defects into the current plan's register, scope into a spec, questions only Cal can answer into [DESIGN.md](DESIGN.md) "Open questions for Cal". An item that has been triaged or shipped is deleted from here — the register or the spec is where it lives afterwards, and a note kept in both places rots in one of them.

## Now

Triaged 2026-09-02 into the [launch-readiness plan](superpowers/plans/2026-09-02-launch-readiness.md). Every tester and owner note from the 2026-09 snapshot (Cal: multi-day availability, references, invisible approved booking, price overrides; Alex: payments toggle, gallery, species picker, unit/apt, notifications, service-area gate, booking refusals, signup forms, house-sitting duration, discounts, onboarding layout, caret effect) maps to a register id there. Owner-gated leftovers sit in that plan's hand-off list.

## Inbox

- The doc-link gate (`scripts/check-doc-links.mjs`) is manual discipline — nothing runs it for you. Worth wiring into lint-staged for `*.md`. If the checked corpus grows, batch the blob reads through `git cat-file --batch` (~3s → ~0.2s). (2026-06-10)
- Wordmark and sign-in button re-render when either is clicked, but not on marketing→marketing navigation. Perf candidate, never chased. (2026-06-12, maintainer)
- Component-system leftovers, all optional: `SectionHeader` / `StatDisplay` / `Badge` family sweeps, and a `space.sectionY` spacing-token pass. The primitives, the composed layer and the `design-system/no-drift` lint rule all shipped; [COMPONENT_SYSTEM.md](COMPONENT_SYSTEM.md) is the authority on what exists. (2026-06-16)

## Not doing

Ideas considered and declined. Here so they stop being re-proposed, not as a backlog.

- More FAQ questions.
- Pagination controls repeated above the list as well as below.
- Photos of the references themselves (or their pets) on the references band — the same picture as their profile, echoing the calendar showing a client's pet in their slot. Revisit only if the reference list gets long enough to feel plain.
- A site logo and wordmark typeface.
- Making some sections a window onto the page background.
- A paw-print cursor effect.

## Notes for other projects

Not this repo's work — parked here because this is where they occurred to me.

- Write more skills, including frontend-design skills scoped to a project.
- Components need standardising: similar components should share styles, and each should carry a clear statement of when to use it.
- Mockups could be grown from the real site — a skill that builds them out of the actual components and effects.

---

_Last reviewed: 2026-09-03_
