## Now

- Reviews should auto publish
- kiche per booking discount not per profile
- overnight stays are kind of weird in the bookings calendar
- remove holiday days from details & reword other details
- [ { "expected": "number", "code": "invalid_type", "path": [ "nights" ], "message": "Invalid input: expected number, received undefined" } ] on reschedule overnight
- onboarding enter info takes two tries lol

# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here; triage them out to the [audit findings register](superpowers/specs/2026-06-10-audit-findings.md) (bugs/UX), the [roadmap](superpowers/specs/2026-06-10-professionalization-roadmap-design.md) (scope), or DESIGN.md open questions (Cal decisions). Snapshot of 2026-06-10 fully triaged into the register.

## Inbox

- `npm run format:check` fails on 65 pre-existing files (src/ + configs, none docs) — repo-wide prettier drift predating SP1; needs a one-shot `prettier --write .` pass with its own commit (candidate: SP3 codebase work). (2026-06-10)
- Link gate (`check-doc-links.mjs`) is manual discipline only — consider wiring into lint-staged for `*.md`; if checked corpus grows, batch blob reads via `git cat-file --batch` (~3s → ~0.2s). (2026-06-10, SP1 review)

---

_Last reviewed: 2026-06-10_
