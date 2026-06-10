# Professionalization program — roadmap design

> Umbrella design for the full-site audit + refactor program. Source prompt: maintainer audit brief (2026-06-10). Each sub-project (SP) below gets its own spec + plan **just-in-time** in a fresh session; this doc is the only always-loaded program artifact besides the findings register.

## Goal

Audit the entire site across 11 maintainer-defined points, then execute an ordered refactor program bringing every surface to industry standard: responsive, cohesive, Cal-friendly admin, hardened payments, fast, well-architected (code + system + docs), fully verified against design intent.

## Decisions (from maintainer grilling, 2026-06-10)

- **Executor:** Claude only (Codex gone). Planning sessions (senior-designer) separate from execution sessions (subagent orchestration) for token efficiency.
- **Sequencing:** foundations first — docs → seeding → architecture → payments → admin → polish → perf.
- **Payments:** complete + harden the existing stub (intent → webhook → reconciliation → refunds). Pretend money = **Stripe test mode** (test keys + test cards) — industry standard, no code changes.
- **Audit method:** live + static. Run local stack, walk every flow desktop + mobile **including breakpoint transitions**, Lighthouse on key pages; plus code audit.
- **Spec timing:** audit now → findings register + this roadmap + SP1 spec/plan. Later SPs specced JIT — avoids spec rot, saves tokens.
- **Doc architecture:** core-vs-project split + caveman compression of docs + reliable caveman-mode enforcement (mechanism, not prose request). Docs SP runs **first**.
- **Notifications:** SP3 designs seams (notifier interface / outbox); full system is a post-program project.
- **Launch state:** deployed, no real usage — prod data disposable, refactors may be aggressive; migrations still reversible.
- **DEV_NOTES recommendations:** designer is decision maker — each absorbed item gets explicit accept/reject + reasoning in the findings register.

## Artifacts

| Artifact           | Path                                                                      | Lifecycle                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings register  | `docs/superpowers/specs/2026-06-10-audit-findings.md`                     | Written by audit; every finding has severity (critical/major/minor), evidence (file:line or repro), owning SP. Each SP prunes its resolved findings at DoD. |
| This roadmap       | `docs/superpowers/specs/2026-06-10-professionalization-roadmap-design.md` | Updated when SP order/scope changes (same-commit rule).                                                                                                     |
| Per-SP spec + plan | `docs/superpowers/specs/` + `docs/superpowers/plans/`                     | Written JIT at SP start; plan satisfies WORKFLOW.md handoff contract.                                                                                       |

## Sub-projects (ordered)

### SP1 — Doc architecture

