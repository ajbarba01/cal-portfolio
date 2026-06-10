# Multi-Agent Workflow Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo's instruction layer so multiple coding agents (Claude + Codex today, Gemini later) work the same loop, with model-neutral roles, written routing preferences, and a file-based handoff + escalation protocol.

**Architecture:** Promote a model-neutral `AGENTS.md` to source-of-truth; reduce `CLAUDE.md` to a thin shim that imports it and adds Claude-only auto-mapping. Add `docs/ROLES.md` (role contracts + inference), `docs/ROUTING.md` (model preferences), gate commands in `.vscode/tasks.json`, and extend `docs/WORKFLOW.md` with the portable stage table, handoff contract, and escalation protocol.

**Tech Stack:** Markdown docs + VS Code `tasks.json`. No app code. Verification = repo gates (`npm run typecheck`/`lint`/`test`, all unaffected) + cross-link/grep checks. There are no unit tests for docs; "verify" steps are grep/read/build checks, not vitest.

**Source material:** The current `CLAUDE.md` is the extraction source for Tasks 1–2. Read it first; it is the single file being split into `AGENTS.md` (neutral) + `CLAUDE.md` (shim).

---

## File Structure

| File                 | Responsibility                                                                                              | Action           |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------- |
| `AGENTS.md`          | Model-neutral source of truth: project summary, doc-nav, operating rules, constitution, stack, layout       | Create           |
| `CLAUDE.md`          | Claude-only adapter: imports AGENTS.md, tone contract, superpowers mandate, role→skill mapping              | Rewrite (shrink) |
| `docs/ROLES.md`      | Role contracts (designer/implementer/reviewer), role inference, announce/veto                               | Create           |
| `docs/ROUTING.md`    | Model preferences per work-type, override knob, default implementer                                         | Create           |
| `docs/WORKFLOW.md`   | Add portable stage table, handoff contract, escalation protocol, cross-model verify, ROLES/ROUTING pointers | Modify           |
| `.vscode/tasks.json` | Shared gate commands so every agent verifies identically                                                    | Create           |

Dependency order: AGENTS.md first (others link to it), then CLAUDE.md shim, then ROLES/ROUTING (referenced by AGENTS doc-nav), then WORKFLOW edits, then tasks.json, then a final neutrality sweep + verification.

---

## Task 1: Create model-neutral `AGENTS.md`

**Files:**

- Create: `AGENTS.md`
- Read first: `CLAUDE.md` (extraction source)

This is the current `CLAUDE.md` content with all Claude-only material removed (tone contract, superpowers/Skill-invocation policy) and two new doc-nav rows (ROUTING, ROLES) plus one new operating rule (multi-agent). The constitution, stack, and layout copy over verbatim.

- [ ] **Step 1: Read the extraction source**

Run: read `CLAUDE.md` top to bottom. Note which blocks are Claude-only (the `> Tone contract` blockquote; the `Skill-invocation policy` bullet). Everything else is neutral and moves to `AGENTS.md`.

- [ ] **Step 2: Write `AGENTS.md`**

Create `AGENTS.md` with exactly this content:

```markdown
# Cal Portfolio + Booking

A site at `calbarba.com` — a **portfolio + self-serve booking system** for a dog-walking / house-sitting business. **All project specifics — stack rationale, data model, pages, brand, pricing, scope — live in [docs/DESIGN.md](docs/DESIGN.md).** The other docs are a portable engineering framework and should stay project-agnostic.

> **Multi-agent repo.** This project is worked by more than one coding agent (Claude, Codex, and others later). **This file (`AGENTS.md`) is the shared source of truth.** Tool-specific files import it: Claude reads [CLAUDE.md](CLAUDE.md) (`@AGENTS.md`), Gemini will read `GEMINI.md`. Who plays which role and how each tool is invoked lives in [docs/ROLES.md](docs/ROLES.md) (role contracts + inference) and [docs/ROUTING.md](docs/ROUTING.md) (model preferences).

## Doc navigation (IMPORTANT, ensure that you have read any docs to your context)

| Doc                                        | Authority over                                                           | Read before…                         |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------ |
| [docs/DESIGN.md](docs/DESIGN.md)           | **Project specifics** — data model, routes, pages, brand, pricing, scope | anything project-specific            |
| [docs/ENGINEERING.md](docs/ENGINEERING.md) | Architecture & code-quality principles                                   | writing/refactoring non-trivial code |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md)   | Formatting, naming, documentation                                        | writing any code                     |
| [docs/FRONTEND.md](docs/FRONTEND.md)       | Design system, theming, design→code pipeline                             | building/altering UI                 |
| [docs/WORKFLOW.md](docs/WORKFLOW.md)       | Dev loop, version control, handoff & escalation                          | starting a feature / committing      |
| [docs/ROUTING.md](docs/ROUTING.md)         | Model preferences per work-type; the override knob                       | choosing who plans / implements      |
| [docs/ROLES.md](docs/ROLES.md)             | Role contracts (designer/implementer/reviewer); role inference           | acting as any agent in this repo     |

## Operating rules (always on)

- **Hierarchical context.** This file is a **router**, not a knowledge dump. Given a broad task, open the one doc that owns it (table above) rather than loading everything. Load a doc just-in-time, when the task needs it.
- **Single source of truth.** Each fact lives in exactly one doc. Cross-link; never restate. Project facts → DESIGN.md; everything else → its framework doc.
- **Execution policy.** Each dev-loop stage maps to a **role + artifact** (see [docs/WORKFLOW.md](docs/WORKFLOW.md), "Portable stage map"). Which model plays which role is set in [docs/ROUTING.md](docs/ROUTING.md); how each tool invokes the role is in [docs/ROLES.md](docs/ROLES.md). When no role is assigned, infer one per ROLES.md and announce it before acting.
- **Doc discipline.**
  - _Same-commit rule_ — a code change that adds/moves/deletes files updates the relevant doc in the _same_ commit.
  - _No code-as-doc_ — no function signatures or long path lists in docs (they rot); grep is faster.
  - _Last-reviewed footer_ — every doc carries one. If it's > 60 days old at session start, flag it for re-audit.

## Constitution (non-negotiables)

- **TypeScript `strict`**, no `any` (see CODE_STYLE / ENGINEERING).
- **Core logic is pure and tested** (ENGINEERING #5).
- **Design tokens are law** — components reference semantic tokens, never hardcoded colors (FRONTEND).
- **Accessibility floor** — semantic HTML, contrast, visible focus, keyboard nav (FRONTEND).
- **Single `main` branch**; commit only after verification; stage by name (WORKFLOW).
- **Commit messages: subject line only.** Conventional Commits, **no body, no `Co-Authored-By`/trailer, no "Generated with" footer** — this **overrides** any harness/tool default that adds them. Body only if the maintainer explicitly asks.
- **Quality is independent of scope.** Small project, professional code.

## Stack (one-liner; rationale in DESIGN.md)

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Supabase · Vercel · Stripe · Resend.

## Layout (once scaffolded)

`src/app/` routing only · `src/features/<domain>/` domain logic · `src/lib/` business-agnostic infra · `docs/` the doc system · `specs/` per-feature specs · design tokens in `src/app/globals.css` (color) + `src/lib/design-tokens.ts` (motion/etc). Rules in [docs/ENGINEERING.md](docs/ENGINEERING.md).

---

_Last reviewed: 2026-06-07_
```

- [ ] **Step 3: Verify content + links**

