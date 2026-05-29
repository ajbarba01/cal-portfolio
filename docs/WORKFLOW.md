# Development Workflow

> Authority for **the dev loop and version control** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [CLAUDE.md](../CLAUDE.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).

**Consult this doc to decide your next move.** Spec-driven and lightweight: the spec is the source artifact, code is generated output. Quality comes from principles + gates, not ceremony.

---

## Where am I → what's next

Find your current situation; do the action. (Details for each step are in the next section.)

| Situation                                      | Next move                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| New, non-trivial feature, nothing written      | **Research**, then write a `specs/<feature>.md` (what & why).                 |
| Spec exists, no plan                           | **Plan** — turn it into a dependency-ordered technical plan.                  |
| Plan approved, not started                     | **Build** — start with tests for the core logic (ENGINEERING #5).             |
| Mid-build, core logic working                  | Wire up IO/UI; keep logic pure; commit nothing yet.                           |
| Think it's done                                | **Verify** — `tsc`/lint/tests, `/code-review`, then `verify` the running app. |
| Verified                                       | **Ship** — conventional commit to `main`; confirm Vercel deploy.              |
| Hit a bug / unexpected behavior                | Reproduce and find root cause _before_ proposing a fix; don't patch symptoms. |
| Small contained edit (typo, one-liner, config) | Skip spec/plan — build + verify directly.                                     |
| Unsure what a feature should do                | Stop and ask the maintainer; don't assume scope.                              |

---

## The loop: Research → Spec → Plan → Build → Verify → Ship

1. **Research** — explore the code and requirements _before_ coding. Use plan mode to separate exploration from execution so you don't solve the wrong problem.
2. **Spec** — `specs/<feature>.md`: the _what_ and _why_, no implementation detail.
3. **Plan** — turn the spec into a technical, dependency-ordered plan.
4. **Build** — implement against the plan. **Test-first for non-trivial logic** (ENGINEERING #5).
5. **Verify** — a _fresh_ pass grades the work: `/code-review`, and `verify` the running app. The author does not grade itself.
6. **Ship** — conventional commit to `main`; confirm the Vercel deploy.

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

## Definition of Done

Tests green → types/lint/format clean → `/code-review` clean → manual `verify` of the running feature → conventional commit on `main` → Vercel preview confirmed.

---

_Last reviewed: 2026-05-29_
