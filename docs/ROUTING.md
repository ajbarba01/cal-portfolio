# Routing

> Model **preferences** per work-type and the per-session override knob. Roles themselves are model-independent ([ROLES.md](ROLES.md)); this file records which model _prefers_ which role, and how to override. Adding a model = add a column / row — no structural change.

## Defaults (work-type → preferred model)

| Work-type                                       | Planner                                     | Implementer               | Why                                   |
| ----------------------------------------------- | ------------------------------------------- | ------------------------- | ------------------------------------- |
| Architecture / design / spec                    | **Claude** (Opus)                           | —                         | strongest planning                    |
| Mechanical impl / large refactor / test-writing | Claude                                      | **Codex**                 | cheap on ChatGPT Plus, fast           |
| UI                                              | **Claude** (`frontend-design` for the spec) | either                    | aesthetic direction lands in the spec |
| Debugging                                       | whoever holds the context                   | whoever holds the context | context locality beats role purity    |

**Default implementer = Codex.** When the maintainer says nothing, the planner finishes the plan and emits a handoff block targeting Codex.

## Override knob (per session)

The maintainer sets roles per session; this overrides the table above. Same spirit as the WORKFLOW skip-threshold knob.

- "use subagents" → the planner executes in-session via Claude subagents instead of handing off externally.
- "you are the senior designer / implementer / reviewer" → explicit role assignment, skips inference.
- "Codex plans this one" / "Claude implements this" → swap the default planner/implementer for this task.

## Adding a model (e.g. Gemini)

1. Add a shim file (`GEMINI.md`) that imports `AGENTS.md` and adds tool-specific invocation (mirrors [../CLAUDE.md](../CLAUDE.md)).
2. Add the model to the table above where it should be preferred.
3. No change to [ROLES.md](ROLES.md) — roles are already model-independent.

---

_Last reviewed: 2026-06-07_
