# Development Workflow

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Authority for **the dev loop, version control, and multi-agent handoff** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [AGENTS.md](../AGENTS.md). Roles + inference: [ROLES.md](ROLES.md); model preferences: [ROUTING.md](ROUTING.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).

**Consult to pick next move.** Spec-driven, lightweight: spec = source artifact, code = output. Quality from principles + gates, not ceremony.

---

## Where am I → what's next

Find current situation; do the action. (Step details next section.)

| Situation                                                  | Next move                                                                                             | Preferred skill/capability                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| New, non-trivial feature, nothing written                  | **Research**, then write a spec in `docs/superpowers/specs/` (what & why).                            | `superpowers:brainstorming` — for UI features, also `frontend-design` so aesthetic direction lands in the spec  |
| Spec exists, no plan                                       | **Plan** — turn it into a dependency-ordered technical plan.                                          | `superpowers:writing-plans`                                                                                     |
| Plan approved, not started                                 | **Build** — start with tests for the core logic (ENGINEERING #5).                                     | `superpowers:subagent-driven-development` if requested/available; otherwise `executing-plans` or native tasks   |
| Mid-build, non-trivial logic                               | Test-first, then implement; keep logic pure.                                                          | `superpowers:test-driven-development`                                                                           |
| Mid-build, UI work                                         | Wire up IO/UI; keep logic pure; commit nothing yet.                                                   | `frontend-design`                                                                                               |
| Think it's done                                            | **Verify** — `tsc`/lint/tests, `/code-review`, then `verify` the running app.                         | `superpowers:verification-before-completion` → `superpowers:requesting-code-review` → `/code-review` → `verify` |
| Got code-review feedback                                   | Triage before implementing — verify, don't perform agreement.                                         | `superpowers:receiving-code-review`                                                                             |
| Verified                                                   | **Ship** — conventional commit to `main`; confirm the deploy.                                         | —                                                                                                               |
| Hit a bug / unexpected behavior                            | Reproduce and find root cause _before_ proposing a fix; don't patch symptoms.                         | `superpowers:systematic-debugging`                                                                              |
| Sub-spec change (bugfix, lighter refactor, contained edit) | **Lightweight lane** — skip spec/plan/handoff; one agent owns it end-to-end; build + verify directly. | role-appropriate debugging/TDD/UI skills if relevant                                                            |
| Unsure what a feature should do                            | Stop and ask the maintainer; don't assume scope.                                                      | —                                                                                                               |

---

## The loop: Research → Spec → Plan → Build → Verify → Ship

1. **Research** — explore code + requirements _before_ coding. Use plan mode to separate exploration from execution; don't solve wrong problem.
2. **Spec** — `docs/superpowers/specs/<date>-<feature>-design.md`: the _what_ and _why_, no implementation detail.
3. **Plan** — turn spec into technical, dependency-ordered plan.
4. **Build** — implement against plan. **Test-first for non-trivial logic** (ENGINEERING #5).
5. **Verify** — _fresh_ pass grades work: `/code-review`, `verify` running app. Author never grades itself.
6. **Ship** — conventional commit to `main`; confirm deploy.

## Skill workflow (execution policy)

Loop maps onto preferred skill chain, but skills are **capabilities, not model identities**. Agent with matching skill invokes it before acting; agent without it follows role contract + artifact checklist directly. Process skills first (brainstorming, debugging), then implementation (frontend-design).

- **Execution may be subagent-driven.** When active agent exposes subagents and maintainer requests in-session execution, use `superpowers:subagent-driven-development`; task agents use `test-driven-development` for non-trivial logic, `frontend-design` for UI. Else `superpowers:executing-plans` if available, or execute plan sequentially with native task tracking.
- **Subagent support is surface-dependent.** If a tool needs explicit feature flag or plugin for subagents, enable/use only when available or when maintainer asks. Without it, use sequential fallback.
- **No worktrees.** Execution runs against `main` (per Version control below), not git worktree unless maintainer asks. Repo rule overrides skill defaults.
- **Skip threshold (knob).** Brainstorm + spec + plan required for anything non-trivial or scope-uncertain. **Skipped** for sub-spec work — bugfixes, lighter refactors, contained edits (**Lightweight lane** below). Maintainer moves this line per session: "skip the spec" pulls borderline task below; "spec this anyway" pushes above. Unsure which side → ask.

## Portable stage map (model-agnostic)

Loop is tool-independent: each stage is a **role + artifact**. Preferred skills accelerate + standardize behavior; fallback produces same artifact without them. Artifact is the handoff — whoever holds next role reads it cold.

| Stage  | Artifact (the contract)                | Role              | Preferred skill(s)                                                            | Fallback                    |
| ------ | -------------------------------------- | ----------------- | ----------------------------------------------------------------------------- | --------------------------- |
| Spec   | `docs/superpowers/specs/<f>-design.md` | `senior-designer` | `brainstorming`; UI also `frontend-design`                                    | native planning + AGENTS.md |
| Plan   | `docs/superpowers/plans/<f>.md`        | `senior-designer` | `writing-plans`                                                               | native dependency planning  |
| Build  | code + passing gates                   | `implementer`     | `subagent-driven-development` or `executing-plans`; TDD/UI skills as relevant | read plan and execute gates |
| Verify | review report                          | `reviewer`        | `requesting-code-review` / native code review                                 | independent diff review     |

Role contracts for each stage: [ROLES.md](ROLES.md). Who plays each by default: [ROUTING.md](ROUTING.md).

## Handoff contract

Plan is **ready to hand off** when fresh agent (any model) runs it cold. MUST contain:

- spec path + dependency-ordered task groups;
- **test-first markers** for non-trivial logic;
- **gates named explicitly** — `npm run typecheck`, `npm run lint`, `npm run test:unit`, `/code-review`, manual `verify` — next implementer may not expose same skills; plan must _name_ the discipline;
- the Definition of Done.

**Handoff is file + git, not clipboard.** Planner commits spec + plan; maintainer gives implementer a **one-line pointer** ("implement `docs/superpowers/plans/<f>.md`, task group 1"); implementer reads it off disk. Planner emits pointer automatically when plan complete.

## Escalation protocol

Sequential, file-based handoff has no live agent-to-agent channel: **maintainer relays** (~3-word relay), escalation is written.

- **Triggers (implementer MUST stop, not improvise):** spec ambiguous; spec contradicts codebase reality; gate cannot pass; security / data-loss risk; scope creep discovered.
- **Channel — running `## Handoff log` at bottom of plan file.** Implementer appends entry, commits, stops:

  ```
  ### ESCALATION — blocking
  Finding: spec assumes items.owner_id; schema has group_id.
  Options: (a) join via group (b) add column. Recommend (a). Awaiting designer.
  ```

  Flow: implementer logs → maintainer tells designer "critical finding in the handoff log" → designer resolves in spec/plan, commits → maintainer tells implementer "resolved, continue".

- **Severity tiers:** **Blocking** → stop, escalate, await decision. **Non-blocking minor** → log it, keep going, batch for later.

## Cross-model verification

Author never grades itself — across models this is stronger: **planner-model reviews implementer-model's diff**. Catches model-specific blind spots. When only one model is in play (see [ROUTING.md](ROUTING.md) for which are), this degrades to a **fresh session** running `/code-review`: it still buys the clean context, just not the second set of blind spots. Critical findings flow through `## Handoff log` above.

## Lightweight lane (sub-spec work)

> When a change doesn't need a spec, it skips the **ceremony**, not the **gates**.

- **Scope — whole sub-spec band, not just one-liners.** Bugfixes, small/medium refactors, isolated contained features. Test is "does this need a spec to get right?", not "is it tiny?". Above the line → full Spec → Plan → handoff. Unsure which side → **ask** (skip-threshold knob above).
- **One agent, end to end.** No spec, plan, handoff artifact, or relay — agent you point at it owns research → fix → verify → commit. Escalation is **direct to maintainer** (only one agent in play; nobody to relay to). If it grows past the line mid-task, stop, escalate to a spec.
- **Gates still apply.** Quality independent of scope (constitution): `tsc`/lint/tests, **TDD for non-trivial logic**, `systematic-debugging` for bugs (root cause, not symptom), manual `verify`. Definition of Done holds.
- **Independent review optional.** For a touchy fix you may still ask another agent or model to `/code-review` the diff — recommended, not required.

## Doc lifecycle

- **Plans:** plan whose Definition of Done shipped moves to `docs/superpowers/plans/archive/` (git mv, same commit as verification or next docs commit). Active plans only in `plans/` root.
- **Specs:** specs live in `docs/superpowers/specs/`, one file per feature, named `<date>-<feature>-design.md`. They are decision records — they stay. Superseded spec moves to `docs/superpowers/specs/archive/` with one-line pointer to successor.
- **Notes inbox:** `docs/DEV_NOTES.md` is a capture inbox, never an authority. Items must be triaged out (bugs → audit/findings register or a plan; scope → roadmap/spec; owner/project questions → DESIGN.md open questions) — triage whenever a planning session touches the area. Untriaged items older than 30 days flagged at session start like a stale last-reviewed footer.
- **Link integrity:** run `node scripts/check-doc-links.mjs` before any docs commit. It is manual discipline, not a hook — nothing runs it for you — and it reads the **staged** copy of each tracked `.md`, so stage the docs first or it grades the previous version.

## Working within a task (context tips)

- **Just-in-time:** open a doc when task needs it, not upfront.
- **In-context learning:** a couple codebase searches make you match existing patterns — prefer that over guessing.
- **Long tasks:** track progress + decisions in spec/plan file (external memory); compact when history bloats.

## Version control & quality gates

- **Single `main` branch**, commit-as-you-go. No PRs / worktrees / branch ceremony (revisit only if collaborators join).
- **Commit only after verification.** Assume tree broken until verified; no broken commits.
- **Stage files by name** (never `git add -A` / `.`) — avoids accidental secret/binary inclusion.
- **Conventional Commits**; imperative subject. **New commit, not amend** (unless asked).
- **Never `--no-verify`** — failing hook means fix root cause.
- **Migrations are append-only once pushed.** A migration that has run against the remote project is history — correct it with a new migration, never by editing the shipped file. Run `supabase migration list --linked` before touching anything in `supabase/migrations/`; it shows what the remote has already applied. The initial seed is a migration like any other: retro-editing it makes a fresh `supabase db reset` and the remote reach the same rows by different paths, and nothing but luck keeps the two equal.
- **Local data is disposable, the remote project is not.** `npm run db:seed -- <scenario>` wipes every non-admin row in the local database before rebuilding it; a host guard keeps it local-only and there is no override flag, so treat a seed run as throwing away whatever local state you were part-way through. Local Supabase is a different project from prod — never point a seed, a reset, or any other local tooling at the remote without asking the maintainer first.
- **No AI attribution** in commit messages unless explicitly requested.
- **Gates before commit:** `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `/code-review`, manual `verify`.
- **Two test projects, two costs.** `test:unit` is the pure suite and runs anywhere. `test:integration` reaches the **local Supabase stack**, so it needs the stack running with the migrations applied and credentials in a local `.env.test`; its files share one database and therefore run sequentially. It is also where row-level security is proved — there is no separate database test harness, so a policy or grant change is only tested if an integration test exercises it as the client role. Run it before shipping anything that touches SQL, RLS, or a repository. The pre-commit hook runs lint-staged plus `npm run typecheck` only — no test is automatic.
- **Subject line only — no body.** Subject is the entire message. Never add bullet points, description paragraphs, or multi-line content after subject. Single imperative sentence.
- **Don't reference specific implementation plans** (phase 1a, etc).

## Definition of Done

Tests green → types/lint/format clean → **cross-model `/code-review`** clean (model other than author grades it, where practical) → manual `verify` of running feature → conventional commit on `main` → deploy confirmed.

---

_Last reviewed: 2026-09-03_
