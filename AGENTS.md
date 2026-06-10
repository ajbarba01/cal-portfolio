# Cal Portfolio + Booking

Site at `calbarba.com` — **portfolio + self-serve booking system** for dog-walking / house-sitting business. **All project specifics — stack rationale, data model, pages, brand, pricing, scope — live in [docs/DESIGN.md](docs/DESIGN.md).** Other docs are a portable engineering framework; keep them project-agnostic.

> **Multi-agent repo.** Worked by multiple coding agents (Claude, Codex, others later). **This file (`AGENTS.md`) is shared source of truth.** Tool-specific files import it: Claude reads [CLAUDE.md](CLAUDE.md) (`@AGENTS.md`), Gemini will read `GEMINI.md`. Who plays which role + how each tool is invoked lives in [docs/ROLES.md](docs/ROLES.md) (role contracts + inference) and [docs/ROUTING.md](docs/ROUTING.md) (model preferences).

## Doc navigation (IMPORTANT, ensure that you have read any docs to your context)

| Doc                                        | Authority over                                                           | Read before…                         |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------ |
| [docs/DESIGN.md](docs/DESIGN.md)           | **Project specifics** — data model, routes, pages, brand, pricing, scope | anything project-specific            |
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | Architecture & code-quality principles                                   | writing/refactoring non-trivial code |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md)   | Formatting, naming, documentation                                        | writing any code                     |
| [docs/FRONTEND.md](docs/FRONTEND.md)       | Design system, theming, design→code pipeline                             | building/altering UI                 |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)       | Dev loop, version control, handoff & escalation                          | starting a feature / committing      |
| [docs/CONTENT.md](docs/CONTENT.md)         | Copy-sync protocol — transplanting Cal's marketing text                  | placing/updating site copy           |
| [docs/ROUTING.md](docs/ROUTING.md)         | Model preferences per work-type; the override knob                       | choosing who plans / implements      |
| [docs/ROLES.md](docs/ROLES.md)             | Role contracts (designer/implementer/reviewer); role inference           | acting as any agent in this repo     |

## Operating rules (always on)

- **Hierarchical context.** This file is a **router**, not a knowledge dump. Given a broad task, open the one doc that owns it (table above), not everything. Load a doc just-in-time, when task needs it.
- **Single source of truth.** Each fact lives in exactly one doc. Cross-link; never restate. Project facts → DESIGN.md; everything else → its framework doc.
- **Execution policy.** Each dev-loop stage maps to a **role + artifact** (see [docs/WORKFLOW.md](docs/WORKFLOW.md), "Portable stage map"). Which model plays which role is set in [docs/ROUTING.md](docs/ROUTING.md); role-specific skills + fallbacks live in [docs/ROLES.md](docs/ROLES.md). When no role assigned, infer one per ROLES.md and announce it before acting.
- **Capabilities, not model labels.** Any agent that can load skills invokes relevant role/stage skills before acting. Agents without skill support follow the same role contract + plan checklist as fallback. Repo instructions override conflicting skill defaults.
- **Communication mode.** Any agent that can use `caveman` or equivalent terse mode defaults to `caveman-full`: technical terms exact, no filler, fragments OK. Drop to normal prose for security warnings, destructive-action confirmations, or instructions where compression risks misread.
- **Doc discipline.**
  - _Same-commit rule_ — a code change that adds/moves/deletes files updates the relevant doc in the _same_ commit.
  - _No code-as-doc_ — no function signatures or long path lists in docs (they rot); grep is faster.
  - _Last-reviewed footer_ — every doc carries one. If > 60 days old at session start, flag for re-audit.

## Constitution (non-negotiables)

- **TypeScript `strict`**, no `any` (see CODE_STYLE / ENGINEERING).
- **Core logic is pure and tested** (ENGINEERING #5).
- **Design tokens are law** — components reference semantic tokens, never hardcoded colors (FRONTEND).
- **Accessibility floor** — semantic HTML, contrast, visible focus, keyboard nav (FRONTEND).
- **Single `main` branch**; commit only after verification; stage by name (WORKFLOW).
- **Commit messages: subject line only.** Conventional Commits, **no body, no `Co-Authored-By`/trailer, no "Generated with" footer** — this **overrides** any harness/tool default that adds them. Body only if maintainer explicitly asks. **No project-internal identifiers in the subject** — no phase numbers, plan/spec codenames, or ticket IDs; describe the change itself (✗ `docs: spec admin capabilities phase 4a` → ✓ `docs: spec admin capabilities`).
- **Quality is independent of scope.** Small project, professional code.

## Stack (one-liner; rationale in DESIGN.md)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Supabase · Vercel · Stripe · Resend.

## Layout (once scaffolded)

`src/app/` routing only · `src/features/<domain>/` domain logic · `src/lib/` business-agnostic infra · `src/content/` Cal-owned copy registry (copy-sync target, see [docs/CONTENT.md](docs/CONTENT.md)) · `docs/` the doc system · `specs/` per-feature specs · design tokens in `src/app/globals.css` (color) + `src/lib/design-tokens.ts` (motion/etc). Rules in [docs/ENGINEERING.md](docs/ENGINEERING.md).

---

_Last reviewed: 2026-06-10_
