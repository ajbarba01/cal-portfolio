# Copy-Sync Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the copy-sync protocol — a model-neutral rules doc, a thin Claude skill, and the source/ledger tracking files — so Cal's verbatim marketing text can be transplanted into the site and kept in sync.

**Architecture:** The protocol rules live in `docs/CONTENT.md` (model-neutral, multi-agent SoT). A thin `.claude/skills/copy-sync` shim points Claude to it. Cal's verbatim text is captured in `docs/content/cal-source.md` (authority); a per-ID ledger `docs/content/copy-ledger.md` tracks status/provenance/transforms and drives diffing. The live copy registry (`src/content/marketing.ts`) is created by a **separate** extraction effort — this plan does not build it; the protocol degrades gracefully when an ID is not yet in the registry.

**Tech Stack:** Markdown docs, Claude Code skill (Markdown + frontmatter), ripgrep for verification.

**Reference spec:** `docs/superpowers/specs/2026-06-09-copy-sync-protocol-design.md`

---

## File Structure

- Create: `docs/content/cal-source.md` — Cal's verbatim text by ID (authority).
- Create: `docs/content/copy-ledger.md` — per-ID tracking (status, provenance, applied-from, live-text, transforms, notes).
- Create: `docs/CONTENT.md` — the operational protocol (steps + rules), model-neutral.
- Create: `.claude/skills/copy-sync/SKILL.md` — thin Claude shim → `docs/CONTENT.md`.
- Modify: `docs/DESIGN.md` — cross-link the new protocol from the "Copy placeholders" section.
- Modify: `AGENTS.md` — add `docs/CONTENT.md` to the doc-navigation table.

Each artifact has one responsibility; the rules live in exactly one place (`docs/CONTENT.md`), everything else links to it.

---

### Task 1: Tracking-file scaffolds (source + ledger)

**Files:**

- Create: `docs/content/cal-source.md`
- Create: `docs/content/copy-ledger.md`

- [ ] **Step 1: Create `docs/content/cal-source.md`**

```markdown
# Cal Source Copy

> **Authority for all marketing copy.** Cal's words, verbatim. Captured here _before_ any edit. The website (`src/content/marketing.ts`) is a render target downstream of this file. See `docs/CONTENT.md` for how text flows from here to the site.

## Rules

- One `###` block per stable copy ID (`<page>.<section>[.<index>].<slot>` — see `docs/CONTENT.md`).
- Text is **verbatim** — Cal's exact words, including any inline action notes (e.g. `(<-- hyperlink)`). Do not clean it up here; adaptations are recorded in the ledger, not applied to this file.
- Add an entry only after its ID mapping is confirmed (copy-sync Step 2).

## Entries

### example.id.slot

> Replace this example once real copy arrives.
```

Verbatim text exactly as Cal supplied it, including (<-- hyperlink) notes.

```

```

- [ ] **Step 2: Create `docs/content/copy-ledger.md`**

```markdown
# Copy Ledger

> Per-ID tracking that bridges `docs/content/cal-source.md` (authority) and `src/content/marketing.ts` (render target). Drives the copy-sync diff. See `docs/CONTENT.md` for the protocol.

## How to read an entry

- `status`: `placeholder` | `placed` | `changed` | `drift` | `flagged`
- `provenance`: `cal-verbatim` | `cal-confirmed-edit` | `agent-resolved` | `public-fact` | `placeholder`
- `applied-from`: the exact `cal-source` text that produced the current live string (diff anchor).
- `live-text`: the string currently in `marketing.ts`. Differs from `applied-from` only by the listed `transforms`.
- `transforms`: confirmed adaptations (capitalization/punctuation, resolved action items, Cal-approved grammar).

## Entries

### example.id.slot

- status: placeholder
- provenance: placeholder
- consumed-by: -
- ## applied-from: |
- ## live-text: |
- transforms: none
- notes: example entry; remove when real entries exist
```

- [ ] **Step 3: Verify the files exist and render**

Run: `rg -n "## Entries" docs/content/cal-source.md docs/content/copy-ledger.md`
Expected: one match in each file.

- [ ] **Step 4: Commit**

```bash
git add docs/content/cal-source.md docs/content/copy-ledger.md
git commit -m "docs: scaffold copy source and ledger"
```

---

### Task 2: Protocol rules doc (`docs/CONTENT.md`)

**Files:**

- Create: `docs/CONTENT.md`

- [ ] **Step 1: Create `docs/CONTENT.md`**

```markdown
# Content Protocol (copy-sync)

> Model-neutral rules for transplanting Cal's marketing copy into the site and keeping it in sync. Any agent (Claude/Codex/Gemini) follows this doc. Claude reaches it via the `copy-sync` skill. Marker grammar for `[[ ]]` placeholders lives in `docs/DESIGN.md` ("Copy placeholders") and is not restated here.

## Artifacts

