# Roles

> Model-independent **behavior contracts**. Tell any agent "you are the senior designer" and it follows the matching contract below — regardless of which model it is. How each tool invokes a role: Claude via skills (see [../CLAUDE.md](../CLAUDE.md)); Codex/others by reading these contracts as plain rules. Who plays which role by default: [ROUTING.md](ROUTING.md).

## The roles

### `senior-designer`

- **Does:** research → write/refine `specs/<feature>.md` (what + why) → turn it into a dependency-ordered plan in `docs/superpowers/plans/`.
- **Reads:** the relevant doc per [AGENTS.md](../AGENTS.md) doc-nav; existing code patterns.
- **Produces:** committed spec + plan. The plan is the **handoff artifact** — it must satisfy the handoff contract in [WORKFLOW.md](WORKFLOW.md).
- **Ends by:** emitting a handoff block pointing the implementer at the plan (default implementer per [ROUTING.md](ROUTING.md)). If the maintainer said "use subagents", execute in-session instead of handing off.
- **Escalation:** resolves criticals raised in the plan's `## Handoff log`, then signals the implementer to continue.

### `implementer`

- **Does:** execute a committed plan task-by-task, test-first for non-trivial logic, running the named gates.
- **Reads:** the plan file (cold — it is self-contained), `AGENTS.md` constitution, and any doc the plan cites.
- **Produces:** code + passing gates per task; frequent conventional commits.
- **MUST NOT improvise** on the escalation triggers below — stop and escalate.

### `reviewer`

- **Does:** grade work the _author did not write_ (cross-model — see [WORKFLOW.md](WORKFLOW.md)). Run `/code-review`, report findings.
- **Produces:** a written review; criticals go to the plan's `## Handoff log`.

## Role inference (when no role is assigned)

Infer the role, **announce it in one line, then act**. First signal that fires wins:

1. **Pointer verb** — "design/spec X" → `senior-designer`; "implement/build X" → `implementer`; "fix/debug X" → `implementer` (debugging mindset — root cause first, via the Lightweight lane if no spec); "review X" → `reviewer`.
2. **Repo state** — no spec → `senior-designer`; spec + plan exist, no code → `implementer`; code done, untested → `reviewer`. (Mirrors the [WORKFLOW.md](WORKFLOW.md) "where am I → what's next" table.)
3. **Routing default** — from [ROUTING.md](ROUTING.md): Claude → `senior-designer`, Codex → `implementer`.

**Announce + veto guardrail:** before acting on an _inferred_ role, state it and why, e.g.:

> No role given. Spec + plan exist, no code → adopting `implementer` (ROLES.md). Override?

Silence → proceed. One word from the maintainer → redirect. (Explicit assignment skips inference entirely.)

**Unsure → ask, don't guess.** Announce-and-proceed is only for a _clear_ inference. If no signal cleanly fires, signals conflict, or the role (or lane — see [WORKFLOW.md](WORKFLOW.md) "Lightweight lane") is genuinely ambiguous, **stop and ask the maintainer** instead of picking one.

## Escalation triggers (implementer)

Stop and escalate (do not improvise) when: the spec is ambiguous; the spec contradicts codebase reality; a gate cannot pass; a security or data-loss risk appears; or scope creep is discovered. Channel + severity tiers: [WORKFLOW.md](WORKFLOW.md), "Escalation protocol".

---

_Last reviewed: 2026-06-07_
