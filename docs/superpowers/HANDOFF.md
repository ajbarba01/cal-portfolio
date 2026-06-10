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

| SP  | Name                                 | Spec                       | Plan                                         | Status                         |
| --- | ------------------------------------ | -------------------------- | -------------------------------------------- | ------------------------------ |
| 1   | Doc architecture                     | roadmap §SP1 (no own spec) | [plan](plans/2026-06-10-doc-architecture.md) | **READY TO EXECUTE — current** |
| 2   | DB seeding framework                 | —                          | —                                            | pending                        |
| 3   | Foundations (code+system+primitives) | —                          | —                                            | pending                        |
| 4   | Payments complete+harden             | —                          | —                                            | pending                        |
| 5   | Admin overhaul                       | —                          | —                                            | pending                        |
| 6   | Cohesion+feedback sweep              | —                          | —                                            | pending                        |
| 7   | Performance pass                     | —                          | —                                            | pending                        |

Interleaved (not SPs, after SP4): booking-mutation P2-P4 + recurring rework + cancellation/debt system — **grill-required**, see roadmap.

## Context not documented elsewhere

**Maintainer (Alex) working rules**

- Lead + grill posture: act as project/technical lead; grill for clarification rather than assume; honest recommendations; industry standards always.
- Mobile parity: mobile must be as fluid/dynamic/intentional as desktop in every UI plan.
- Invoke `frontend-design` skill before building/altering any UI.
- Codex is gone — Claude-only. "Cross-model review" degrades to fresh-session `/code-review` (author never grades itself).

**Repo/tooling gotchas**

- Husky + lint-staged reformats markdown (prettier) and runs tsc on every commit — accept hook reformatting of tables; re-stage if modified.
- Port 3000 often occupied by maintainer's dev server — use `-p 3001` for prod-server checks; don't kill port-3000 processes.
- Local Supabase stack usually running (`npx supabase status`); prod is a separate Supabase project — never point local tooling at prod without explicit maintainer ask.
- No Stripe keys exist in any env file yet (SP4 sets up test mode); payment paths can't run locally until then.
- Doc-compression work: git history is the backup — create **no** `*.original.md` files (overrides caveman-compress skill default).
- `scripts/check-doc-links.mjs` (exists after SP1 task 1) validates the **staged** version — `git add` before running.

**Audit-session facts (2026-06-10)**

- Doc word baselines: total 14,053 — DESIGN 5,462 · FRONTEND 2,239 · WORKFLOW 1,558 · ENGINEERING 987 · CONTENT 891 · AGENTS 717 · ROLES 708 · DEV_NOTES 637 · CODE_STYLE 371 · ROUTING 369 · CLAUDE 114. SP1 target ≤ ~9,500.
- All 19 plans in `plans/` believed shipped (client self-edit route `/account/bookings/[id]/edit` present in prod build) — SP1 task 2 verifies each before archiving.
- `.claude/` holds only `agents/` + `skills/` — `settings.json` greenfield for SP1's caveman hook; hook acceptance test = fresh session speaks caveman unprompted.
- DEV_NOTES content fully absorbed into the findings register 2026-06-10 — SP1 task 3 confirms, doesn't re-triage.
- Lighthouse baselines (local prod, mobile): perf 0.74–0.89, LCP 3.8–4.4 s, TBT 400 ms on /book/walk, CLS 0, a11y 1.0 — SP7 before/after reference.

**Open maintainer decisions**

- OTHER.md (root): delete vs relocate — ask before `git rm` (SP1 task 4).
- Cal/ops items parked in the register's triage section: dedicated send-address, site voice ("we" vs third person), logo.

## Session log

(append one line per session: date · SP · what moved · blockers)

- 2026-06-10 · audit · roadmap + findings register + SP1 plan committed; SP1 ready to execute.

---

_Last reviewed: 2026-06-10_