Run: `node -e "const f=require('fs').readFileSync('AGENTS.md','utf8');['docs/ROLES.md','docs/ROUTING.md','docs/WORKFLOW.md','CLAUDE.md'].forEach(p=>console.log(p, f.includes(p)))"`
Expected: every line ends `true`.
Also confirm by reading: no caveman/tone-contract blockquote and no "Skill-invocation policy" text are present in `AGENTS.md` (those are Claude-only, Task 2).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add model-neutral AGENTS.md source of truth"
```

---

## Task 2: Reduce `CLAUDE.md` to a thin Claude adapter

**Files:**

- Modify: `CLAUDE.md` (full rewrite — shrink to shim)

`CLAUDE.md` keeps only what is Claude-Code-specific: the `@AGENTS.md` import, the caveman tone contract (verbatim from the old file), the superpowers mandate note, and a new role→skill auto-mapping table.

- [ ] **Step 1: Overwrite `CLAUDE.md`**

Replace the entire file with exactly this content:

```markdown
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
```

- [ ] **Step 2: Verify the shim**

Run: `node -e "const f=require('fs').readFileSync('CLAUDE.md','utf8');console.log('import',/^@AGENTS\.md$/m.test(f));console.log('short',f.length<2600);console.log('no-constitution',!f.includes('Constitution (non-negotiables)'))"`
Expected: `import true`, `short true`, `no-constitution true` (constitution now lives only in AGENTS.md — single source of truth).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reduce CLAUDE.md to thin adapter over AGENTS.md"
```

---

## Task 3: Create `docs/ROLES.md`

**Files:**

- Create: `docs/ROLES.md`

- [ ] **Step 1: Write `docs/ROLES.md`**

Create the file with exactly this content:

```markdown
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

1. **Pointer verb** — "design/spec X" → `senior-designer`; "implement X" → `implementer`; "review X" → `reviewer`.
2. **Repo state** — no spec → `senior-designer`; spec + plan exist, no code → `implementer`; code done, untested → `reviewer`. (Mirrors the [WORKFLOW.md](WORKFLOW.md) "where am I → what's next" table.)
3. **Routing default** — from [ROUTING.md](ROUTING.md): Claude → `senior-designer`, Codex → `implementer`.

**Announce + veto guardrail:** before acting on an _inferred_ role, state it and why, e.g.:

> No role given. Spec + plan exist, no code → adopting `implementer` (ROLES.md). Override?

Silence → proceed. One word from the maintainer → redirect. (Explicit assignment skips inference entirely.)

## Escalation triggers (implementer)

Stop and escalate (do not improvise) when: the spec is ambiguous; the spec contradicts codebase reality; a gate cannot pass; a security or data-loss risk appears; or scope creep is discovered. Channel + severity tiers: [WORKFLOW.md](WORKFLOW.md), "Escalation protocol".

---

_Last reviewed: 2026-06-07_
```

- [ ] **Step 2: Verify links resolve**

Run: `node -e "const f=require('fs').readFileSync('docs/ROLES.md','utf8');['ROUTING.md','WORKFLOW.md','../AGENTS.md','../CLAUDE.md'].forEach(p=>console.log(p,f.includes(p)))"`
Expected: all `true`.

- [ ] **Step 3: Commit**

```bash
git add docs/ROLES.md
git commit -m "docs: add ROLES.md role contracts and inference"
```

---

## Task 4: Create `docs/ROUTING.md`

**Files:**

- Create: `docs/ROUTING.md`

- [ ] **Step 1: Write `docs/ROUTING.md`**

Create the file with exactly this content:

```markdown
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
```

- [ ] **Step 2: Verify links resolve**

Run: `node -e "const f=require('fs').readFileSync('docs/ROUTING.md','utf8');['ROLES.md','../CLAUDE.md'].forEach(p=>console.log(p,f.includes(p)))"`
Expected: all `true`.

- [ ] **Step 3: Commit**

```bash
git add docs/ROUTING.md
git commit -m "docs: add ROUTING.md model preferences and override knob"
```

---

## Task 5: Extend `docs/WORKFLOW.md`

**Files:**

- Modify: `docs/WORKFLOW.md` (insert three sections + update intro pointer; do not delete existing content)

