# Doc Architecture (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the doc system token-cheap, portable (core vs project split), lifecycle-governed, and make caveman mode reliably enforced — per [roadmap SP1](../specs/2026-06-10-professionalization-roadmap-design.md) and findings D1–D3 in the [audit register](../specs/2026-06-10-audit-findings.md).

**Architecture:** Docs split into **core** (portable framework: WORKFLOW, ROLES, ROUTING, ENGINEERING, CODE_STYLE, FRONTEND) and **project** (DESIGN, CONTENT, AGENTS, CLAUDE). Core docs get full caveman compression; project docs get a fact-preserving terse pass. Lifecycle rules (plan archiving, notes inbox) land in WORKFLOW.md first so later tasks obey them. Caveman enforcement moves from prose to a SessionStart hook.

**Tech Stack:** Markdown, git, Claude Code hooks (`.claude/settings.json`), node one-liners for verification. No app code is touched.

**Gates (every task):** `npm run format:check` (prettier covers md), link-integrity check (script in Task 1), manual diff read. No unit tests — verification steps are explicit greps/commands. **Commit after every task, subject line only, no AI attribution.**

---

## Shared reference

**Compression ruleset (used by Tasks 6–8).** Caveman-full register, applied to prose only:

- Drop articles, filler, hedging, pleasantries. Fragments OK. Short synonyms.
- Tables, code blocks, file paths, URLs, frontmatter, `_Last reviewed:` footers — **unchanged**.
- Every fact, rule, value, and cross-link survives. Compression changes words, never content.
- Per-doc target: ≥35% word-count reduction (`wc -w` before/after). If a doc can't lose 35% without losing facts, stop at what's safe and note it in the commit-adjacent handoff log.
- Keep one-line doc purpose header (`> Authority for …`) on every doc.

Example transformation (from WORKFLOW.md):

- Before: "Consult this doc to decide your next move. Spec-driven and lightweight: the spec is the source artifact, code is generated output. Quality comes from principles + gates, not ceremony."
- After: "Consult to pick next move. Spec = source artifact, code = output. Quality from principles + gates, not ceremony."

**Project-noun list (portability greps, Tasks 4–5):** `Cal`, `calbarba`, `Kiche`, `booking`, `pet`, `Trail`, `Fraunces`, `Public Sans`, `clay`, `sand-`, `Supabase`, `Stripe`, `Resend`, `Vercel`, `meet-greet`, `Denver`, `Boulder`. A core doc may name **roles, artifacts, and process** — never these nouns (stack examples allowed only inside an explicitly marked example block).

---

### Task 1: Lifecycle rules into WORKFLOW.md + link-check script

**Files:**

- Modify: `docs/WORKFLOW.md` (add section before "Working within a task")
- Create: `scripts/check-doc-links.mjs`
- Create: `docs/superpowers/plans/archive/` (via first `git mv` in Task 2 — git tracks no empty dirs)

- [x] **Step 1: Add "Doc lifecycle" section to WORKFLOW.md** (verbatim, before "## Working within a task"):

```markdown
## Doc lifecycle

- **Plans:** a plan whose Definition of Done shipped moves to `docs/superpowers/plans/archive/` (git mv, same commit as the verification or the next docs commit). Active plans only in `plans/` root.
- **Specs:** design specs are decision records — they stay. A superseded spec moves to `docs/superpowers/specs/archive/` with a one-line pointer to its successor.
- **Notes inbox:** `docs/DEV_NOTES.md` is a capture inbox, never an authority. Items must be triaged out (bugs → audit/findings register or a plan; scope → roadmap/spec; Cal questions → DESIGN.md open questions) — triage whenever a planning session touches the area. Untriaged items older than 30 days get flagged at session start like a stale last-reviewed footer.
- **Link integrity:** `node scripts/check-doc-links.mjs` must pass before any docs commit.
```

- [x] **Step 2: Create `scripts/check-doc-links.mjs`:**

```js
// Verifies relative markdown links in tracked .md files resolve to real files.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = execSync("git ls-files *.md **/*.md", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
let bad = 0;
for (const file of files) {
  const text = execSync(`git show :"${file}"`, { encoding: "utf8" });
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = resolve(dirname(file), target.split("#")[0]);
    if (!existsSync(path)) {
      console.error(`${file}: broken link -> ${target}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`OK: ${files.length} files, no broken relative links.`);
