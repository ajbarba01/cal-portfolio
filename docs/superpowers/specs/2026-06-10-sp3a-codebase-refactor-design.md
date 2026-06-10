# SP3a — Codebase structure refactor (design)

> First half of SP3 (Foundations). Companion: [roadmap](2026-06-10-professionalization-roadmap-design.md) §SP3, [findings register](2026-06-10-audit-findings.md) §SP3. SP3b (system IA + UI primitives: A2, A12, toast, nav affordances) gets its own spec in a later session. This spec owns the **codebase-structure** slice only.

## Goal

Bring the feature codebase to a clean, enforceable modular structure: every feature exposes a public API and hides internals; god files and god components are split into single-purpose units; server-action plumbing is separated from testable mutation logic; the notification system gets a seam. Strictly **behavior-preserving** — no functional or visual change. Sets the final file layout, seams, and patterns that SP4–SP7 build on.

## Scope (findings owned)

From the findings register §SP3, this spec resolves: **A1, A3, A4, A5, A6, A7, A8, A9, A10, A11**. Deferred to SP3b: A2 (confirm-dialog unification), A12 (onboarding IA / nav active-state) — both UI/system concerns.

## Decisions (from maintainer grilling, 2026-06-10)

- **SP3 splits 3a / 3b.** 3a = codebase structure (this spec); 3b = system IA + UI primitives. Smaller plans → cheaper subagent execution, clearer review.
- **Seam enforcement: `eslint-plugin-boundaries`** (lint-enforced gate), not convention-only and not the coarser built-in `no-restricted-imports`. Boundaries become regression-proof and wired into the commit gate.
- **Notifier seam (A11) lives in 3a** — it is a pure backend seam (extract inline email sends behind an interface), not a UI primitive.
- **Execution strategy: foundation-first, then per-concern splits.** Boundaries lock early so every later split is forced through public APIs (minimizes rework).
- **No new seed scenarios.** 3a changes no states; existing scenarios (`fresh`, `busy-week`, `payment-states`, `admin-demo`) are the verification fixtures.

## Standing rule: behavior preservation

No functional or visual change in any step. Safety net, applied per task:

1. Existing test suite — booking and admin already carry dense unit + integration tests (`booking-service.test.ts`, `edit-booking.integration.test.ts`, `admin-create-booking.integration.test.ts`, et al.); these are the characterization harness for the splits.
2. `tsc --noEmit` strict (no `any`).
3. New boundary lint (after it lands) — structural regressions fail the gate.
4. Manual `verify` walk of key client + admin flows on seeded scenarios; scheduler extraction (A7) is checked pixel-identical.

Where a split crosses a boundary with thin existing coverage, add a characterization test **before** moving code (test-driven-development for refactors).

## Architecture

### Target structure & seams (A3)

Each `src/features/<domain>/` gains an `index.ts` enumerating its **public surface** — server actions, public types, public functions/components consumed by other features or by `src/app/`. All other modules are internal; cross-feature imports resolve only through a feature's `index.ts`.

`eslint-plugin-boundaries` is added and configured:

- Element types declared: `feature` (per `src/features/<domain>`), `lib`, `components`, `app`.
- An explicit **allow-list** of legitimate cross-feature dependencies, derived from the real graph after the moves in the next section (e.g. `booking → pricing` public API only — today booking reaches pricing internals; `accounts → booking/pricing/forms` routed through public APIs).
- A rule that a feature's non-`index` modules are not importable from outside the feature.

booking↔pricing is decoupled: pricing exposes its quote/pricing surface via `index.ts`; booking imports only that.

### Cross-feature moves (A4, A8)

Run **before** the boundary allow-list is finalized, so seams are declared against the correct ownership:

- `admin/client-balance.ts` (+ test) → **payments**.
- `admin/admin-guard.ts`, `admin/admin-session.ts` → **lib** (auth/session infra, business-agnostic).
- `admin/meet-greet-upcoming.ts` (+ test) → **booking**.
- `features/admin` retains workflows + domain CRUD only (no longer a god module mixing shared helpers).
- `features/forms` (`emergency-schema.ts`, `registry.ts` — 2 files, 34 lines, fails the deletion test) inlined into **accounts**; folder deleted.

Same-commit rule: AGENTS.md "Layout" section updated to reflect new homes.

### Per-concern splits (A1, A7, A5)

Internal to their features, performed after seams are locked.