| File                          | Role                                                 | Authority                        |
| ----------------------------- | ---------------------------------------------------- | -------------------------------- |
| `docs/content/cal-source.md`  | Cal's verbatim text, by ID.                          | **Source of truth**              |
| `src/content/marketing.ts`    | Typed registry: ID → live string. Components import. | Render target (built separately) |
| `docs/content/copy-ledger.md` | Per-ID status/provenance/diff state.                 | Bridge                           |
| `docs/CONTENT.md`             | This protocol.                                       | Process SoT                      |

## Stable IDs

`<page>.<section>[.<index>].<slot>`. The same token is the heading in `cal-source.md`, the heading in `copy-ledger.md`, and the key in `marketing.ts`. The ID is the link — trace any string by grepping its ID. IDs are stable; never renumber a slot that already has a ledger entry.

## Authority rule

`cal-source.md` wins. The website is downstream. **But** user-confirmed transforms persist: a re-run must not undo a confirmed adaptation unless Cal's raw text itself changed. The diff that decides "changed" is `cal-source` text vs the ledger's `applied-from` — not the live string.

## Provenance taxonomy

- `cal-verbatim` — Cal's exact words; only capitalization/punctuation adapted to the slot.
- `cal-confirmed-edit` — Cal's words plus a grammar/wording change the user approved.
- `agent-resolved` — an action item the agent filled per Cal's directive (e.g. a resolved hyperlink target).
- `public-fact` — real external info (e.g. ASPCA poison line); verifiable, not a claim about Cal.
- `placeholder` — untouched stub.

## The protocol (run these in order)

1. **Intake** — take Cal's text dump raw. Make no edits yet.
2. **Map** — infer the target ID for each chunk (handles loose `Header:` / `Trust point N:` labels). Present a mapping table and get the user's confirmation. Anything ambiguous → flag and ask before proceeding.
3. **Capture** — write the confirmed chunks verbatim into `cal-source.md` under their IDs. Authority is now locked.
4. **Diff** — per touched ID, compare `cal-source` text vs ledger `applied-from`: new / changed / unchanged. Also run drift detection: if the live registry string ≠ ledger `live-text`, the code was hand-edited — flag it, do not silently overwrite.
5. **Transform + confirm gate** — auto-allowed without asking: capitalization and punctuation to fit the slot. Everything else STOPS:
   - action item (e.g. `(<-- hyperlink)`) → resolve the target, then confirm the target with the user;
   - any grammar or wording concern → ask and confirm before changing;
   - unsure whether text is literal copy or a directive → ask.
     Record every confirmed change as a `transform` in the ledger.
6. **Apply** — write the final string into `marketing.ts` for the ID. If the ID is not in the registry yet (extraction pending), leave the ledger entry `status: placeholder`, record the captured source, and report it — do not fail.
7. **Verify + report** — typecheck/build, run `rg "\[\["` for remaining stubs, and report per ID: placed / still-placeholder / flagged / drift.

## Guardrails (defined in `docs/DESIGN.md`, enforced here)

- Colorado only; no towns/cities/neighborhoods. Region terms like "Front Range" are flagged for confirmation.
- Never invent services, claims, philosophy, or biographical detail — Cal supplies all substance.
- Public emergency resources (ASPCA, 24/7 vet ER) are allowed as real `public-fact` entries.

## Edge cases

- **Missing registry ID:** record in source + ledger as pending, report; never fail the run.
- **Split-JSX prose** (text wrapping a link, e.g. about-page references): decompose into sub-IDs (`.pre` / `.link` / `.post`) or a single templated entry; keep it consistent across runs.

## Invocation (Claude)

- `/copy-sync` + pasted dump → full run.
- Plain ask ("sync this copy from Cal: …") → auto-triggers.
- `/copy-sync status` → read-only report of every ID; no writes.

---

_Last reviewed: 2026-06-09_
```

- [ ] **Step 2: Verify the seven steps are present and ordered**

Run: `rg -n "^[0-9]\. \*\*" docs/CONTENT.md`
Expected: seven numbered steps, Intake … Verify + report.

- [ ] **Step 3: Commit**

```bash
git add docs/CONTENT.md
git commit -m "docs: add copy-sync content protocol"
```

---

### Task 3: Claude skill shim

**Files:**

- Create: `.claude/skills/copy-sync/SKILL.md`

- [ ] **Step 1: Create `.claude/skills/copy-sync/SKILL.md`**

```markdown
---
name: copy-sync
description: Use when transplanting Cal's marketing copy into the site or syncing revisions — placing text into src/content/marketing.ts from a dump, updating already-placed copy, or reporting copy status. Triggers on "/copy-sync", "sync this copy from Cal", pasted Cal text, or "copy status".
---

# copy-sync

Follow the protocol in `docs/CONTENT.md` exactly. It is the model-neutral source of truth; this skill only routes you there.

## Checklist (from docs/CONTENT.md — create a TodoWrite item per step)

1. Intake — take the dump raw, no edits.
2. Map — infer IDs, present mapping table, get confirmation; flag anything ambiguous.
3. Capture — write confirmed chunks verbatim into `docs/content/cal-source.md`.
4. Diff — `cal-source` vs ledger `applied-from` (new/changed/unchanged) + drift detection.
5. Transform + confirm gate — auto-adapt only capitalization/punctuation; STOP and confirm for action items, grammar/wording, or directive-vs-copy ambiguity.
6. Apply — write the final string to `src/content/marketing.ts`; if the ID is not in the registry yet, keep the ledger entry pending and report (do not fail).
7. Verify + report — typecheck, `rg "\[\["`, report placed / placeholder / flagged / drift.

