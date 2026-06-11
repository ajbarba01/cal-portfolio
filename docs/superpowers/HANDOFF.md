# Program handoff — start here

> Single entry point for any agent working the professionalization program. Owns two things only: **program progress** and **context not written anywhere else**. Rules/process live in their own docs — follow links, don't expect restatement.

## How to start (any session)

1. Read this doc fully.
2. Read the [roadmap](specs/2026-06-10-professionalization-roadmap-design.md) (SP order, scope, standing rules) + your SP's slice of the [findings register](specs/2026-06-10-audit-findings.md).
3. Adopt role per [../ROLES.md](../ROLES.md) and announce it:
   - **Planning session** (SP has no plan yet): `senior-designer` — grill maintainer where roadmap says grill-required, run the industry-validation standing rule, write spec + plan, commit.
   - **Execution session** (plan exists): `implementer` — invoke `superpowers:subagent-driven-development` (maintainer pre-authorizes subagent execution for all SPs): fresh subagent per task, orchestrator reviews each diff.
4. Obey repo constitution ([../../AGENTS.md](../../AGENTS.md)) + dev loop/gates ([../WORKFLOW.md](../WORKFLOW.md)). Communication: caveman-full.
5. Before ending: update **Progress** + append one line to **Session log** below (same-commit rule).

Escalation: blocking → append to the active plan's `## Handoff log`, commit, stop. Minor → log there, continue ([../WORKFLOW.md](../WORKFLOW.md) escalation protocol).

## Progress

| SP  | Name                                 | Spec                                                         | Plan                                                                                               | Status                                       |
| --- | ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Doc architecture                     | roadmap §SP1 (no own spec)                                   | [plan](plans/archive/2026-06-10-doc-architecture.md)                                               | **DONE 2026-06-10**                          |
| 2   | DB seeding framework                 | [spec](specs/2026-06-10-db-seeding-design.md)                | [plan](plans/archive/2026-06-10-db-seeding.md)                                                     | **DONE 2026-06-10**                          |
| 3a  | Foundations — codebase structure     | [spec](specs/2026-06-10-sp3a-codebase-refactor-design.md)    | [plan](plans/2026-06-10-sp3a-codebase-refactor.md)                                                 | **DONE 2026-06-10**                          |
| 3b  | Foundations — system IA + primitives | [spec](specs/2026-06-10-sp3b-system-ia-primitives-design.md) | [A](plans/2026-06-10-sp3b-a-codebase-deepening.md) · [B](plans/2026-06-10-sp3b-b-ia-primitives.md) | **DONE 2026-06-10**                          |
| 4   | Payments complete+harden             | [spec](specs/2026-06-10-sp4-payments-design.md)              | [4a](plans/2026-06-10-sp4a-payments-flow.md) · [4b](plans/2026-06-10-sp4b-payments-harden.md)      | **4a DONE 2026-06-11 · 4b ready to execute** |
| 5   | Admin overhaul                       | —                                                            | —                                                                                                  | pending                                      |
| 6   | Cohesion+feedback sweep              | —                                                            | —                                                                                                  | pending                                      |
| 7   | Performance pass                     | —                                                            | —                                                                                                  | pending                                      |

Interleaved (not SPs, after SP4): booking-mutation P2-P4 + recurring rework + cancellation/debt system — **grill-required**, see roadmap.

## Context not documented elsewhere

**Maintainer (Alex) working rules**

- Lead + grill posture: act as project/technical lead; grill for clarification rather than assume; honest recommendations; industry standards always.
- Mobile parity: mobile must be as fluid/dynamic/intentional as desktop in every UI plan (source: [../FRONTEND.md](../FRONTEND.md) responsive rules).
- Invoke `frontend-design` skill before building/altering any UI (source: [../FRONTEND.md](../FRONTEND.md) pipeline).
- Codex is gone — Claude-only. "Cross-model review" degrades to fresh-session `/code-review` (author never grades itself).

**Repo/tooling gotchas**

