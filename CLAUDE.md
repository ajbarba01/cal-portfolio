# Claude Code adapter

@AGENTS.md

> Line above imports shared, model-neutral source of truth. Below is Claude-Code-specific. Project rules, role-specific skill mappings, communication mode, workflow live in [AGENTS.md](AGENTS.md), [docs/ROLES.md](docs/ROLES.md), [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Claude-specific invocation

- Caveman mode auto-injected via `.claude/settings.json` SessionStart hook (satisfies shared communication-mode rule).
- If `using-superpowers` auto-loads, follow it. Invoke role/stage skills named in [docs/ROLES.md](docs/ROLES.md) before acting.
- Claude subagents are one implementation mechanism, not a role requirement. Use only when requested and consistent with repo policy.
- Repo policy overrides skill defaults: work on `main`, no worktree unless asked, subject-line-only commits.

---

_Last reviewed: 2026-06-10_
