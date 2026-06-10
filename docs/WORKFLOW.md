# Development Workflow

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Authority for **the dev loop, version control, and multi-agent handoff** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [AGENTS.md](../AGENTS.md). Roles + inference: [ROLES.md](ROLES.md); model preferences: [ROUTING.md](ROUTING.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).

**Consult this doc to decide your next move.** Spec-driven and lightweight: the spec is the source artifact, code is generated output. Quality comes from principles + gates, not ceremony.

---

## Where am I → what's next

Find your current situation; do the action. (Details for each step are in the next section.)

| Situation                                                  | Next move                                                                                             | Preferred skill/capability                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| New, non-trivial feature, nothing written                  | **Research**, then write a `specs/<feature>.md` (what & why).                                         | `superpowers:brainstorming` — for UI features, also `frontend-design` so aesthetic direction lands in the spec  |
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

1. **Research** — explore the code and requirements _before_ coding. Use plan mode to separate exploration from execution so you don't solve the wrong problem.
2. **Spec** — `specs/<feature>.md`: the _what_ and _why_, no implementation detail.
3. **Plan** — turn the spec into a technical, dependency-ordered plan.
4. **Build** — implement against the plan. **Test-first for non-trivial logic** (ENGINEERING #5).
5. **Verify** — a _fresh_ pass grades the work: `/code-review`, and `verify` the running app. The author does not grade itself.
6. **Ship** — conventional commit to `main`; confirm the deploy.

## Skill workflow (execution policy)

The loop maps onto the preferred skill chain, but skills are **capabilities, not model identities**. Any agent with a matching skill invokes it before acting; an agent without it follows the role contract and artifact checklist directly. Process skills come first (brainstorming, debugging), then implementation skills (frontend-design).

- **Execution may be subagent-driven.** When the active agent exposes subagents and the maintainer requests in-session execution, use `superpowers:subagent-driven-development`; its task agents use `test-driven-development` for non-trivial logic and `frontend-design` for UI. Otherwise use `superpowers:executing-plans` when available or execute the plan sequentially with native task tracking.
- **Subagent support is surface-dependent.** If a tool needs an explicit feature flag or plugin for subagents, enable/use it only when already available or when the maintainer asks. Without it, use the sequential fallback.
- **No worktrees.** Execution runs against `main` (consistent with Version control below), not in a git worktree unless the maintainer asks. This repo rule overrides skill defaults.
- **Skip threshold (knob).** Brainstorm + spec + plan are required for anything non-trivial or scope-uncertain. They are **skipped** for sub-spec work — bugfixes, lighter refactors, contained edits (the **Lightweight lane** below). The maintainer moves this line per session: "skip the spec" pulls a borderline task below the line; "spec this anyway" pushes it above. When unsure which side a task falls on, ask.

## Portable stage map (model-agnostic)

The loop is tool-independent: each stage is a **role + artifact**. Preferred skills accelerate and standardize the behavior; the fallback produces the same artifact without them. The artifact is the handoff — whoever holds the next role reads it cold.

| Stage  | Artifact (the contract)         | Role              | Preferred skill(s)                                                            | Fallback                    |
| ------ | ------------------------------- | ----------------- | ----------------------------------------------------------------------------- | --------------------------- |
| Spec   | `specs/<f>.md`                  | `senior-designer` | `brainstorming`; UI also `frontend-design`                                    | native planning + AGENTS.md |
| Plan   | `docs/superpowers/plans/<f>.md` | `senior-designer` | `writing-plans`                                                               | native dependency planning  |
| Build  | code + passing gates            | `implementer`     | `subagent-driven-development` or `executing-plans`; TDD/UI skills as relevant | read plan and execute gates |
| Verify | review report                   | `reviewer`        | `requesting-code-review` / native code review                                 | independent diff review     |

Role contracts for each stage: [ROLES.md](ROLES.md). Who plays each by default: [ROUTING.md](ROUTING.md).

## Handoff contract

A plan is **ready to hand off** when a fresh agent (any model) can run it cold. It MUST contain:

- the spec path and dependency-ordered task groups;
- **test-first markers** for non-trivial logic;
- **the gates named explicitly** — `npm run typecheck`, `npm run lint`, core-logic `npm test`, `/code-review`, manual `verify` — because the next implementer may not expose the same skills; the plan must _name_ the discipline;
- the Definition of Done.

**Handoff is file + git, not clipboard.** The planner commits the spec + plan; the maintainer gives the implementer a **one-line pointer** ("implement `docs/superpowers/plans/<f>.md`, task group 1"); the implementer reads it off disk. The planner emits this pointer automatically when the plan is complete.

## Escalation protocol

Sequential, file-based handoff has no live agent-to-agent channel: the **maintainer relays** (a ~3-word relay), and escalation is written.

- **Triggers (implementer MUST stop, not improvise):** spec ambiguous; spec contradicts codebase reality; a gate cannot pass; security / data-loss risk; scope creep discovered.
- **Channel — a running `## Handoff log` at the bottom of the plan file.** The implementer appends an entry, commits, and stops:

  ```
  ### ESCALATION — blocking
  Finding: spec assumes items.owner_id; schema has group_id.
  Options: (a) join via group (b) add column. Recommend (a). Awaiting designer.
  ```

  Flow: implementer logs → maintainer tells the designer "critical finding in the handoff log" → designer resolves in spec/plan, commits → maintainer tells the implementer "resolved, continue".

- **Severity tiers:** **Blocking** → stop, escalate, await decision. **Non-blocking minor** → log it, keep going, batch for later.

## Cross-model verification

The author never grades itself — and across models this is stronger: the **planner-model reviews the implementer-model's diff** (Claude `/code-review`s Codex's code, or the reverse). Catches model-specific blind spots. Critical findings flow through the `## Handoff log` above.