```

Note: script reads the **staged/HEAD** version via `git show :file`; stage docs before running.

- [x] **Step 3: Verify**

Run: `git add docs/WORKFLOW.md scripts/check-doc-links.mjs && node scripts/check-doc-links.mjs`
Expected: `OK: … no broken relative links.` (If it reports existing breaks, fix them in this task — that's the point of the gate.)

- [x] **Step 4: Commit**

```bash
git commit -m "docs: add doc lifecycle rules and link-integrity check"
```

### Task 2: Archive completed plans

**Files:**

- Move: completed `docs/superpowers/plans/*.md` → `docs/superpowers/plans/archive/`

- [x] **Step 1: Verify each plan shipped.** For each of the 19 plans in `docs/superpowers/plans/`, confirm its feature exists: `git log --oneline --grep="<feature keyword>"` + spot-check the named routes/files exist. Known-shipped (audit 2026-06-10): mvp, booking-rules-v2, calendar-first-booking, design-overhaul phase0/1/2/shell/phase3, booking-redesign-and-account, admin-capabilities, multi-agent-workflow, services-booking-merge, meet-greet-onboarding, booking-mutation-spine, copy-sync-protocol, inquiries-tab, onboarding-admin-batch, admin-create-edit-bookings, client-self-service-edit (route `/account/bookings/[id]/edit` builds). A plan with an unresolved `## Handoff log` escalation or unshipped DoD **stays**.

- [x] **Step 2: Move the verified ones**

```bash
mkdir -p docs/superpowers/plans/archive
git mv docs/superpowers/plans/<each-verified-plan>.md docs/superpowers/plans/archive/
```

- [x] **Step 3: Verify**

Run: `git add -u && node scripts/check-doc-links.mjs && ls docs/superpowers/plans/*.md`
Expected: link check OK; root holds only unshipped plans (likely none or 1–2).

- [x] **Step 4: Commit**

```bash
git commit -m "docs: archive completed implementation plans"
```

### Task 3: Retire DEV_NOTES.md to inbox form

**Files:**

- Modify: `docs/DEV_NOTES.md` (full rewrite)

- [x] **Step 1: Confirm absorption.** Every current DEV_NOTES item must appear in the [findings register](../specs/2026-06-10-audit-findings.md) (findings, triage decisions, or Cal/ops list) or the roadmap. Diff the lists; anything missed gets added to the register **first** (separate commit to the register).

- [x] **Step 2: Replace DEV_NOTES.md content entirely with:**

```markdown
# Dev notes — capture inbox

> Inbox only, never authority (lifecycle rule: [WORKFLOW.md](WORKFLOW.md) "Doc lifecycle"). Add raw observations here; triage them out to the [audit findings register](superpowers/specs/2026-06-10-audit-findings.md) (bugs/UX), the [roadmap](superpowers/specs/2026-06-10-professionalization-roadmap-design.md) (scope), or DESIGN.md open questions (Cal decisions). Snapshot of 2026-06-10 fully triaged into the register.

## Inbox

_(empty)_

---

_Last reviewed: 2026-06-10_
```

- [x] **Step 3: Verify**

Run: `git add docs/DEV_NOTES.md && node scripts/check-doc-links.mjs && wc -w docs/DEV_NOTES.md`
Expected: link check OK; ~80 words (was 637).

- [x] **Step 4: Commit**

```bash
git commit -m "docs: retire dev notes into triaged capture inbox"
```

### Task 4: Remove OTHER.md, fold FRONTEND project specifics into DESIGN.md

**Files:**

- Delete: `OTHER.md`
- Modify: `docs/FRONTEND.md`, `docs/DESIGN.md`

- [x] **Step 1: Confirm OTHER.md deletion with the maintainer** (it is another project's instruction file used as a style reference; the original lives in that project). One-line ask; on yes: `git rm OTHER.md`. On no: move it to `docs/superpowers/specs/reference-other-project-style.md` instead.

- [x] **Step 2: Portability pass on FRONTEND.md.** Grep FRONTEND.md for the project-noun list (Shared reference). Move every project-specific fact (Trail palette story, Fraunces/Public Sans, sheet/desk specifics, photo/asset paths) into DESIGN.md "Brand / visual direction" — merging, not duplicating (single-source rule). FRONTEND.md keeps the portable system: token discipline, theming mechanics, a11y floor, design→code pipeline, with `<project>` placeholders where a concrete value was removed.

- [x] **Step 3: Verify**

Run: `git add docs/FRONTEND.md docs/DESIGN.md && node scripts/check-doc-links.mjs && grep -inE "trail|fraunces|public sans|clay|sand-" docs/FRONTEND.md`
Expected: link check OK; grep returns **no hits** outside explicitly marked example blocks.

- [x] **Step 4: Commit**

```bash
git commit -m "docs: make frontend doc project-agnostic and remove stale reference file"
```

### Task 5: Portability sweep of remaining core docs

**Files:**

- Modify: `docs/WORKFLOW.md`, `docs/ROLES.md`, `docs/ROUTING.md`, `docs/ENGINEERING.md`, `docs/CODE_STYLE.md` (as needed)

- [x] **Step 1: Grep each core doc for the project-noun list.** For each hit: move the fact to DESIGN.md (if a project fact) or rewrite the example generically (if illustration). Known leak class: ENGINEERING.md examples referencing booking/pricing — rewrite as `orders/quotes`-style neutral examples or mark `(example from this repo)` if genuinely clearer.

- [x] **Step 2: Add a one-line portability marker** under each core doc's title: `> CORE doc — project-agnostic; project facts live in docs/DESIGN.md.`

- [x] **Step 3: Verify**

Run: `git add docs && node scripts/check-doc-links.mjs && for f in docs/WORKFLOW.md docs/ROLES.md docs/ROUTING.md docs/ENGINEERING.md docs/CODE_STYLE.md; do echo "== $f"; grep -icE "cal[^l]|kiche|stripe|supabase|meet-greet" $f; done`
Expected: link check OK; counts 0 (or hits only inside marked example blocks).

- [x] **Step 4: Commit**

```bash
git commit -m "docs: make framework docs project-agnostic"
```

### Task 6: Caveman-compress core docs

**Files:**

- Modify: `docs/WORKFLOW.md`, `docs/ROLES.md`, `docs/ROUTING.md`, `docs/ENGINEERING.md`, `docs/CODE_STYLE.md`, `docs/FRONTEND.md`

- [x] **Step 1: Record baselines:** `wc -w docs/WORKFLOW.md docs/ROLES.md docs/ROUTING.md docs/ENGINEERING.md docs/CODE_STYLE.md docs/FRONTEND.md`

- [x] **Step 2: Compress one doc at a time** using the Shared-reference ruleset. After each doc: re-read the diff hunk-by-hunk asking "did a rule, value, or link disappear?" — restore anything lost. Bump its `_Last reviewed:` to today.

- [x] **Step 3: Verify per doc, commit per doc**

Run: `git add docs/<DOC>.md && node scripts/check-doc-links.mjs && wc -w docs/<DOC>.md`
Expected: link check OK; ≥35% word reduction vs baseline (or noted shortfall).

```bash
git commit -m "docs: compress <doc> to terse register"
```

(One commit per doc — six commits. Suggested subjects: `docs: compress workflow doc to terse register`, etc.)

### Task 7: Compress AGENTS.md + CLAUDE.md, add caveman enforcement hook

**Files:**

- Modify: `AGENTS.md`, `CLAUDE.md`
- Create: `.claude/settings.json`, `.claude/caveman.md`

- [x] **Step 1: Create `.claude/caveman.md`:**

```markdown
Communication mode: caveman-full (repo rule, AGENTS.md). Terse like smart caveman: drop articles/filler/hedging/pleasantries; fragments OK; short synonyms; technical terms exact; code blocks + quoted errors unchanged. Drop to normal prose for: security warnings, destructive-action confirmations, sequences where compression risks misread. Code, commits, PRs, docs-being-written: normal register. Active every response; no drift.
```

- [x] **Step 2: Create `.claude/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -p \"require('fs').readFileSync('.claude/caveman.md','utf8')\""
          }
        ]
      }
    ]
  }
}
```

- [x] **Step 3: Update CLAUDE.md:** remove the "If `/caveman` is available, invoke `/caveman full`…" line (hook supersedes it); note instead: "Caveman mode auto-injected via `.claude/settings.json` SessionStart hook." Compress the remainder per ruleset.

- [x] **Step 4: Compress AGENTS.md** per ruleset. The doc-nav table, constitution bullets, and layout line keep all content; prose around them tersens. AGENTS.md communication-mode rule stays (it is the model-neutral source; the hook is Claude's enforcement of it).

- [x] **Step 5: Verify**

Run: `git add AGENTS.md CLAUDE.md .claude/settings.json .claude/caveman.md && node scripts/check-doc-links.mjs && node -p "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')) && 'json ok'"`
Expected: link check OK; `json ok`. Then start a **fresh Claude session** in the repo and confirm the first response is caveman without being asked — that is the acceptance test for the hook.

- [x] **Step 6: Commit**

```bash
git commit -m "docs: compress agent adapters and enforce caveman via session hook"
```

### Task 8: Fact-preserving terse pass on DESIGN.md + CONTENT.md

**Files:**

- Modify: `docs/DESIGN.md`, `docs/CONTENT.md`

- [x] **Step 1: DESIGN.md pass — stricter rules than core docs.** Tables, column lists, enum values, seed rates, state machine, RLS rules: **untouched**. Only connective prose compresses. Target ~20% word reduction (5,462 → ~4,400), not 35%. After the pass, run this fact checklist against the diff: every settings column still named; every pricing seed value present; state-machine transitions identical; all 13 table definitions intact; open-questions list intact.

- [x] **Step 2: CONTENT.md pass** — standard ruleset, but the marker grammar (`[[HEADER: …]]` forms) and all rules examples stay verbatim.

- [x] **Step 3: Verify**

Run: `git add docs/DESIGN.md docs/CONTENT.md && node scripts/check-doc-links.mjs && wc -w docs/DESIGN.md docs/CONTENT.md`
Expected: link check OK; DESIGN ~4,400 words, CONTENT ≤ ~600.

- [x] **Step 4: Commit**

```bash
git commit -m "docs: tighten design and content docs without fact loss"
```

### Task 9: Close out SP1

**Files:**

- Modify: `docs/superpowers/specs/2026-06-10-audit-findings.md`, `docs/superpowers/specs/2026-06-10-professionalization-roadmap-design.md`

- [x] **Step 1: Prune findings D1–D3** from the register (lifecycle rule: resolved findings are removed, with a one-line "resolved by SP1, <date>" under a small Resolved heading).

- [x] **Step 2: Roadmap + handoff:** mark SP1 done with date in the roadmap (next SP = SP2 seeding); in `docs/superpowers/HANDOFF.md` set SP1 status `done`, SP2 `current`, append a Session log line, and delete any "Context not documented elsewhere" bullets SP1 made obsolete (word baselines, `.claude` greenfield note, OTHER.md decision once made).

- [x] **Step 3: Final gates**

Run: `npm run format:check && node scripts/check-doc-links.mjs && wc -w AGENTS.md CLAUDE.md docs/*.md`
Expected: clean; total well under 14,053-word baseline (target ≤ ~9,500).

- [x] **Step 4: Request cross review.** Run `/code-review` on the cumulative SP1 diff (docs-only review: fact loss, broken cross-references, portability leaks). Resolve criticals via the Handoff log below.

- [x] **Step 5: Commit**

```bash
git commit -m "docs: close out doc architecture pass"
```

---

## Definition of Done

- Lifecycle rules live in WORKFLOW.md; completed plans archived; DEV_NOTES is an empty triaged inbox; OTHER.md gone (or relocated by maintainer choice).
- Core docs (WORKFLOW, ROLES, ROUTING, ENGINEERING, CODE_STYLE, FRONTEND) carry the CORE marker and pass the project-noun grep.
- Total doc word count ≤ ~9,500 (from 14,053) with zero fact loss (diff-reviewed per doc).
- Fresh session speaks caveman via SessionStart hook without prompting.
- `node scripts/check-doc-links.mjs` + `npm run format:check` green; `/code-review` clean; findings D1–D3 pruned; roadmap updated.

## Handoff log

### Non-blocking notes — SP1 execution (2026-06-10)

- Task 4 maintainer decision: OTHER.md relocated to `docs/reference/OTHER.md` (not deleted); link-check skip updated to the new path.
- Tasks 6–8 compression targets unmet: core docs −2–8% (vs ≥35%), DESIGN 5,574 (vs ~4,400), CONTENT 868 (vs ~600). Two independent passes concluded remaining mass is protected fact-content (tables, identifiers, values); zero fact loss verified by independent diff review per doc. Total docs ≈ 13,333 words vs ≤~9,500 target.
- Prettier pre-commit hook mangled one ARCHIVED plan during git mv (copy-sync plan: setext-heading normalization inside an unbalanced-fence region, 2 example lines collapsed). Accepted per maintainer's standing "accept hook reformatting" rule; content recoverable from git history.
- check-doc-links.mjs gained pragmatic skips beyond spec (fenced blocks, `<`-paths, bare `href`, OTHER.md, archived plans) — each reviewed and accepted.