## Hard rules

- Words are Cal's, verbatim. Only capitalization and punctuation may change without asking.
- `docs/content/cal-source.md` is authority; user-confirmed transforms persist across runs.
- Record provenance for every ID (`cal-verbatim` / `cal-confirmed-edit` / `agent-resolved` / `public-fact`).
- Honor the copy guardrails in `docs/DESIGN.md` (Colorado-only, no invented claims; flag region terms like "Front Range").

`/copy-sync status` → read-only: report every ledger ID's status, write nothing.
```

- [ ] **Step 2: Verify frontmatter and reference are intact**

Run: `rg -n "name: copy-sync|docs/CONTENT.md" .claude/skills/copy-sync/SKILL.md`
Expected: the `name:` line and at least one `docs/CONTENT.md` reference.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/copy-sync/SKILL.md
git commit -m "feat: add copy-sync skill shim"
```

---

### Task 4: Cross-link from existing docs

**Files:**

- Modify: `docs/DESIGN.md` (the "Copy placeholders" section)
- Modify: `AGENTS.md` (doc-navigation table)

- [ ] **Step 1: Add a protocol pointer to the DESIGN.md "Copy placeholders" section**

Find the `## Copy placeholders` heading in `docs/DESIGN.md`. Immediately under it (before the `- **Marker:**` bullet), add:

```markdown
> Filling these in is governed by the **copy-sync protocol** ([docs/CONTENT.md](../CONTENT.md)): Cal's verbatim text is captured in `docs/content/cal-source.md`, tracked in `docs/content/copy-ledger.md`, and rendered from `src/content/marketing.ts`. This section remains the marker-grammar reference.
```

- [ ] **Step 2: Add CONTENT.md to the AGENTS.md doc-navigation table**

In `AGENTS.md`, in the "Doc navigation" table, add a row after the `docs/WORKFLOW.md` row:

```markdown
| [docs/CONTENT.md](docs/CONTENT.md) | Copy-sync protocol — transplanting Cal's marketing text | placing/updating site copy |
```

- [ ] **Step 3: Verify both cross-links resolve**

Run: `rg -n "CONTENT.md" docs/DESIGN.md AGENTS.md`
Expected: at least one match in each file.

- [ ] **Step 4: Commit**

```bash
git add docs/DESIGN.md AGENTS.md
git commit -m "docs: cross-link copy-sync protocol"
```

---

### Task 5: End-to-end dry run (verification only, no writes)

**Files:** none (read-only validation that the protocol is coherent against the real codebase).

- [ ] **Step 1: Confirm the placeholder inventory the protocol must eventually cover**

Run: `rg -n "\[\[" src/app src/components src/features/booking/service-card-display.ts`
Expected: the marketing-page placeholders + the five `service.*.card.body` strings. This is the ID inventory `cal-source`/ledger will grow into.

- [ ] **Step 2: Walk the protocol against the sample dump (no file writes)**

Using this real sample Cal text:

```
Header: Reliable dog walking and pet care on the Front Range
Body: Highly individualized drop-in visits, walks, house sitting, and training from a local animal-lover
Trust point 1: Safety first
Through my experiences as an EMT, Wilderness First Responder (WFR), and veterinary shadow... resources (<-- hyperlink) available on this site.
```

Confirm the protocol produces:

- map: `home.hero.hook`, `home.hero.body`, `home.trust.1.title`, `home.trust.1.body`;
- a flag on "Front Range" (region-term guardrail);
- an action-item resolution + confirm for `(<-- hyperlink)` → `/resources`;
- provenance `cal-verbatim` (hook/body/title) and `agent-resolved` transform on the trust-point body.

If any of these is not derivable from `docs/CONTENT.md` as written, fix the doc, then re-commit Task 2.

- [ ] **Step 3: Final report**

State: all five artifacts exist, cross-links resolve, and the protocol covers the sample dump. No commit (verification task).

---

## Self-Review

- **Spec coverage:** req 1 (place new + track) → Tasks 1–3 + protocol steps 2/3/6; req 2 (diff revisions) → protocol step 4 + ledger `applied-from`; req 3 (verbatim + confirm gates) → protocol step 5 + skill hard rules; req 4 (clear links) → stable-ID scheme (Task 2) + cross-links (Task 4). Multi-agent delivery → `docs/CONTENT.md` + shim (Tasks 2–3). Guardrails → Task 2 + Task 5 dry run.
- **Placeholders:** none — every file's full content is inline.
- **Type/name consistency:** status values (`placeholder`/`placed`/`changed`/`drift`/`flagged`) and provenance values are identical across source scaffold, ledger scaffold, CONTENT.md, and the skill.
- **Out of scope (intentional):** `src/content/marketing.ts` extraction is a separate effort; protocol step 6 + edge case handle its absence.

---

_Last reviewed: 2026-06-09_
