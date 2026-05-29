# Cal Portfolio + Booking

> **Tone contract:** communicate token-aware — concise, technical terms exact, no filler/hedging/pleasantries. The maintainer prefers **caveman mode** (default `caveman-lite`): drop filler but keep full sentences. If the `/caveman` skill is available, invoke it at session start and confirm on first read of this file. Drop to normal prose for security warnings, destructive-action confirmations, and multi-step instructions where order matters. Switch level with `/caveman lite|full|ultra`; exit with "stop caveman".

A site at `calbarba.com` — a **portfolio + self-serve booking system** for a dog-walking / house-sitting business. **All project specifics — stack rationale, data model, pages, brand, pricing, scope — live in [docs/DESIGN.md](docs/DESIGN.md).** The other docs are a portable engineering framework and should stay project-agnostic.

## Doc navigation (read the one your task needs)

| Doc                                        | Authority over                                                           | Read before…                         |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------ |
| [docs/DESIGN.md](docs/DESIGN.md)           | **Project specifics** — data model, routes, pages, brand, pricing, scope | anything project-specific            |
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | Architecture & code-quality principles                                   | writing/refactoring non-trivial code |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md)   | Formatting, naming, documentation                                        | writing any code                     |
| [docs/FRONTEND.md](docs/FRONTEND.md)       | Design system, theming, design→code pipeline                             | building/altering UI                 |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)       | Dev loop, version control; "where am I → what's next"                    | starting a feature / committing      |

## Operating rules (always on)

- **Hierarchical context.** This file is a **router**, not a knowledge dump. Given a broad task, open the one doc that owns it (table above) rather than loading everything. Load a doc just-in-time, when the task needs it.
- **Single source of truth.** Each fact lives in exactly one doc. Cross-link; never restate. Project facts → DESIGN.md; everything else → its framework doc.
- **Doc discipline.**
  - _Same-commit rule_ — a code change that adds/moves/deletes files updates the relevant doc in the _same_ commit.
  - _No code-as-doc_ — no function signatures or long path lists in docs (they rot); grep is faster.
  - _Last-reviewed footer_ — every doc carries one. If it's > 60 days old at session start, flag it for re-audit.

## Constitution (non-negotiables)

- **TypeScript `strict`**, no `any` (see CODE_STYLE / ENGINEERING).
- **Core logic is pure and tested** (ENGINEERING #5).
- **Design tokens are law** — components reference semantic tokens, never hardcoded colors (FRONTEND).
- **Accessibility floor** — semantic HTML, contrast, visible focus, keyboard nav (FRONTEND).
- **Single `main` branch**; commit only after verification; stage by name (WORKFLOW).
- **Quality is independent of scope.** Small project, professional code.

## Stack (one-liner; rationale in DESIGN.md)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Supabase · Vercel · Stripe · Resend.

## Layout (once scaffolded)

`src/app/` routing only · `src/features/<domain>/` domain logic · `src/lib/` business-agnostic infra · `docs/` the doc system · `specs/` per-feature specs · design tokens in `src/app/globals.css` (color) + `src/lib/design-tokens.ts` (motion/etc). Rules in [docs/ENGINEERING.md](docs/ENGINEERING.md).

---

_Last reviewed: 2026-05-29_
