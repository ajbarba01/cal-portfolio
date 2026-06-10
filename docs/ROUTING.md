# Routing

> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.

> Model **preferences** per work-type + per-session override knob. Roles and skill mappings are model-independent ([ROLES.md](ROLES.md)); this file records which model _prefers_ which role, not which capabilities it may use. Adding a model = add a column / row — no structural change.

## Defaults (work-type → preferred model)

| Work-type                                       | Planner                   | Implementer               | Why                                   |
| ----------------------------------------------- | ------------------------- | ------------------------- | ------------------------------------- |
| Architecture / design / spec                    | **Claude** (Opus)         | —                         | strongest planning                    |
| Mechanical impl / large refactor / test-writing | Claude                    | **Codex**                 | cheap on ChatGPT Plus, fast           |
| UI                                              | **Claude**                | either                    | aesthetic direction lands in the spec |
| Debugging                                       | whoever holds the context | whoever holds the context | context locality beats role purity    |

**Default implementer = Codex.** When maintainer says nothing, planner finishes plan and emits handoff block targeting Codex.

## Override knob (per session)

Maintainer sets roles per session; this overrides table above. Same spirit as WORKFLOW skip-threshold knob.

- "use subagents" → active agent uses in-session subagents if current surface exposes them; else says so and uses sequential fallback.
- "use subagents" also sets model-selection convention: focused, directed implementer/checker subagents use the
  cheapest capable model available by default; broad architecture, design, ambiguous debugging, and final high-stakes
  review may use a stronger model. Escalate model strength only for a concrete reason, not by habit.
- "use skills" / "no skills" → prefer available role skills or force written fallback for this session.
- "use caveman" / "no caveman" → enable or disable shared terse communication mode for this session.
- "you are the senior designer / implementer / reviewer" → explicit role assignment, skips inference.
- "Codex plans this one" / "Claude implements this" → swap default planner/implementer for this task.

## Adding a model (e.g. Gemini)

1. Add shim file (`GEMINI.md`) importing `AGENTS.md` + tool-specific invocation (mirrors [../CLAUDE.md](../CLAUDE.md)).
2. Add model to table above where it should be preferred.
3. No change to [ROLES.md](ROLES.md) — roles already model-independent.

---

_Last reviewed: 2026-06-10_