## Lightweight lane (sub-spec work)

> When a change doesn't need a spec, it skips the **ceremony**, not the **gates**.

- **Scope — the whole sub-spec band, not just one-liners.** Bugfixes, small/medium refactors, isolated contained features. The test is "does this need a spec to get right?", not "is it tiny?". Above the line → full Spec → Plan → handoff. Unsure which side → **ask** (skip-threshold knob above).
- **One agent, end to end.** No spec, no plan, no handoff artifact, no relay — the agent you point at it owns research → fix → verify → commit. Escalation is **direct to the maintainer** (only one agent is in play; nobody to relay to). If it grows past the line mid-task, stop and escalate to a spec.
- **Gates still apply.** Quality is independent of scope (constitution): `tsc`/lint/tests, **TDD for non-trivial logic**, `systematic-debugging` for bugs (root cause, not symptom), manual `verify`. The Definition of Done holds.
- **Independent review optional.** For a touchy fix you may still ask another agent or model to `/code-review` the diff — recommended, not required.

## Doc lifecycle

- **Plans:** a plan whose Definition of Done shipped moves to `docs/superpowers/plans/archive/` (git mv, same commit as the verification or the next docs commit). Active plans only in `plans/` root.
- **Specs:** design specs are decision records — they stay. A superseded spec moves to `docs/superpowers/specs/archive/` with a one-line pointer to its successor.
- **Notes inbox:** `docs/DEV_NOTES.md` is a capture inbox, never an authority. Items must be triaged out (bugs → audit/findings register or a plan; scope → roadmap/spec; owner/project questions → DESIGN.md open questions) — triage whenever a planning session touches the area. Untriaged items older than 30 days get flagged at session start like a stale last-reviewed footer.
- **Link integrity:** `node scripts/check-doc-links.mjs` must pass before any docs commit.

## Working within a task (context tips)

- **Just-in-time:** open a doc when the task needs it, not upfront.
- **In-context learning:** a couple of codebase searches make you match existing patterns — prefer that over guessing.
- **Long tasks:** track progress and decisions in the spec/plan file (external memory); compact when history bloats.

## Version control & quality gates

- **Single `main` branch**, commit-as-you-go. No PRs / worktrees / branch ceremony (revisit only if collaborators join).
- **Commit only after verification.** Assume the tree is broken until verified; no broken commits.
- **Stage files by name** (never `git add -A` / `.`) — avoids accidental secret/binary inclusion.
- **Conventional Commits**; imperative subject. **New commit, not amend** (unless asked).
- **Never `--no-verify`** — a failing hook means fix the root cause.
- No AI attribution in commit messages unless explicitly requested.
- **Gates before commit:** `tsc --strict` + ESLint + Prettier + tests on core logic + `/code-review` + manual `verify`.
- **Subject line only — no body.** Subject is the entire message. Never add bullet points, description paragraphs, or multi-line content after the subject. Single imperative sentence.
- **Don't reference specific implementation plans** (phase 1a, etc).
- **No AI attribution** in messages unless explicitly requested.

## Definition of Done

Tests green → types/lint/format clean → **cross-model `/code-review`** clean (a model other than the author grades it, where practical) → manual `verify` of the running feature → conventional commit on `main` → deploy confirmed.

---

_Last reviewed: 2026-06-07_
