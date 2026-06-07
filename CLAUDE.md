# Claude Code adapter

@AGENTS.md

> The line above imports the shared, model-neutral source of truth. Everything below is Claude-Code-specific. Project rules, role-specific skill mappings, communication mode, and workflow live in [AGENTS.md](AGENTS.md), [docs/ROLES.md](docs/ROLES.md), and [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Claude-specific invocation

- If `/caveman` is available, invoke `/caveman full` at session start to satisfy the shared communication-mode rule.
- If `using-superpowers` auto-loads, follow it. Invoke the role/stage skills named in [docs/ROLES.md](docs/ROLES.md) before acting.
- Claude subagents are one available implementation mechanism, not a role requirement. Use them only when requested and consistent with repo policy.
- Repo policy overrides skill defaults: work on `main`, create no worktree unless asked, and use subject-line-only commits.

---

_Last reviewed: 2026-06-07_
