# Development Workflow

> Authority for **the dev loop, version control, and multi-agent handoff** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [AGENTS.md](../AGENTS.md). Roles + inference: [ROLES.md](ROLES.md); model preferences: [ROUTING.md](ROUTING.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).

**Consult this doc to decide your next move.** Spec-driven and lightweight: the spec is the source artifact, code is generated output. Quality comes from principles + gates, not ceremony.

---

## Where am I → what's next

Find your current situation; do the action. (Details for each step are in the next section.)

| Situation                                      | Next move                                                                     | Skill to invoke                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| New, non-trivial feature, nothing written      | **Research**, then write a `specs/<feature>.md` (what & why).                 | `superpowers:brainstorming` — for UI features, also `frontend-design` so aesthetic direction lands in the spec  |
| Spec exists, no plan                           | **Plan** — turn it into a dependency-ordered technical plan.                  | `superpowers:writing-plans`                                                                                     |
| Plan approved, not started                     | **Build** — start with tests for the core logic (ENGINEERING #5).             | `superpowers:subagent-driven-development` (default execution — see Skill workflow below)                        |
| Mid-build, non-trivial logic                   | Test-first, then implement; keep logic pure.                                  | `superpowers:test-driven-development`                                                                           |
| Mid-build, UI work                             | Wire up IO/UI; keep logic pure; commit nothing yet.                           | `frontend-design`                                                                                               |
| Think it's done                                | **Verify** — `tsc`/lint/tests, `/code-review`, then `verify` the running app. | `superpowers:verification-before-completion` → `superpowers:requesting-code-review` → `/code-review` → `verify` |
| Got code-review feedback                       | Triage before implementing — verify, don't perform agreement.                 | `superpowers:receiving-code-review`                                                                             |
| Verified                                       | **Ship** — conventional commit to `main`; confirm Vercel deploy.              | —                                                                                                               |
| Hit a bug / unexpected behavior                | Reproduce and find root cause _before_ proposing a fix; don't patch symptoms. | `superpowers:systematic-debugging`                                                                              |
| Small contained edit (typo, one-liner, config) | Skip spec/plan — build + verify directly.                                     | none — **skip threshold** (see Skill workflow)                                                                  |
| Unsure what a feature should do                | Stop and ask the maintainer; don't assume scope.                              | —                                                                                                               |

---

## The loop: Research → Spec → Plan → Build → Verify → Ship

1. **Research** — explore the code and requirements _before_ coding. Use plan mode to separate exploration from execution so you don't solve the wrong problem.
2. **Spec** — `specs/<feature>.md`: the _what_ and _why_, no implementation detail.
3. **Plan** — turn the spec into a technical, dependency-ordered plan.
4. **Build** — implement against the plan. **Test-first for non-trivial logic** (ENGINEERING #5).
5. **Verify** — a _fresh_ pass grades the work: `/code-review`, and `verify` the running app. The author does not grade itself.
6. **Ship** — conventional commit to `main`; confirm the Vercel deploy.

## Skill workflow (execution policy)

The loop above maps 1:1 onto the superpowers skill chain — invoke the stage's skill **before** acting (the `using-superpowers` mandate auto-loads each session). Process skills first (brainstorming, debugging), then implementation skills (frontend-design).

- **Execution is sub-agent driven by default.** Build/verify a plan with `superpowers:subagent-driven-development` — it dispatches per-task subagents that themselves invoke `test-driven-development` (non-trivial logic) and `frontend-design` (UI). `superpowers:executing-plans` is used **only if the maintainer opts in that session.** Plan-file headers state this default.
- **No worktrees.** Subagent execution runs in-session against `main` (consistent with Version control below) — not in a git worktree, unless the maintainer asks.
- **Skip threshold (knob).** Brainstorm + spec + plan are required for anything non-trivial or scope-uncertain. They are **skipped** for contained edits (typo, one-liner, config, isolated fix) — build + verify directly. The maintainer moves this line per session: "skip the spec" pulls a borderline task below the line; "spec this anyway" pushes it above. When unsure which side a task falls on, ask.

## Portable stage map (model-agnostic)

The loop is tool-independent: each stage is a **role + artifact**; only the _invocation_ differs per tool. The artifact is the handoff — whoever holds the next role reads it cold.

| Stage  | Artifact (the contract)         | Claude invokes          | Codex / other invokes        |
| ------ | ------------------------------- | ----------------------- | ---------------------------- |
| Spec   | `specs/<f>.md`                  | `brainstorming`         | plan mode + AGENTS.md        |
| Plan   | `docs/superpowers/plans/<f>.md` | `writing-plans`         | native planning              |
| Build  | code + passing gates            | `subagent-driven` + TDD | reads plan, TDD per the plan |
| Verify | review report                   | `/code-review`          | cross-model review           |

Role contracts for each stage: [ROLES.md](ROLES.md). Who plays each by default: [ROUTING.md](ROUTING.md).

## Handoff contract

A plan is **ready to hand off** when a fresh agent (any model) can run it cold. It MUST contain:

- the spec path and dependency-ordered task groups;
- **test-first markers** for non-trivial logic;
- **the gates named explicitly** — `npm run typecheck`, `npm run lint`, core-logic `npm test`, `/code-review`, manual `verify` — because a non-Claude implementer will not auto-fire superpowers; the plan must _name_ the discipline;
- the Definition of Done.

**Handoff is file + git, not clipboard.** The planner commits the spec + plan; the maintainer gives the implementer a **one-line pointer** ("implement `docs/superpowers/plans/<f>.md`, task group 1"); the implementer reads it off disk. The planner emits this pointer automatically when the plan is complete.

## Escalation protocol

Sequential, file-based handoff has no live agent-to-agent channel: the **maintainer relays** (a ~3-word relay), and escalation is written.

- **Triggers (implementer MUST stop, not improvise):** spec ambiguous; spec contradicts codebase reality; a gate cannot pass; security / data-loss risk; scope creep discovered.
- **Channel — a running `## Handoff log` at the bottom of the plan file.** The implementer appends an entry, commits, and stops:

  ```
  ### ESCALATION — blocking
  Finding: spec assumes pets.owner_id; schema has household_id.
  Options: (a) join via household (b) add column. Recommend (a). Awaiting designer.
  ```

  Flow: implementer logs → maintainer tells the designer "critical finding in the handoff log" → designer resolves in spec/plan, commits → maintainer tells the implementer "resolved, continue".

- **Severity tiers:** **Blocking** → stop, escalate, await decision. **Non-blocking minor** → log it, keep going, batch for later.

## Cross-model verification

The author never grades itself — and across models this is stronger: the **planner-model reviews the implementer-model's diff** (Claude `/code-review`s Codex's code, or the reverse). Catches model-specific blind spots. Critical findings flow through the `## Handoff log` above.

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
- **No Claude attribution** in messages unless explicitly requested.

## Definition of Done

Tests green → types/lint/format clean → **cross-model `/code-review`** clean (a model other than the author grades it, where practical) → manual `verify` of the running feature → conventional commit on `main` → Vercel preview confirmed.

---

_Last reviewed: 2026-06-07_
