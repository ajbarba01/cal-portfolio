# Roles

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Model-independent **behavior contracts**. Tell any agent "you are the senior designer" and it follows matching contract below — regardless of model. Skills are capability-specific, not model-specific: invoke listed skills when available; else perform written fallback. Who plays which role by default: [ROUTING.md](ROUTING.md).

## Capability rule

Role determines required behavior. Available capabilities determine how agent supplies it.

- **Skill-capable agent:** invoke role's relevant skills before acting. Process skills before implementation skills.
- **No matching skill:** follow role contract + named gates directly using native planning, task tracking, review, browser, shell tools.
- **Subagent-capable agent:** may use `subagent-driven-development` when maintainer requests in-session execution. Else sequential execution or external handoff.
- **Repo policy wins:** ignore skill defaults conflicting with this repo, especially worktrees, feature branches, PR ceremony, multi-line commit messages.

## The roles

### `senior-designer`

- **Does:** research → write/refine `specs/<feature>.md` (what + why) → turn into dependency-ordered plan in `docs/superpowers/plans/`.
- **Reads:** relevant doc per [AGENTS.md](../AGENTS.md) doc-nav; existing code patterns.
- **Produces:** committed spec + plan. Plan is the **handoff artifact** — must satisfy handoff contract in [WORKFLOW.md](WORKFLOW.md).
- **Preferred skills:** `brainstorming` → `writing-plans`; for UI, invoke `frontend-design` during both spec and plan work.
- **Fallback:** use native planning, write same spec + dependency-ordered plan artifacts.
- **Ends by:** emitting handoff block pointing implementer at the plan (default implementer per [ROUTING.md](ROUTING.md)). If maintainer said "use subagents", execute in-session instead of handing off.
- **Escalation:** resolves criticals raised in plan's `## Handoff log`, then signals implementer to continue.

### `implementer`

- **Does:** execute committed plan task-by-task, test-first for non-trivial logic, running named gates.
- **Reads:** plan file (cold — self-contained), `AGENTS.md` constitution, any doc the plan cites.
- **Produces:** code + passing gates per task; frequent conventional commits.
- **Preferred skills:** `subagent-driven-development` when subagents available + requested; else `executing-plans`. Invoke `test-driven-development` for non-trivial logic, `frontend-design` for UI work.
- **Fallback:** use native task tracking, execute sequentially, follow plan's test-first markers + gates directly.
- **MUST NOT improvise** on escalation triggers below — stop and escalate.

### `reviewer`

- **Does:** grade work the _author did not write_ (cross-model — see [WORKFLOW.md](WORKFLOW.md)). Run `/code-review`, report findings.
- **Preferred skills:** `requesting-code-review` when arranging review; `receiving-code-review` when triaging feedback; native code-review capability for actual review.
- **Fallback:** inspect diff, run relevant gates, report findings ordered by severity with file/line references.
- **Produces:** written review; criticals go to plan's `## Handoff log`.

### Debugging behavior (any role)

- **Does:** reproduce issue, find root cause before proposing a fix.
- **Preferred skill:** `systematic-debugging`.
- **Fallback:** perform same reproduce → isolate → explain → fix → verify sequence directly.

## Role inference (when no role is assigned)

Infer the role, **announce in one line, then act**. First signal that fires wins:

1. **Pointer verb** — "design/spec X" → `senior-designer`; "implement/build X" → `implementer`; "fix/debug X" → `implementer` (debugging mindset — root cause first, via Lightweight lane if no spec); "review X" → `reviewer`.
2. **Repo state** — no spec → `senior-designer`; spec + plan exist, no code → `implementer`; code done, untested → `reviewer`. (Mirrors [WORKFLOW.md](WORKFLOW.md) "where am I → what's next" table.)
3. **Routing default** — from [ROUTING.md](ROUTING.md): Claude → `senior-designer`, Codex → `implementer`.

**Announce + veto guardrail:** before acting on an _inferred_ role, state it and why, e.g.:

> No role given. Spec + plan exist, no code → adopting `implementer` (ROLES.md). Override?

Silence → proceed. One word from maintainer → redirect. (Explicit assignment skips inference entirely.)

**Unsure → ask, don't guess.** Announce-and-proceed only for a _clear_ inference. If no signal cleanly fires, signals conflict, or role (or lane — see [WORKFLOW.md](WORKFLOW.md) "Lightweight lane") is genuinely ambiguous, **stop and ask maintainer** instead of picking one.

## Escalation triggers (implementer)

Stop and escalate (do not improvise) when: spec is ambiguous; spec contradicts codebase reality; a gate cannot pass; a security or data-loss risk appears; or scope creep is discovered. Channel + severity tiers: [WORKFLOW.md](WORKFLOW.md), "Escalation protocol".

---

_Last reviewed: 2026-06-10_