- **A1 — `booking-service.ts` (1,513 lines).** Carve the remaining create / cancel / reschedule / edit / series / quote-orchestration cores into one-file-per-concern modules (several sibling cores already exist — `cancellation.ts`, `mutation-policy.ts`, `recurrence.ts`, `series-cron.ts`). `booking-service.ts` either disappears or becomes a thin re-export composing the cores. Public booking surface unchanged via `index.ts`.
- **A7 — scheduler grids** (`week-grid` 821, `month-grid` 787, `day-timeline` 651). Extract a shared **cell primitive + selection hook**; each grid composes them. Output must be pixel-identical (visual check in `verify`). Reduces the duplicated cell render/interaction logic.
- **A5 — client god-components** (`service-booking-client.tsx` 765, `edit-booking-client.tsx` 740, `admin-create-booking-client.tsx` 628). Extract state machines + side effects into **hooks / reducers**, leaving thin presentational components. Guarded by the existing integration tests for edit + admin-create flows.

### Server-action mutation layer (A6)

~20 server actions today interleave auth + repository construction + business logic + `revalidatePath` + result mapping. Target pattern:

- **Action = thin adapter:** authenticate → parse/validate input → call the mutation → revalidate → map domain result to the action's result union.
- **Mutation = testable function** taking injected dependencies (repos, clock, current user) — unit-testable without the Next.js action runtime.
- **Revalidation centralized:** one declared place mapping each mutation to the paths/tags it invalidates, instead of scattered `revalidatePath` calls.

Applied incrementally action-by-action; each conversion keeps the action's external contract identical.

### Notifier seam (A11)

Inline email sends in cores/crons are extracted behind a `Notifier` interface (`notify(event)` — event-typed). The default implementation is a **thin pass-through** to the existing Resend `emails.ts`: zero behavior change. The **outbox table shape** is captured as an ADR (decouples send from commit, enables retries) but **not built** — the full notification system is a post-program project. Result: a clean `notifications` feature boundary and a single injection point for the future system.

### Decision memory (A10)

- `CONTEXT.md` — domain glossary (booking/series/quote/debt/onboarding vocabulary) at repo root (where `improve-codebase-architecture` expects it), feeding future architecture passes.
- `docs/adr/` — Architecture Decision Records authored **as decisions land** during execution: (1) feature-boundary architecture + lint enforcement, (2) action/mutation split pattern, (3) notifier seam + deferred outbox.

### Type suppressions (A9)

Review the 5 suppressions (`photo-crop-field`, `pet-avatar`, `month-grid`, `config-schemas.test`, `zip-centroid-geocoder`): each is either fixed or annotated with a one-line justification naming the library limitation.

## Execution order (plan will expand into tasks)

1. `CONTEXT.md` + `docs/adr/` scaffold (A10) — low risk; subsequent ADRs appended as decisions land.
2. Cross-feature moves (A4, A8) — relocate balance/guard/session/meet-greet/forms to correct homes; update AGENTS.md layout.
3. Public-API `index.ts` per feature + `eslint-plugin-boundaries` enforced + commit-gate wired (A3).
4. `booking-service.ts` split (A1) + scheduler cell primitive (A7).
5. Client god-component extraction (A5).
6. Server-action mutation layer + centralized revalidation (A6).
7. Notifier seam (A11) + outbox ADR.
8. Type-suppression cleanup (A9).

## Industry validation (standing rule)

- **Feature-folder + public-API (barrel) organization** for Next.js App Router is current standard practice — features self-contained under `src/`, internals hidden, app dir kept to routing. (Next.js project-structure guidance; 2025 App Router structure write-ups.)
- **Boundary enforcement:** `eslint-plugin-boundaries` is the recommended tool for expressing "feature A may use feature B's public API but not its internals" in modular React/TS codebases; the built-in `no-restricted-imports` is viable but coarser. Chose the plugin for true architectural enforcement.

Sources:

- https://nextjs.org/docs/app/getting-started/project-structure
- https://www.npmjs.com/package/eslint-plugin-boundaries
- https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports

## Definition of done

- A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 pruned from the findings register (3a slice).
- `eslint-plugin-boundaries` green and wired into the commit gate; cross-feature internal imports impossible without a lint failure.
- `tsc --noEmit` strict, full test suite, and lint all pass.
- Key client + admin flows manually verified on seeded scenarios — **no behavior or visual change**; scheduler output pixel-identical.
- `CONTEXT.md` + ADRs committed; AGENTS.md "Layout" section reflects the moves (same-commit rule).
- Plan satisfies the WORKFLOW.md handoff contract (self-contained, dependency-ordered, subagent-executable).

---

_Last reviewed: 2026-06-10_
