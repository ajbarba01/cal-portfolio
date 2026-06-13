## now

- dropdowns should be same height as search bar and should start below the current selected box
- stars instead of "<n> stars"
- too many eyebrows lol
- card shadowing should be consistent
- oh account should be a profile icon not an account text. also touch up dropdown
- allow some sections to ease in by scroll height not altogether? or remove sections for like gallery and resources and other long sections
- underline proximity vs hover effect have different widths on chrome but not firefox.

# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here; triage them out to the [audit findings register](superpowers/specs/2026-06-10-audit-findings.md) (bugs/UX), the [roadmap](superpowers/specs/2026-06-10-professionalization-roadmap-design.md) (scope), or DESIGN.md open questions (Cal decisions). Snapshot of 2026-06-10 fully triaged into the register.

## Inbox

- `npm run format:check` fails on 65 pre-existing files (src/ + configs, none docs) — repo-wide prettier drift predating SP1; needs a one-shot `prettier --write .` pass with its own commit (candidate: SP3 codebase work). (2026-06-10)
- Link gate (`check-doc-links.mjs`) is manual discipline only — consider wiring into lint-staged for `*.md`; if checked corpus grows, batch blob reads via `git cat-file --batch` (~3s → ~0.2s). (2026-06-10, SP1 review)
- Wordmark + sign-in button re-render on click of either, but not on marketing→marketing nav — perf candidate for SP7. (2026-06-12, maintainer)
- 2026-06-12 "Now" snapshot (booking edit broken, notes-for-Cal on client paths, admin quote error, premium-day errors, header two-row band, booking-page alignment) baked into the SP6 Plan B task list — tracked there, not here.

---

_Last reviewed: 2026-06-10_