The existing loop, "where am I → what's next" table, Skill workflow, and Version control sections stay. Add: a portable stage map, the handoff contract, and the escalation protocol, plus a cross-model line in the verify rules.

- [ ] **Step 1: Add a multi-agent pointer to the intro blockquote**

Find this line (near the top, the doc's opening blockquote):

```markdown
> Authority for **the dev loop and version control** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [CLAUDE.md](../CLAUDE.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).
```

Replace it with:

```markdown
> Authority for **the dev loop, version control, and multi-agent handoff** (general, portable). Always-on governance (doc discipline, hierarchical context, last-reviewed) lives in [AGENTS.md](../AGENTS.md). Roles + inference: [ROLES.md](ROLES.md); model preferences: [ROUTING.md](ROUTING.md). For code structure see [ENGINEERING.md](ENGINEERING.md); conventions [CODE_STYLE.md](CODE_STYLE.md); UI [FRONTEND.md](FRONTEND.md).
```

- [ ] **Step 2: Insert the "Portable stage map" section**

Immediately **after** the existing `## Skill workflow (execution policy)` section (after its last bullet, before `## Working within a task`), insert:

````markdown
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
````

- [ ] **Step 3: Add the cross-model note to Definition of Done**

Find the `## Definition of Done` line:

```markdown
Tests green → types/lint/format clean → `/code-review` clean → manual `verify` of the running feature → conventional commit on `main` → Vercel preview confirmed.
```

Replace with:

```markdown
Tests green → types/lint/format clean → **cross-model `/code-review`** clean (a model other than the author grades it, where practical) → manual `verify` of the running feature → conventional commit on `main` → Vercel preview confirmed.
```

- [ ] **Step 4: Bump the last-reviewed footer**

Find `_Last reviewed: 2026-06-05_` and replace with `_Last reviewed: 2026-06-07_`.

- [ ] **Step 5: Verify all inserts present**

Run: `node -e "const f=require('fs').readFileSync('docs/WORKFLOW.md','utf8');['Portable stage map','Handoff contract','Escalation protocol','Cross-model verification','cross-model','2026-06-07'].forEach(s=>console.log(s,f.includes(s)))"`
Expected: all `true`.

- [ ] **Step 6: Commit**

```bash
git add docs/WORKFLOW.md
git commit -m "docs(workflow): add portable stage map, handoff contract, escalation"
```

---

## Task 6: Create `.vscode/tasks.json`

**Files:**

- Create: `.vscode/tasks.json`

Shared gate commands so any agent (or the maintainer) runs identical verification via the VS Code command palette → "Run Task".

- [ ] **Step 1: Write `.vscode/tasks.json`**

Create the file with exactly this content:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "gate: typecheck",
      "type": "shell",
      "command": "npm run typecheck",
      "problemMatcher": []
    },
    {
      "label": "gate: lint",
      "type": "shell",
      "command": "npm run lint",
      "problemMatcher": []
    },
    {
      "label": "gate: test",
      "type": "shell",
      "command": "npm test",
      "problemMatcher": []
    },
    {
      "label": "gate: format check",
      "type": "shell",
      "command": "npm run format:check",
      "problemMatcher": []
    },
    {
      "label": "gate: all",
      "dependsOrder": "sequence",
      "dependsOn": [
        "gate: typecheck",
        "gate: lint",
        "gate: test",
        "gate: format check"
      ],
      "problemMatcher": [],
      "group": { "kind": "build", "isDefault": true }
    }
  ]
}
```

- [ ] **Step 2: Verify it is valid JSON and references real scripts**

Run: `node -e "const t=require('./.vscode/tasks.json');const labels=t.tasks.map(x=>x.label);console.log('valid json, tasks:',labels.join(', '))"`
Expected: prints the five task labels, no parse error.
Run: `node -e "const s=require('./package.json').scripts;['typecheck','lint','test','format:check'].forEach(k=>console.log(k,!!s[k]))"`
Expected: all `true`.

- [ ] **Step 3: Commit**

```bash
git add .vscode/tasks.json
git commit -m "chore(vscode): add shared gate tasks for all agents"
```

---

## Task 7: Neutrality sweep + final verification

**Files:**

- Audit: `docs/DESIGN.md`, `docs/ENGINEERING.md`, `docs/CODE_STYLE.md`, `docs/FRONTEND.md`
- Possibly modify: any of the above that name "Claude" where a neutral term belongs

- [ ] **Step 1: Find Claude-specific references in the framework docs**

Run: `node -e "const fs=require('fs');['DESIGN','ENGINEERING','CODE_STYLE','FRONTEND'].forEach(d=>{const p='docs/'+d+'.md';const lines=fs.readFileSync(p,'utf8').split('\n');lines.forEach((l,i)=>{if(/claude/i.test(l))console.log(p+':'+(i+1)+': '+l.trim())})})"`
Expected: a list (possibly empty) of lines mentioning Claude.

- [ ] **Step 2: Neutralize where appropriate**

For each hit: if it refers to the _agent generically_ (e.g. "Claude should…"), reword to "the agent" / "the implementer". If it refers to a genuinely Claude-only mechanism (a specific skill, the caveman tone), leave it but confirm it belongs — most such rules should already live in `CLAUDE.md`, not a framework doc. If a line is purely Claude-only and out of place, move it to `CLAUDE.md`. Make edits with exact-string replacement; do not mass-rewrite.

(If Step 1 found nothing, this step is a no-op — record that in the commit message body? No — subject only; just skip the commit for this step.)

- [ ] **Step 3: Whole-repo cross-link integrity check**

Run: `node -e "const fs=require('fs');const files=['AGENTS.md','CLAUDE.md','docs/WORKFLOW.md','docs/ROLES.md','docs/ROUTING.md'];let bad=0;files.forEach(f=>{const dir=require('path').dirname(f);const txt=fs.readFileSync(f,'utf8');const re=/\]\((\.{0,2}[^):#]+\.md)/g;let m;while(m=re.exec(txt)){const t=require('path').normalize(require('path').join(dir,m[1]));if(!fs.existsSync(t)){console.log('BROKEN',f,'->',m[1]);bad++}}});console.log(bad?('broken links: '+bad):'all links resolve')"`
Expected: `all links resolve`.

- [ ] **Step 4: Run the repo gates (confirm nothing broke)**

Run: `npm run typecheck`
Expected: exits 0, no output errors.
Run: `npm run format:check`
Expected: passes, or reformat with `npm run format` then re-stage (the pre-commit hook also runs prettier).

- [ ] **Step 5: Commit any neutrality edits**

```bash
git add docs/DESIGN.md docs/ENGINEERING.md docs/CODE_STYLE.md docs/FRONTEND.md
git commit -m "docs: neutralize agent-specific references in framework docs"
```

(Skip this commit if Step 1 found nothing and no files changed.)

---

## Self-Review (completed)

- **Spec coverage:** Layer 1 → Tasks 1–2; Layer 2 → Task 5 stage map; Layer 3 (ROUTING) → Task 4; Layer 4 handoff → Task 5; Layer 5 escalation → Task 5 + ROLES triggers (Task 3); Layer 6 roles/inference/automation → Tasks 2 (Claude mapping) + 3 (ROLES); Layer 7 cross-model verify → Task 5; VSCode surfaces/tasks.json → Task 6; neutrality sweep → Task 7; doc-nav rows → Task 1. The `codex exec` future lever is explicitly out-of-scope in the spec — no task, correct.
- **Placeholder scan:** no TBD/TODO; every file's full content is inline.
- **Type/name consistency:** role names (`senior-designer`, `implementer`, `reviewer`) match across CLAUDE.md, ROLES.md, ROUTING.md; `## Handoff log` heading name identical in spec, ROLES.md, WORKFLOW.md; gate script names match package.json (Task 6 Step 2 verifies).

## Handoff log

_(empty — implementer appends escalations here)_
