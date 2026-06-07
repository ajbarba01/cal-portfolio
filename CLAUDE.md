# Claude Code adapter

@AGENTS.md

> The line above imports the shared, model-neutral source of truth. **Everything below is Claude-Code-specific** — tone, the superpowers skill mandate, and the role→skill auto-mapping. Project rules, constitution, stack, and doc-nav all live in [AGENTS.md](AGENTS.md); do not restate them here.

## Tone contract

Communicate token-aware — technical terms exact, no filler/hedging/pleasantries. The maintainer prefers **caveman mode** (default `caveman-full`): drop articles (a/an/the), filler, and pleasantries; fragments OK; short synonyms (big not extensive, fix not "implement a solution for"). Code blocks and error strings unchanged. If the `/caveman` skill is available, invoke it at session start and confirm on first read of this file. Drop to normal prose for security warnings, destructive-action confirmations, and multi-step instructions where order matters. Switch level with `/caveman lite|full|ultra`; exit with "stop caveman".

## Skill mandate

The `using-superpowers` mandate auto-loads each session: invoke a relevant skill before acting. Process skills first (brainstorming, debugging), then implementation skills (frontend-design). The dev-loop ↔ skill mapping lives in [docs/WORKFLOW.md](docs/WORKFLOW.md) ("Portable stage map").

## Role → skill auto-mapping (Claude adapter)

When assigned (or inferring, per [docs/ROLES.md](docs/ROLES.md)) a role, Claude auto-invokes the matching skill chain — no manual skill call needed:

| Role                               | Auto-invoke                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Designer / senior designer         | `superpowers:brainstorming` → `superpowers:writing-plans` (UI: also `frontend-design` for the spec)                                              |
| Implementer — in-session subagents | `superpowers:subagent-driven-development` (dispatches per-task subagents using `test-driven-development` / `frontend-design`)                    |
| Implementer — external handoff     | produce the `writing-plans` plan, emit the handoff block per [docs/WORKFLOW.md](docs/WORKFLOW.md); a non-Claude tool (default Codex) executes it |
| Reviewer                           | `/code-review`; on incoming feedback `superpowers:receiving-code-review`; when requesting `superpowers:requesting-code-review`                   |
| Debugging (any role)               | `superpowers:systematic-debugging` before proposing a fix                                                                                        |

Non-Claude tools (Codex, Gemini) get the same role behavior by reading [docs/ROLES.md](docs/ROLES.md) as plain rules — they cannot invoke skills, so the discipline is written into the role contract + the plan checklist.

---

_Last reviewed: 2026-06-07_