- Husky + lint-staged reformats markdown (prettier) and runs tsc on every commit — accept hook reformatting of tables; re-stage if modified.
- Port 3000 often occupied by maintainer's dev server — use `-p 3001` for prod-server checks; don't kill port-3000 processes.
- Local Supabase stack usually running (`npx supabase status`); prod is a separate Supabase project — never point local tooling at prod without explicit maintainer ask.
- Stripe TEST keys (pk_test/sk_test, sandbox) are now in `.env.local`; `STRIPE_WEBHOOK_SECRET` is still absent — the webhook → `payment_status` projection needs the Stripe CLI (`stripe listen`) running locally. `.env.test` keeps a fake `whsec` for the fake-gateway integration suite (no real key needed for `npm test`). Setup runbook: `.env.example` Stripe block.
- Doc-compression work: git history is the backup — create **no** `*.original.md` files (overrides caveman-compress skill default).
- `scripts/check-doc-links.mjs` (exists after SP1 task 1) validates the **staged** version — `git add` before running.
- `npm run db:seed -- <scenario>` (after SP2) wipes ALL non-admin local data then rebuilds it (wipe-first); local-only by host guard, no override flag. Bare `npx supabase db reset` re-creates the `admin@local.test` / `password123` login via `seed.sql`. Scenarios: `fresh`, `busy-week`, `payment-states`, `admin-demo`.

**Audit-session facts (2026-06-10)**

- Doc word baselines: total 14,053 — DESIGN 5,462 · FRONTEND 2,239 · WORKFLOW 1,558 · ENGINEERING 987 · CONTENT 891 · AGENTS 717 · ROLES 708 · DEV_NOTES 637 · CODE_STYLE 371 · ROUTING 369 · CLAUDE 114. SP1 target ≤ ~9,500.
- All 19 plans verified shipped by SP1 and archived to `plans/archive/`.
- `settings.json` SessionStart caveman hook live, acceptance-tested 2026-06-10.
- DEV_NOTES content fully absorbed into the findings register 2026-06-10 — SP1 task 3 confirms, doesn't re-triage.
- Lighthouse baselines (local prod, mobile): perf 0.74–0.89, LCP 3.8–4.4 s, TBT 400 ms on /book/walk, CLS 0, a11y 1.0 — SP7 before/after reference.

**Open maintainer decisions**

- Cal/ops items parked in the register's triage section: dedicated send-address, site voice ("we" vs third person), logo.

## Session log

(append one line per session: date · SP · what moved · blockers)

