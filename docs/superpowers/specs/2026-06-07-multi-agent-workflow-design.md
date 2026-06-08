# Multi-Agent Workflow Framework (design)

> Owns the **what + why** of a model-agnostic, multi-agent development workflow
> (Claude + Codex today, Gemini/others later). The plan owns the how. This is a
> **process/infrastructure** spec — it changes docs and root config files, not app
> code. Nothing in the project constitution is repealed; this layers on top of the
> existing Research → Spec → Plan → Build → Verify → Ship loop in
> [WORKFLOW.md](../../WORKFLOW.md).

> **Capability amendment (2026-06-07):** skill support is capability-specific, not
> model-specific. Any agent that exposes a relevant skill should invoke it; agents
> without that capability follow the same role contract and artifact checklist as
> fallback. This supersedes this document's older claims that Superpowers and
> `frontend-design` are Claude-only or that Codex/Gemini cannot invoke skills.
> Current authority: [ROLES.md](../../ROLES.md) and [WORKFLOW.md](../../WORKFLOW.md).

## Why this exists

The maintainer wants to use more than one coding agent — e.g. Claude (Opus) for
architecture/design and OpenAI **Codex** (included with ChatGPT Plus) for
implementation — and to be free to swap who plans vs who implements per task,
adding Gemini or others later. The goal: a workflow that is **unbiased about which
model is used** yet lets the maintainer **set preferences** per model and per
work-type, with **as little human intervention as possible**.

Two industry facts ground the design (researched 2026-06-07):

- **`AGENTS.md` is the cross-agent standard** (Linux Foundation / Agentic AI
  Foundation). Read natively by Codex, Copilot, Cursor, Windsurf, Amp, Devin.
  Claude Code reads `CLAUDE.md` (imports AGENTS.md via `@AGENTS.md`); Gemini reads
  `GEMINI.md`. So a model-neutral instruction layer already exists as a file
  convention — no framework needed.
- **Spec-driven development is the model-agnostic seam.** The spec/plan is the
  artifact; code is the build output. Any model can pick up a written plan. This
  repo already works this way; we make the artifact the explicit handoff contract.

Research caveat that shapes the design: **human-written** AGENTS.md files improve
agent success and cut bugs 35–55%; **LLM-generated** instruction files _hurt_
success and raise cost. Therefore shared instruction files stay tight and
hand-curated, never auto-bloated.

## Decisions (locked with maintainer)

1. **Handoff mechanism:** Codex **CLI / IDE extension** (ChatGPT login), running in
   the same working dir. File-based, AGENTS.md-aware. Not copy-paste into
   chatgpt.com; not (yet) Codex cloud.
2. **Routing:** a written policy doc (`docs/ROUTING.md`) with defaults +
   per-session override. Not ad-hoc, not a programmatic router.
3. **Doc topology:** `AGENTS.md` becomes the model-neutral **source of truth**;
   `CLAUDE.md` / `GEMINI.md` become **thin shims** importing it. `docs/*` stay
   (already neutral).
4. **Concurrency:** **sequential handoff** — one agent active at a time. Honors the
   single-`main`, no-worktrees constitution unchanged.

## Core abstraction: three orthogonal axes

The framework's generalizability comes from decoupling three concerns. Each
expands independently; adding a model touches two small things, never the
structure.

| Axis         | Answers                                             | Lives in                                      | Expand by        |
| ------------ | --------------------------------------------------- | --------------------------------------------- | ---------------- |
| **Roles**    | _what behavior_ — designer / implementer / reviewer | `docs/ROLES.md`                               | add a role entry |
| **Adapters** | _how each tool is invoked_                          | `CLAUDE.md` / `GEMINI.md` shims + `AGENTS.md` | add a shim file  |
| **Routing**  | _who plays which role by default + overrides_       | `docs/ROUTING.md`                             | add a row        |

- **Roles** are model-independent written contracts. Tell any agent "you are the
  senior designer" and it loads `ROLES.md#senior-designer` and follows it — even a
  weak model follows the protocol because the contract is explicit (this is exactly
  what the AGENTS.md research shows helps weaker agents most).
- **Adapters** map a role to a tool's native mechanism: Claude → superpowers
  skills; Codex → the same rules read as plain markdown.
- **Routing** records preferences (work-type → preferred model) and the
  per-session override knob.

Adding Gemini = one shim (`GEMINI.md`) + one routing row. Adding a role = one
`ROLES.md` entry. Adding a behavior = edit a role contract.

## Layer 1 — Knowledge (model-neutral source of truth)

- **New `AGENTS.md`** at repo root: the current `CLAUDE.md` router content _minus
  Claude-only bits_ — constitution (non-negotiables), stack, layout, doc-nav table
  (now including ROUTING.md + ROLES.md), operating rules.