Core-vs-project split: framework docs (WORKFLOW, ROLES, ROUTING, ENGINEERING, CODE_STYLE, parts of FRONTEND) fully project-agnostic + portable; project facts live only in DESIGN.md. Caveman-compress all framework docs (style reference: maintainer's OTHER.md). Doc lifecycle rules: plan archiving, DEV_NOTES retired into findings register + roadmap, last-reviewed discipline. Caveman-mode enforcement via reliable mechanism (output style / hook / session start), not a CLAUDE.md sentence.
**Sets up:** every later session cheaper; lifecycle rules govern artifacts SP2-7 produce.

### SP2 — DB seeding framework

`supabase/seed.sql` baseline (services, settings, admin user) + TypeScript scenario seeder (`npm run db:seed -- <scenario>`): `fresh`, `busy-week`, `payment-states`, `admin-demo`. DB reset becomes cheap + repeatable; ends accidental-wipe pain. Test factories remain separate.
**Sets up:** verification in every later SP. Depends on schema only — safe before SP3 (SP3 moves code, not schema).

### SP3 — Foundations: codebase + system architecture

- **Codebase:** feature boundaries, server/client split, data-access patterns (perf-aware), kill band-aids; audit checklist seeded from ENGINEERING.md Critical Findings + current industry standards for Next.js App Router / React (researched during spec).
- **System:** route/page reorganization, admin nav structure ("what does Cal need to do right now" surfaced), onboarding → account, navigation skeleton (every page has a way back/forward).
- **UI primitives:** modular toast system, dialog/popup component, feedback conventions, nav affordances — primitives are architecture ("modularized systems have modularized UI"); SP4-6 consume them.
- **Notification seams:** notifier interface / outbox shape only.
- Architectural root-cause bug fixes from findings register.
  **Sets up:** final file layout, primitives, and nav structure for SP4-7. May split into 3a (codebase) / 3b (system) at spec time.

### SP4 — Payments: complete + harden

Full flow on existing stub: intent → webhook (signature-verified, idempotent) → reconciliation → refunds/debt. Server-derived amounts only; audit trail; Stripe test mode until launch. Admin payment actions (grant refund, mark no-show, debt view) **functional-minimal** using SP3 primitives — SP5 owns their layout/copy polish.
**Sets up:** payment data + actions for SP5 surfaces and booking-mutation P3-P4.

### SP5 — Admin overhaul (Cal-friendly)

Every admin surface tuned for a non-technical operator: straightforward industry-standard controls (time pickers, not minute integers), no exposed internals, no unnecessary work, zero functionality loss. Includes booking-rules-v2 owed UI (settings pickers, refund/no-show actions surfacing, debt view, series-conflict surfacing), manual booking entry polish, inquiry popup flow, ban/reject semantics, admin badges.

### SP6 — Cohesion + feedback + responsiveness sweep

Sitewide application of SP3 primitives. Rule: **every user action produces visible feedback** — hover/click states, toasts, inline, redirects; nothing silent. Redirect-back after auth, post-booking redirect, text wrap/overflow states, empty states, toast redesign application, popup restyle application, own-bookings muted-clay, calendar polish, breakpoint-transition correctness, mobile parity (mobile as intentional as desktop).

### SP7 — Performance pass

Measured: Lighthouse / Core Web Vitals budgets on key pages, before/after numbers. Targets from findings register: gallery lightbox, slow navigations, caching/RSC strategy residuals, image pipeline. Last — measures final architecture, not churn.

## Interleaved feature roadmap (not audit work)

Feature-sized DEV_NOTES items are **not** findings: booking-mutation P2-P4 (client self-edit, cancel bookings + reason + refund semantics, reschedule generalization, recurring rework), account inquiries tab. They stay on the booking-mutation roadmap, slotted **after SP4** (cancel/refund needs payments) and **before SP6** (sweep must cover their surfaces).

## Standing rules

- **Industry validation at spec time.** Every SP spec session validates its approach against current official/industry sources (WebSearch/WebFetch) before finalizing — SP3: Next.js App Router + React architecture guidance; SP4: Stripe integration best practices (Elements, idempotency, refunds); SP5: admin-UX conventions; SP7: Core Web Vitals thresholds. Targeted research against concrete findings, not generic best-practice dumps; cite sources in the spec.
- Each SP extends seed scenarios for the states it changes.
- Each SP prunes its resolved findings from the register at DoD.
- Same-commit doc updates (AGENTS.md discipline).
- WORKFLOW.md gates apply to every SP: typecheck, lint, tests, `/code-review` (fresh reviewer), manual `verify`.

## Audit protocol (this session, next step)

1. **Static:** per-point code audit; `improve-codebase-architecture` skill for SP3 input; DESIGN.md + shipped plans vs implementation diff (band-aid/gap detection); admin-powers inventory; DEV_NOTES triage with accept/reject per recommendation.
2. **Live:** local stack up (minimal manual seed), walk every client + admin flow at desktop + mobile viewports + breakpoint transitions; note silent actions, cohesion breaks, dead-end navigation, slowness; Lighthouse key pages.
3. **Output:** findings register committed, every finding mapped to an SP; then SP1 spec + plan.

## Definition of done (program)

All SP DoDs met → findings register empty of critical/major → admin-powers inventory fully satisfied → payments flow audited green on Stripe test mode → measured perf budgets met → docs reflect final reality.

---

_Last reviewed: 2026-06-10_