- 2026-06-10 · audit · roadmap + findings register + SP1 plan committed; SP1 ready to execute.
- 2026-06-10 · SP1 · executed full doc-architecture plan (lifecycle rules, 19 plans archived, DEV_NOTES inbox, portability split, compression, caveman hook); word targets unmet (fact-density), zero fact loss; plan archived.
- 2026-06-10 · SP2 · planning session: spec + plan committed (seed.sql local admin, wipe-first TS scenario seeder, 4 scenarios, local-URL guard; industry-validated). No blockers; execution next session.
- 2026-06-10 · SP2 · executed (subagent-driven): seed.sql admin (sign-in acceptance-tested), TS seeder under scripts/db-seed/ with local-URL guard, date/registry unit tests, all 4 scenarios run idempotently against local stack (admin-demo: 10 profiles/24 bookings/4 payments/2 debits/3 reviews/2 inquiries). Plan defect found+fixed (TZDate.toISOString offset vs UTC). S1 pruned; plan archived.
- 2026-06-10 · SP3a · planning session: split SP3 into 3a (codebase structure) / 3b (system IA + UI primitives). Spec + plan committed for 3a (A1,A3,A4,A5,A6,A7,A8,A9,A10,A11): foundation-first behavior-preserving refactor — eslint-plugin-boundaries seams, booking-service/scheduler/client-component splits, mutation layer, notifier seam, CONTEXT+ADRs. Industry-validated (Next.js App Router feature-folders + boundaries plugin). No blockers; execution next session. A2 + A12 carry to 3b.
- 2026-06-10 · SP3a · executed (subagent-driven, all 10 tasks): cross-feature moves; enforced feature boundaries (`eslint-plugin-boundaries`) + **client/server entry split** (`index.client.ts`) after the barrels broke the client build; booking-service split into per-concern cores; scheduler cell primitive; client-state hooks; testable mutation layer; notifier seam; suppression cleanup; CONTEXT + ADRs 0001–0004. Behavior-preserving; typecheck + lint + `next build` green; new mutation/notifier unit tests pass; full suite 7 failed / 751 passed — the 7 are the **pre-existing** shared-DB isolation + stale-inquiry-fixture failures (all pass in isolation on a fresh DB; documented in the plan Handoff log), no new failures. Two regressions caught + fixed mid-flight (server-only client-bundle leak → maintainer-approved entry split; an `onSelectionChange` callback-stability drop in the admin-create hook). Findings A1/A3/A4/A5/A6/A7/A8/A9/A10/A11 pruned; A2/A12 → SP3b.
- 2026-06-10 · SP3b · planning session: spec + 2 plans committed. Maintainer grilling: finish the foundation now (absorb SP3a follow-ups A13/A14/A16), onboarding standalone + nav skeleton, toast type-based duration, confirm-dialog delegated → promise-hook seam. Decomposed into **Plan A — codebase deepening** (A14 shared `toRuleSettings`/`validateSlot`, A16 reuse parsed input, A13 shared `useBookingScheduler` hook; behavior-preserving) and **Plan B — IA + primitives** (unify confirm dialog on `useConfirm` + delete `ui/` dup; generic dialog primitive + shared shell; type-based toast; move onboarding out of the `(account)` zone + `BackToSite` skeleton; `NavBadge` + `AttentionCounts` seam for AD5; feedback conventions + `BackToTop`). Industry-validated (confirm/toast/wayfinding/badge sources cited in spec). No blockers; execution next session(s), Plan A first.
- 2026-06-10 · SP3b · executed both plans (subagent-driven). Plan A — codebase deepening (behavior-preserving, ADR-0005): A14 shared `toRuleSettings` (guard/window pairing left per-core by design); A16 surfaced parsed input on `BookingQuoteArtifacts`; A13 extracted the shared `useBookingScheduler` substrate (3 hooks → thin wrappers feeding deltas via refs; invariants preserved). Stood up a hook-test stack (`@testing-library/react` + jsdom, per-file `// @vitest-environment jsdom`) + a `useServiceBooking` characterization test as the A13 safety net (the existing integration tests guard the cores, not the hooks). Plan B — IA + primitives: unified confirm dialog on `useConfirm` (icon + async/pending + alertdialog a11y, `ui/` dup deleted, inquiry-list migrated); generic `Dialog` primitive + shared `dialog-shell` classes; type-based toast (errors sticky+assertive, content-clamp + motion); moved `/onboarding` out of the `(account)` group into `(onboarding)` with a `BackToSite` skeleton; `NavBadge` + `AttentionCounts` seam (AD5 setup); feedback-conventions section in FRONTEND.md + `BackToTop` (U9). Added an `--attention` token (theme-independent, AA). Two fresh-session `/code-review`s (Plan A: zero correctness bugs, dedup'd `localDateFromKey` + strengthened tests; Plan B: zero criticals, hardened `data-slot`/`aria-hidden` + strengthened tests). Gates green: typecheck + lint (0 errors) + `next build`; full suite 7 pre-existing DB-isolation failures (no new) + 10 new primitive/characterization tests. Findings A2/A12/A13/A14/A16 pruned; U3 resolved; U7/AD5 noted primitive-ready. **SP3b DONE.** Manual desktop+mobile+breakpoint walkthrough of the migrated surfaces deferred to the maintainer (responsive classes are the established pattern; a11y/behavior covered by tests + `next build`).
- 2026-06-10 · SP4 · planning session (senior-designer): spec + 4a plan committed. Maintainer grilling (all recs accepted): split 4a (test-mode infra + flow completion + intent lifecycle) / 4b (refund re-model + hardening); PaymentElement in the SP3b Dialog; full-amount-prepay/pay-later unchanged; add `refunded_cents` + `partially_refunded` for PAY3; reuse open intents w/ booking-scoped idempotency key (PAY4); test keys in `.env.local` + Alex's Stripe TEST account. Industry-validated (Stripe: PaymentElement over legacy CardElement, idempotency-key reuse, charge.amount_refunded partial-refund tracking — sources cited). 4a plan owns PAY1/PAY2/PAY4 + `payment_intent.canceled`; 4b (PAY3/PAY5/dispute events/PAY7) planned JIT after 4a lands. No blockers; execution next session. Prereq for execution: Alex provisions a Stripe test account + keys. Caught a stable-idempotency-key cache collision on the cancel-recreate path and fixed it in the plan.
- 2026-06-11 · SP4 · executed 4a payments-flow (subagent-driven, 8 tasks, fresh subagent + diff review each): PaymentElement mounted in the account-bookings dialog (token-resolved appearance), open-intent reuse + booking-scoped idempotency (cancel-and-recreate on stale, key rotated), `payment_intent.canceled` → row `failed` (booking status untouched), test keys in `.env.local` + setup runbook in `.env.example`, `pay-prepayable` seed target. Gates green: typecheck · lint (0 err) · `next build` · payments suite 20/20. Fresh-session `/code-review` (opus): APPROVED-with-minors, all invariants verified; fixed the one Important finding (`c0c1c6d` — newest-open-intent select + error-bail, + regression test). Pruned PAY1/PAY2/PAY4 + canceled-half-PAY6. **Blocker:** live `stripe listen` money-movement verify unrun — no Stripe CLI installed (keys present, webhook secret not forwarded). SP4b (PAY3/PAY5/`charge.dispute.*`/PAY7 + the `retrieveIntent` 404-guard) planned JIT after the verify lands.
- 2026-06-11 · SP4 · planning session (senior-designer): SP4b plan committed + spec §SP4b refined. Maintainer grilling (4 decisions, all recs accepted): disputes → persist a `payments.disputed_at`/`dispute_status` marker + log (no enum value); canceled intents → keep `canceled→failed` (resolves the 4a provisional note, no new status); overpay (PAY5) → auto-refund the excess from the webhook (optional gateway dep, idempotency-keyed); PAY7 email voice → first-person singular (settles the PARKED voice decision for transactional copy; policy lines on the confirmation email, cancellation email deferred to SP6). Industry re-validation (API `2026-05-27.dahlia`): confirmed `charge.amount_refunded` is the cumulative source of truth (read in `charge.refunded`, not a per-refund delta); dispute object carries `payment_intent` + closed statuses won/lost/warning_closed/prevented; additive `add value if not exists` enum migration (own file, forward-only). Refined the projection precedence to **paid-first** (overpay-safe). 9 tasks (migration → projection → cumulative-refund webhook → overpay reconcile → disputes → 404-guard → email copy → seed → gates+verify+prune). No blockers; execution next session (subagent-driven).
- 2026-06-11 · SP4 · maintainer ran the live `verify` (real `stripe listen` + Stripe CLI, `STRIPE_WEBHOOK_SECRET` now in `.env.local`): prepay with the `4242` test card → `payment_status` projected to `paid`; repeat-click reuse confirmed (no second PaymentIntent); mobile walked. → **SP4a DONE.** SP4b (harden) needs a plan next (spec §SP4b already exists).
- 2026-06-10 · SP3a · fresh-session `/code-review` received + addressed → **SP3a DONE**. No criticals. 6 findings: 2 trivial extraction defects fixed (`dbd69c7` — dead `step2Label` ternary; unused `pets`/`priorFinalCents` inputs on the edit hook); 4 are pre-existing duplication/perf that SP3a relocated verbatim (NOT regressions) → logged as **A13–A16** for follow-up (A13 unify the 3 booking-scheduler hooks → SP3b; A14 shared `toRuleSettings`/`validateSlot` for the 4× guard/window block → SP3b/booking-mutation; A15 serial debt/onboarding awaits → SP7; A16 redundant create-core re-parse → SP3b/booking-mutation). Deferred rather than expand SP3a's behavior-preserving scope at DoD — maintainer can pull any forward.

---

_Last reviewed: 2026-06-10_