- **`CLAUDE.md` → thin shim:** imports `@AGENTS.md`, then Claude-only content —
  superpowers-skill mandate, the caveman tone contract, the Skill-invocation
  policy, and the role→skill auto-mapping (Layer 6).
- **`GEMINI.md` (when added):** same shim pattern.
- **`docs/*.md`:** already model-neutral; a quick **neutrality sweep** removes any
  "Claude"-specific references that should be generic.

## Layer 2 — Process (the portable loop)

`WORKFLOW.md` currently maps each loop stage 1:1 to a Claude-only superpowers
skill. Reframe each stage as **role + artifact**, with a per-tool "how invoked"
column so the loop is portable:

| Stage  | Artifact (the contract) | Claude invokes          | Codex invokes             |
| ------ | ----------------------- | ----------------------- | ------------------------- |
| Spec   | `specs/<f>.md`          | `brainstorming`         | plan mode + AGENTS.md     |
| Plan   | plan file               | `writing-plans`         | native planning           |
| Build  | code                    | `subagent-driven` + TDD | reads plan, TDD per rules |
| Verify | review report           | `/code-review`          | cross-model review        |

The **artifact is the handoff**; only the invocation differs per tool.

## Layer 3 — Routing policy (`docs/ROUTING.md`)

- **Default table:** work-type → preferred planner / implementer + rationale. Seed:
  - architecture / design / spec → **Claude** (Opus planning strength)
  - mechanical impl, large refactor, test-writing → **Codex** (cheap on Plus, fast)
  - UI: spec → Claude (`frontend-design`); impl → either
  - debugging → whoever holds the context
- **Override line:** "maintainer sets per session" — same knob style as the
  WORKFLOW skip-threshold.
- **Default implementer = Codex.** When the maintainer says nothing, the planner
  emits an external handoff targeting Codex.

## Layer 4 — Handoff contract

Defines a "ready-to-implement plan" so any model runs it cold:

- spec path, dependency-ordered task groups, **test-first markers**,
- **the gates named explicitly** (tsc strict, ESLint, Prettier, core-logic tests,
  `/code-review`, manual `verify`) — because Codex won't auto-fire superpowers, the
  plan must _name_ the discipline,
- the Definition of Done.

**Handoff is file + git, not clipboard.** Planner writes + commits the spec/plan;
the maintainer gives the implementer a **one-line pointer** ("implement
`specs/foo-plan.md`, task group 1"); the implementer reads it off disk. The planner
auto-generates a handoff block when planning finishes.

## Layer 5 — Escalation protocol

Sequential + file-based means no live agent-to-agent channel; the **maintainer is
the bus** (a ~3-word relay), and escalation is written.

- **Triggers — implementer MUST stop + escalate, not improvise:** spec ambiguous;
  spec contradicts codebase reality; a gate can't pass; security / data-loss risk;
  scope creep discovered. (Extends the existing "Unsure what a feature should do →
  stop and ask" rule.)
- **Channel — a running `## Handoff log` in the plan file.** The implementer
  appends an entry, commits, stops:

  ```
  ### ESCALATION — blocking
  Finding: spec assumes pets.owner_id; schema has household_id.
  Options: (a) join via household (b) add column. Recommend (a). Awaiting designer.
  ```

  Flow: implementer logs → maintainer tells designer "critical finding in the
  handoff log" → designer resolves in spec/plan, commits → maintainer tells
  implementer "resolved, continue."

- **Severity tiers** (reuses the project's deferred-Minors pattern):
  - **Blocking** → stop, escalate, await decision.
  - **Non-blocking minor** → log it, keep going, batch for later.

Cross-model review (Layer 7) rides the same channel.

## Layer 6 — Automation & roles

**Role modes — three, same machine:**

1. **Explicit** — "you are senior designer/dev" → loads that role contract, no
   inference.
2. **Auto** — maintainer says nothing → infer role, announce, proceed.
3. **Override** — auto guesses, maintainer vetoes in one word.

**Role inference procedure (in `ROLES.md`, executed when no role is assigned),
first signal wins:**

1. **Pointer verb** — "design/spec X" → designer; "implement X" → implementer;
   "review X" → reviewer.
2. **Repo state** — no spec → designer; spec+plan exist, no code → implementer;
   code done, untested → reviewer. (Maps 1:1 to the WORKFLOW situation table.)
3. **Routing default** — Claude → designer, Codex → implementer.

**Guardrail — announce + veto:** before acting on an inferred role, the agent
states the inferred role + reason in one line ("No role given. Spec+plan exist, no
code → adopting implementer (ROLES.md). Override?"). Silence → proceed; one word →
redirect. Mirrors the superpowers "announce: using [skill]" pattern.

**Per-tool automation:**

- **Claude side:** the `CLAUDE.md` shim maps **role → skill chain automatically** —
  "senior designer" auto-invokes `brainstorming` + `writing-plans`; "implementer +
  subagents" auto-invokes `subagent-driven-development`. Role assignment fires the
  right skills with no manual skill call.
- **Codex side:** reads the same `ROLES.md` contract from `AGENTS.md` as plain
  rules — same behavior, no skills.

**Override examples that fall out:**

- _Say nothing_ → planner does spec+plan, emits Codex handoff automatically.
- _"Use subagents"_ → planner branch executes via `subagent-driven-development`
  (Claude-native, in-session) instead of external handoff.

## Layer 7 — Cross-model verification

`WORKFLOW.md` already requires "the author does not grade itself." Upgrade to
**cross-model**: the planner-model reviews the implementer-model's diff (Claude
`/code-review`s Codex's code, or the reverse). Catches model-specific blind spots —
the single biggest quality lever in the design. Findings flow through the Layer 5
handoff log.

## Superpowers integration

Superpowers is Claude-Code-only; Codex/Gemini cannot invoke skills. The bridge:
**planning runs on native superpowers; execution discipline is baked into the
written files so a non-superpowers agent obeys the same gates.**

- **Designer side (Claude):** native `brainstorming` → `writing-plans` produce the
  spec + plan — _that plan is the shared file_. The orchestrator role fits
  `superpowers:executing-plans` ("execute a plan in a separate session with review
  checkpoints") — Codex is that separate session; the escalation is the checkpoint.
- **Implementer side (Codex):** the disciplines superpowers enforces on Claude
  (TDD, verification-before-completion, requesting-code-review) are **mirrored into
  `AGENTS.md` + the plan's per-task checklist** as plain rules. Codex follows the
  written rule though it can't run the skill. The discipline is portable; the
  auto-invocation is Claude-native convenience.
- **Hybrid:** routing can send some task groups to Claude subagents
  (`subagent-driven-development`) and others to Codex — same plan, mixed executors.

## VSCode setup & agent interaction surfaces

**Not** the VS Code Chat (Copilot) window — that is GitHub Copilot's panel, billed
separately, routes through Copilot (not ChatGPT Plus), and won't honor skills /
AGENTS.md as designed. Use each vendor's own agent:

| Agent          | Surface                                   | Reads                          | Auth         |
| -------------- | ----------------------------------------- | ------------------------------ | ------------ |
| Claude         | Claude Code ext (current) or `claude` CLI | CLAUDE.md → AGENTS.md + skills | Claude sub   |
| Codex          | Codex IDE ext or `codex` CLI              | AGENTS.md natively             | ChatGPT Plus |
| Gemini (later) | Gemini Code Assist ext or `gemini` CLI    | GEMINI.md → AGENTS.md          | Google       |

- **Recommended layout:** split-terminal CLIs — `claude` in one VS Code terminal
  tab, `codex` in another. Keyboard-driven, both visible, light; fits sequential
  handoff. Side-by-side extensions are the GUI alternative (inline diffs).
- Because handoff is sequential, only one agent is active at a time — no
  concurrent-panel clutter, no collision.
- **`.vscode/tasks.json`** holds the gate commands (tsc / lint / test) so every
  agent verifies identically.

## Doc / file changes (same-commit discipline applies)

1. **New** `AGENTS.md` (root) — promoted neutral router.
2. `CLAUDE.md` → thin shim (`@AGENTS.md` + Claude-only).
3. `docs/WORKFLOW.md` → add the role/artifact stage mapping, the handoff contract,
   the escalation protocol, cross-model verify, and a ROUTING/ROLES pointer.
4. **New** `docs/ROUTING.md` — defaults + override + default implementer.
5. **New** `docs/ROLES.md` — role contracts + role-inference + announce/veto.
6. **New** `.vscode/tasks.json` — shared gate commands.
7. Doc-nav table (now in AGENTS.md) → add ROUTING.md + ROLES.md rows.
8. Neutrality sweep of `docs/*`.

## Future automation lever (out of scope now)

Codex CLI has a non-interactive `codex exec` mode. A Claude orchestrator could
shell out to it via Bash — dispatch, read output, handle escalations — dropping the
human relay toward zero. Keeps today's sequential design; opens a near-fully-
automated path later. Recorded for expandability, not built in this pass.

## Non-goals

- No programmatic router / MCP orchestrator (over-engineered for a solo repo).
- No Codex cloud / PR-based handoff (chose local CLI).
- No worktrees / constitution amendment (sequential handoff avoids the need).
- No auto-generated instruction files (research shows they hurt).

_Last reviewed: 2026-06-07_
