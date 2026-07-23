# Writing-in-Voice Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the portable `writing-in-voice` skill, derive Cal's voice file from his own words, and calibrate the skill against real site strings until it passes a blind round.

**Architecture:** Three separated layers. Craft rules (AI-tell catalog, prose heuristics, rewrite procedure) live in a self-contained skill outside this repo. The voice (trait profile + verbatim exemplars) lives in this repo at `docs/content/voice/`. Project rules (POV, guardrails) already live in `docs/CONTENT.md` and `docs/DESIGN.md`; the skill reads them by pointer and restates neither. Spec: `docs/superpowers/specs/2026-07-22-writing-voice-design.md`.

**Tech Stack:** Markdown only — no application code. The skill is a Claude Code skill directory (`SKILL.md` + `references/`). Calibration runs through dispatched subagents that read the skill from an absolute path.

## Global Constraints

- **The skill contains zero project-specific content.** No mention of Cal, pet care, bookings, this repo, or its stack. Verifiable: `grep -ri "cal\b\|portfolio\|pet\|booking\|dog" ~/.claude/skills/writing-in-voice/` returns nothing.
- **The skill contains zero agent-specific content.** No mention of Claude, Anthropic, or any single agent's tool names, file conventions, or invocation syntax. The body is instructions to a reader, not to one product. `~/.claude/skills/` is where the files sit today, not what they are; the content must lift into an agent-agnostic home unchanged. Verifiable: `grep -ri "claude\|anthropic\|cursor\|codex\|copilot" ~/.claude/skills/writing-in-voice/` returns nothing outside the front-matter block.
- **Not version-controlled during this plan.** These files live outside cal-portfolio and get no git history in this pass. Per-task review therefore reads the files directly rather than a diff.
- **The skill never restates project rules.** POV, Colorado-only, never-invent-substance live in `docs/CONTENT.md` and `docs/DESIGN.md`. The skill's rewrite operation reads whatever rules doc the caller names.
- **Voice-file traits must be falsifiable** — checkable against a piece of output by a reader who has the corpus. "Warm and approachable" fails; "addresses the reader as _you_ in 9 of 11 openings" passes.
- **Voice-file exemplars are verbatim.** Every exemplar must appear character-for-character in a named reference file.
- **`## Overrides` in a voice file is never machine-written or machine-edited.** Only `derive` and `update` touch generated sections, and they leave `## Overrides` byte-identical.
- **POV is a parameter, not a second voice file.** One voice file per personality; first/third person is applied at rewrite time from the project's rules doc.
- **`src/content/marketing.ts` is out of bounds** for every task in this plan. Cal owns it under `docs/CONTENT.md`'s authority rule.
- **Calibration subagents run cold on the same model every round.** Changing models mid-calibration measures the model, not the skill. Record the model in the fixtures file.
- Commit messages: subject line only, Conventional Commits, no body, no trailers, no internal identifiers.
- Work on `main`; stage files by name; commit only after verification.
- Same-commit doc rule: a repo file that adds a new artifact updates the doc that owns it in the same commit.
- The pre-commit hook runs prettier on markdown and will reformat tables and code fences. Accept the reformatting and re-stage if the hook modifies a file.

---

## File structure

Outside the repo (the portable skill — **not** committed to cal-portfolio):

- `~/.claude/skills/writing-in-voice/SKILL.md` — entry point: when to invoke, the four operations, pointers to the voice file and the project rules doc.
- `~/.claude/skills/writing-in-voice/references/ai-tells.md` — the tell catalog. One entry per pattern, each with a real before/after.
- `~/.claude/skills/writing-in-voice/references/craft.md` — prose heuristics: rhythm, specificity, cutting, tense and POV discipline.
- `~/.claude/skills/writing-in-voice/references/voice-format.md` — voice-file schema plus the derive and update protocols.

Absolute path on this machine: `C:/Users/Zander/.claude/skills/writing-in-voice/`.

In the repo (committed):

- `docs/content/voice/cal.md` — Cal's voice file, derived from `docs/content/cal-source.md`.
- `docs/content/voice/fixtures.md` — approved before/after pairs from calibration, each with a one-line rationale.
- `docs/content/voice/held-back.md` — the 5 blind-round strings. Written once, not opened by the maintainer until the blind round.
- `docs/CONTENT.md` — gains a section pointing at the voice file and the skill.

---

### Task 1: Skill scaffold, version control, and the AI-tell catalog

**Files:**

- Create: `~/.claude/skills/writing-in-voice/references/ai-tells.md`

**Interfaces:**

- Produces: `references/ai-tells.md` — a catalog consumed by `SKILL.md` (Task 4) during the rewrite and audit operations. Each entry has a stable `### <Tell name>` heading that later tasks and calibration rounds cite by name when folding feedback back in.

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/writing-in-voice/references
```

This location is where the files sit for now, not a claim about what they are. Nothing written in this plan may depend on that path or on any single agent's conventions — see the agent-neutrality constraint above. Moving the directory into an agent-agnostic home later is a copy, and a decision for another day.

These files are outside cal-portfolio and therefore outside its git history. They are not version-controlled during this plan; calibration edits are not recoverable, so do not delete a rule to "try something" without pasting it somewhere first.

- [ ] **Step 2: Read the prior art**

Read these five sources and extract every named writing pattern they flag. Do not summarize them into the catalog yet — collect the raw list first.

1. `https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing` — the taxonomy backbone.
2. `https://github.com/realrossmanngroup/no_ai_slop_writing_rules` — banned-word and phrase lists.
3. `https://github.com/jalaalrd/anti-ai-slop-writing`
4. `https://gabrielcassady.com/tools/stop-slop-claude-skill-to-remove-ai-writing-tells/`
5. `https://claudemarketplaces.com/skills/galaxy-dawn/claude-scholar/writing-anti-ai`

Note as you read: the Wikipedia guide states its list is descriptive, not proof of AI authorship. The catalog inherits that framing — these are tells to avoid in our own writing, not a detector.

- [ ] **Step 3: Write the catalog**

Create `~/.claude/skills/writing-in-voice/references/ai-tells.md`. Structure — one section per tell, in this exact shape:

```markdown
# AI tells

Patterns that mark text as machine-written. Descriptive, not a detector:
humans write this way too, and the presence of one tell proves nothing. Use
this as a list of habits to avoid in your own output, and as the checklist for
the `audit` operation.

## How to use this file

Rewriting: after drafting, scan your own output against every tell below and
fix what you find before returning it.
Auditing: report the tell name, the offending span, and why it reads as
machine-written. Change nothing.

---

### Inflated significance

**What it is:** Treating an ordinary fact as meaningful. Everything "plays a
vital role", "serves as a testament", or "leaves a lasting impact".

**Why it reads as machine-written:** The model has no stake in the subject, so
it signals importance with adjectives instead of with specifics.

**Before:** Our scheduling system plays a vital role in ensuring a seamless
experience for every client.
**After:** Pick a time. You'll get an email when it's confirmed.
```

Cover at minimum these tells, one section each, each with its own real before/after — do not reuse one example across sections:

1. Inflated significance
2. Promotional framing (analytic phrases tacked onto plain facts)
3. Negative parallelism ("It's not X, it's Y")
4. Rule of threes ("innovative, transformative, and groundbreaking")
5. Conjunctive overload ("furthermore", "moreover", "additionally")
6. Vague attribution ("studies show", "many users", "industry experts")
7. Superficial `-ing` clauses ("helping you stay organized", "ensuring a smooth process")
8. Uniform sentence length (every sentence 15–20 words, no variation)
9. Hedging stacks ("may potentially help to somewhat improve")
10. Empty openers ("In today's fast-paced world", "When it comes to")
11. Symmetrical closers that restate the opening without adding anything
12. Em-dash and semicolon overuse as a rhythm substitute

- [ ] **Step 4: Verify the catalog against its own rules**

Check each of these by reading the file. Every one must hold:

- Every section has all four parts: what it is, why it reads as machine-written, Before, After.
- No two sections share a Before/After example.
- Every Before example is plausible product copy — a sentence that could appear in a real interface or marketing page. Reject invented filler about "the digital landscape".
- No section states a rule with no example.
- The file itself does not commit the tells it lists. Read the prose you wrote: if it opens a section with "In the world of writing," rewrite it.

- [ ] **Step 5: Report the deliverable**

There is nothing to commit — the file lives outside this repo's git. Report the file path, the number of tells written, and confirm the Step 4 checks passed. Review reads the file itself.

---

### Task 2: Craft heuristics

**Files:**

- Create: `~/.claude/skills/writing-in-voice/references/craft.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `references/craft.md` — the positive half of the standard, consumed by `SKILL.md` (Task 4). Cited by `### <heading>` name when calibration folds rules back in.

- [ ] **Step 1: Write the file**

Create `~/.claude/skills/writing-in-voice/references/craft.md`. Where `ai-tells.md` says what to avoid, this says what to do. Every rule must be checkable by reading the output — a rule nobody can test is a taste assertion and does not belong here.

Required sections, each with a rule stated as a check plus a before/after:

```markdown
# Craft

The positive half of the standard. Each rule is written as something you can
check against finished output.

### Vary sentence length

**Check:** No three consecutive sentences within two words of each other in
length. At least one sentence under eight words per paragraph.

**Why:** Human writing is bursty — a long sentence, then a short one, then a
mid-length one with an aside. Machine writing settles into one length and
stays there, which is one of the strongest tells a reader notices without
being able to name it.

**Before:** You can update your profile at any time from the account page.
Changes are saved automatically when you submit the form. You will receive a
confirmation message once the update completes.
**After:** Update your profile any time from the account page. Changes save
when you submit. You'll see a confirmation.
```

- **Vary sentence length** (as above)
- **Prefer the specific fact over the abstraction** — check: every noun phrase that could name a real thing does. "Connects to Slack, Salesforce, and HubSpot" over "integrates with your existing tools". In interface copy the specific fact is usually already in scope: a count, a name, a date, a dollar amount.
- **Front-load the useful part** — check: the first clause carries the information, not the apology or the preamble. "That slot's taken — pick another" over "Unfortunately, we were unable to reserve the time you selected."
- **Say what happens next** — check: any message about a failure or a wait names the reader's next action or what the system will do. A message that only describes a state is unfinished.
- **Cut words that don't change meaning** — check: delete each word in turn; if the meaning survives, it stays deleted. Particularly "simply", "just", "please note that", "in order to", "the process of".
- **Match tense and person to the surface** — check: the caller's rules doc names the POV for this surface; output uses it consistently, including in fragments.
- **Write the fragment if the fragment is clearer** — check: sentence fragments are allowed in interface copy where a full sentence adds only ceremony. "No pets yet." beats "You have not added any pets yet."

- [ ] **Step 2: Verify**

Read the file and check:

- Every section states its check in a form a reader can apply to a paragraph of output.
- Every section has a before/after.
- The file's own prose obeys its own rules. Specifically: run the "vary sentence length" check on the file's own explanatory paragraphs. If they fail, rewrite them.
- No overlap with `ai-tells.md` — if a section is really "don't do X", it belongs in the tell catalog instead.

- [ ] **Step 3: Report the deliverable**

Nothing to commit — the file is outside this repo's git. Report the path, the rules written, and confirm the Step 2 checks passed.

---

### Task 3: Voice-file format and the derive/update protocols

**Files:**

- Create: `~/.claude/skills/writing-in-voice/references/voice-format.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `references/voice-format.md`, defining the voice-file schema used by Task 5 (deriving Cal's voice file) and by the rewrite operation in Task 4. The schema's section names — `## Traits`, `## Exemplars`, `## Overrides` — are load-bearing: `update` keys off them.

- [ ] **Step 1: Write the file**

Create `~/.claude/skills/writing-in-voice/references/voice-format.md` containing the schema, the derive protocol, and the update protocol.

The schema, verbatim, as the file's template section:

````markdown
```markdown
---
name: <short-name>
derived-from: <reference path or description> — <date>, <word count>
---

## Traits

- (observed) <a trait a reader can check against the corpus>
- (inferred) <a trait you concluded but cannot point at directly>

## Exemplars

> <verbatim passage from a reference>

> <verbatim passage from a reference>

## Overrides

- <hand-written by the maintainer; never machine-edited>
```
````

Rules the file must state:

- **Every trait carries `(observed)` or `(inferred)`.** Observed means you can point at the evidence in the corpus — a count, a ratio, a pattern present in named passages. Inferred means you concluded it and could be wrong. A reader must be able to tell the evidence from the guess.
- **Traits are falsifiable.** State them so that a piece of output can contradict them. "Sentences mostly 8–18 words" can be contradicted; "warm but professional" cannot. If the only honest version of a trait is a vibe, mark it `(inferred)` and keep it short.
- **Exemplars are verbatim.** Copy passages character-for-character. Never paraphrase, never clean up, never merge two passages. If a passage needs an ellipsis, use one and keep the rest exact.
- **Choose exemplars for range, not for quality.** Include a long passage and a short one, a warm one and a plain one. Exemplars teach rhythm, and one register teaches only that register.
- **`## Overrides` is inviolable.** It is the maintainer's section.

The derive protocol:

1. Read every reference in full.
2. Count what can be counted: total words, sentence-length range, how many openings do what, punctuation the corpus never uses.
3. Write traits, marking each `(observed)` or `(inferred)`.
4. Select exemplars for range. Verify each one appears verbatim in a reference before writing it.
5. Write the file with an empty `## Overrides` section.
6. Report to the caller: word count, how many traits are observed versus inferred, and anything the corpus was too small to support.

The update protocol:

1. Read the existing voice file, including `## Overrides`.
2. Read the new references.
3. Regenerate `## Traits` and `## Exemplars` from the union of old and new references.
4. Copy `## Overrides` through byte-identical.
5. Update the `derived-from` front matter to name all references and the new date.
6. Report what changed in the generated sections, and flag any new trait that contradicts a line in `## Overrides` — the maintainer resolves it, not you.

- [ ] **Step 2: Verify**

- The schema in the file and the schema in the spec (`docs/superpowers/specs/2026-07-22-writing-voice-design.md`, "Voice file" section) agree on section names. If they differ, the spec wins — fix the skill file.
- The update protocol states the byte-identical `## Overrides` guarantee explicitly.
- The file names no project. Run: `grep -ri "cal\b\|pet\|booking" ~/.claude/skills/writing-in-voice/references/voice-format.md` — expected: no output.

- [ ] **Step 3: Report the deliverable**

Nothing to commit — the file is outside this repo's git. Report the path and confirm the Step 2 checks passed, including the project-contamination grep.

---

### Task 4: SKILL.md — the entry point and four operations

**Files:**

- Create: `~/.claude/skills/writing-in-voice/SKILL.md`

**Interfaces:**

- Consumes: `references/ai-tells.md` (Task 1), `references/craft.md` (Task 2), `references/voice-format.md` (Task 3).
- Produces: the invocable skill. Calibration subagents (Tasks 7–8) are pointed at this file by absolute path.

- [ ] **Step 1: Write SKILL.md**

Create `~/.claude/skills/writing-in-voice/SKILL.md`. Front matter first — the description is what makes the skill trigger, so it names the situations, not the mechanism:

```markdown
---
name: writing-in-voice
description: Use when writing or rewriting any prose a person will read — interface copy, error messages, emails, marketing text, docs — or when deriving a reusable voice profile from reference writing. Strips AI tells and matches a defined voice instead of defaulting to generic assistant prose.
---
```

The body must contain:

**Three layers, stated up front.** Craft rules are in this skill. The voice is a file the caller names. The project's rules — point of view, subject-matter guardrails, anything domain-specific — live in the calling project's own docs. This skill reads the latter two and restates neither. If a caller supplies no voice file, say so and proceed on craft rules alone rather than inventing a voice.

**The four operations**, each with its own procedure:

- `derive` — inputs: one or more references. Follow the derive protocol in `references/voice-format.md`. Output: a voice file at the path the caller names.
- `update` — inputs: an existing voice file plus new references. Follow the update protocol. `## Overrides` passes through byte-identical.
- `rewrite` — inputs: text, a voice file, and the project's rules doc. Procedure: (1) read the voice file and the rules doc; (2) identify the surface and therefore the POV; (3) draft; (4) self-check the draft against every tell in `references/ai-tells.md` and every check in `references/craft.md`; (5) fix what the self-check found; (6) return the rewrite plus a one-line note per change that is not purely mechanical. Never change meaning to improve prose — if the clearest rewrite would alter what the text promises, return the original and flag it.
- `audit` — inputs: text or a file glob, plus optionally a voice file. Output: a report naming each tell found, the offending span, and why. Changes nothing. This is the mode a cleanup pass uses to size its work before editing.

**A hard rule on substance.** This skill rewrites how something is said. It never invents facts, claims, features, numbers, or commitments. If a rewrite would need a fact the source does not contain, ask for it.

**A pointer section**, not a copy: name the three reference files and say what each is for. Do not restate their contents in SKILL.md.

- [ ] **Step 2: Verify the skill is project-free and agent-free**

Run both greps across the whole skill directory, not just `SKILL.md`:

```bash
grep -ril "cal\b\|portfolio\|pet\|booking\|dog\|colorado" ~/.claude/skills/writing-in-voice/
grep -rin "claude\|anthropic\|cursor\|codex\|copilot\|gemini" ~/.claude/skills/writing-in-voice/
```

Expected: no output from the first. The second may match only inside the `SKILL.md` front-matter block if a field genuinely requires it — every hit in prose is a defect.

A project hit means the skill will not lift to another project. An agent hit means it will not lift to another agent. Both are the same failure: content that assumes its current home.

Then confirm the four operations named in `SKILL.md` match the four in the spec's "The skill" section exactly: derive, update, rewrite, audit.

- [ ] **Step 3: Confirm the skill loads**

Run `/context` or list available skills in a new session and confirm `writing-in-voice` appears with its description. If it does not, check that the front matter parses — `name` must match the directory name.

- [ ] **Step 4: Report the deliverable**

Nothing to commit — the file is outside this repo's git. Report the path, the four operations as written, and the results of both greps from Step 2.

---

### Task 5: Derive Cal's voice file

**Files:**

- Create: `docs/content/voice/cal.md` (in cal-portfolio)
- Modify: `docs/CONTENT.md` (same commit — doc rule)

**Interfaces:**

- Consumes: the `derive` operation and schema from Tasks 3–4; `docs/content/cal-source.md` as the reference corpus.
- Produces: `docs/content/voice/cal.md`, consumed by every calibration round (Tasks 7–8) and by plan 2.

- [ ] **Step 1: Derive the voice file**

Invoke the skill's `derive` operation with `docs/content/cal-source.md` as the sole reference and `docs/content/voice/cal.md` as the output path.

`cal-source.md` is Cal's verbatim text captured by the copy-sync protocol. Some entries in it are Cal's instructions to the developer rather than his prose ("(<-- hyperlink)", bracketed directives). Exclude those from the corpus — they are not writing samples. Note in the derive report how many entries were excluded and why.

- [ ] **Step 2: Verify exemplars are verbatim**

For each exemplar in the generated file, confirm it appears character-for-character in the source:

```bash
grep -F "<exemplar text>" docs/content/cal-source.md
```

Expected: a match for every exemplar. Any exemplar that does not match was paraphrased — regenerate it from the real passage.

- [ ] **Step 3: Verify the traits**

Check each trait:

- Carries `(observed)` or `(inferred)`.
- If `(observed)`, the claim can be checked against the corpus. Spot-check two of them by hand.
- Is falsifiable — a piece of output could contradict it.

Fix any trait that fails. A trait that cannot be made falsifiable gets marked `(inferred)` or dropped.

- [ ] **Step 4: Record the corpus limits**

The derive report states the word count. If the corpus is under a few thousand words, add a line to the file's front matter area noting that traits are qualitative and no statistical claim is implied. The spec's Risks section calls this out — the file should carry the caveat, not just the spec.

- [ ] **Step 5: Point CONTENT.md at the voice file (same commit)**

Add a section to `docs/CONTENT.md` after "Guardrails". It states: where the voice file lives; that it describes Cal's voice and is applied to non-marketing text through the POV rule already documented above it; that it is generated by the `writing-in-voice` skill and hand-tuned only in `## Overrides`; and that `src/content/marketing.ts` remains Cal's own words and is never rewritten from the voice file. Update the doc's `_Last reviewed:_` footer date.

- [ ] **Step 6: Verify links and commit**

```bash
git add docs/content/voice/cal.md docs/CONTENT.md
node scripts/check-doc-links.mjs
git commit -m "docs: derive voice profile from source copy"
```

Expected: the link checker reports no broken relative links. It validates the staged version, so stage first.

---

### Task 6: Assemble the calibration and held-back samples

**Files:**

- Create: `docs/content/voice/fixtures.md` (scaffold: the 14 calibration strings, no rewrites yet)
- Create: `docs/content/voice/held-back.md` (the 5 blind-round strings)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: both sample files, consumed by Tasks 7 and 8. `fixtures.md` gains its rewrite columns during calibration; `held-back.md` is written once and not reopened until the blind round.

- [ ] **Step 1: Select the 14 calibration strings**

Selection criteria: real strings currently in the codebase, spread across the three in-scope surfaces, weighted toward hard cases rather than easy labels. Target mix: 5 client microcopy, 5 feedback, 4 admin.

Candidate pool already identified — draw from these and find the remainder by grepping the surfaces:

| Candidate                                                     | Location                                                                      | Why it's useful                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Couldn't save your time`                                     | `src/features/accounts/_components/meet-greet-scheduler.tsx:175`              | Toast title on the flow the tester got stuck in                       |
| `No eligible pets yet. Add one to continue.`                  | `src/features/booking/_components/pet-assignment.tsx:76`                      | Empty state that also instructs                                       |
| `No pets added yet.`                                          | `src/features/accounts/_components/pet-list.tsx:216`                          | Bare empty state                                                      |
| `No inquiries yet.`                                           | `src/app/(site)/(admin)/admin/inquiries/_components/inquiries-client.tsx:108` | Admin empty state                                                     |
| `Approve before the visit?`                                   | `src/features/admin/_components/onboarding-status-select.tsx:64`              | Admin confirm-dialog title                                            |
| `Additional owners (optional)`                                | `src/features/accounts/_components/profile-fields.tsx:95`                     | Also violates the optional-label convention from the form-system work |
| `Client location is too far (12.4 mi). Hard cutoff is 50 mi.` | `src/features/booking/booking-service-shared.ts:706`                          | Refusal with interpolated numbers — the hardest case in the set       |
| `Full name is required`                                       | `src/features/accounts/profile-schema.ts:9`                                   | zod message, shared client and server                                 |
| `Enter a valid 5-digit ZIP code`                              | `src/features/accounts/profile-schema.ts:21`                                  | zod message with a format instruction                                 |

Rules for the final 14:

- At least one string containing interpolated values, so the skill has to preserve them.
- At least one zod validation message, since those are shared client/server and constrain rewrites.
- At least one string longer than a sentence.
- No string from `src/content/marketing.ts` — out of bounds.

- [ ] **Step 2: Select 5 held-back strings and write them where the maintainer will not read them**

Same criteria, same surface spread, drawn from strings **not** in the calibration 14. Create `docs/content/voice/held-back.md`:

```markdown
# Held-back strings (blind round)

> Do not read this file during calibration. These five strings are the control
> for the blind round: they exist to test whether the skill generalizes beyond
> the strings the maintainer reacted to. Reading them first destroys the test.

| #   | String | Location | Surface |
| --- | ------ | -------- | ------- |
| 1   | …      | …        | …       |
```

- [ ] **Step 3: Scaffold the fixtures file**

Create `docs/content/voice/fixtures.md` with the 14 strings, their locations, and empty rewrite/rationale columns. Add a header block recording: the date calibration started, the model used for calibration subagents, and the round number (starting at 0).

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/fixtures.md docs/content/voice/held-back.md
git commit -m "docs: assemble voice calibration samples"
```

---

### Task 7: Calibration rounds

**Files:**

- Modify: `docs/content/voice/fixtures.md` (one row block per round)
- Modify: `~/.claude/skills/writing-in-voice/references/*.md` and/or `docs/content/voice/cal.md` (from feedback)

**Interfaces:**

- Consumes: the skill (Tasks 1–4), `docs/content/voice/cal.md` (Task 5), `docs/content/voice/fixtures.md` (Task 6).
- Produces: a calibrated skill and a fixtures file whose final round is maintainer-approved. Gate 1 of the two-part exit condition.

This task is a loop with a human gate. It does not complete until the maintainer approves a round with zero changes.

- [ ] **Step 1: Run a round**

Dispatch a subagent — fresh, no history from this session, same model every round — with a prompt containing exactly:

1. Read these files in full: `C:/Users/Zander/.claude/skills/writing-in-voice/SKILL.md` and everything in its `references/` directory; `docs/content/voice/cal.md`; `docs/CONTENT.md`.
2. The 14 strings with their locations and surfaces.
3. The instruction: apply the `rewrite` operation to each string. For each, return the rewrite plus one line on what changed and why.
4. The constraint: preserve every interpolated value and every fact. Do not invent.

The subagent must not receive any maintainer feedback from previous rounds. The skill files carry the learning; the prompt does not.

- [ ] **Step 2: Present the round to the maintainer**

Show a before/after table for all 14, with the subagent's rationale line for each. Ask for reactions — per item or wholesale.

- [ ] **Step 3: Fold feedback into the skill, not into the prompt**

For each piece of feedback, find the general principle behind the objection and write it into `references/ai-tells.md` or `references/craft.md`, or into `docs/content/voice/cal.md` if it is a voice fact rather than a craft rule.

Patching a specific string is the failure mode this loop exists to avoid. Before writing a rule, state the principle in one sentence and check it would apply to strings outside the sample. A rule that names a specific string or a specific phrase from the sample is a symptom patch — generalize it or discard it.

If feedback contradicts a trait in `cal.md`, add it to `## Overrides` rather than editing a generated trait. Generated sections get overwritten by `update`; `## Overrides` does not.

- [ ] **Step 4: Record the round**

Append to `docs/content/voice/fixtures.md`: the round number, the rewrites, the feedback received, and what changed in the skill as a result. This is the record of how the skill got its rules.

- [ ] **Step 5: Commit the round**

Only the repo files are committed; the skill files have no git history in this pass.

```bash
git add docs/content/voice/fixtures.md docs/content/voice/cal.md
git commit -m "docs: record voice calibration round"
```

The fixtures entry for the round must name which skill file changed and what rule was added, since that is the only record of the skill's evolution.

- [ ] **Step 6: Repeat until gate 1 passes**

Return to Step 1. Gate 1 is: one full round of all 14, approved by the maintainer with zero changes requested.

Do not proceed to Task 8 before gate 1 passes. If three consecutive rounds produce only per-string objections with no generalizable principle, stop and raise it — the sample may be too narrow, which the spec's Risks section names as the signal to widen the sample rather than run more rounds.

---

### Task 8: Blind round and finalization

**Files:**

- Modify: `docs/content/voice/fixtures.md`
- Modify: `docs/superpowers/specs/2026-07-22-writing-voice-design.md` (only if the design drifted during implementation)

**Interfaces:**

- Consumes: the calibrated skill and `docs/content/voice/held-back.md` (Task 6).
- Produces: gate 2 of the exit condition, and a finished skill ready for plan 2.

- [ ] **Step 1: Run the blind round**

Dispatch a subagent with the same prompt shape as Task 7 Step 1, on the same model, with two differences: the strings are the 5 from `docs/content/voice/held-back.md`, and the subagent has seen no part of the calibration — no feedback, no fixtures file, no round history. It gets the skill, the voice file, the rules doc, and the 5 strings.

- [ ] **Step 2: Judge it**

Present the 5 rewrites to the maintainer alongside the approved 14 from gate 1. The question is not "are these perfect" but "are these as good as the calibrated set".

**Pass:** the blind 5 are as good as the approved 14. The skill generalized.
**Fail:** the blind 5 are visibly worse. The skill was tuned to the sample.

- [ ] **Step 3: On failure, return to calibration**

A failed blind round means the rules encode symptoms rather than principles. Identify which blind rewrites failed and what rule would have caught them, write that rule, and run another calibration round (Task 7 Step 1). Then draw 5 fresh held-back strings — the original 5 are now burned, since they have been seen.

Do not weaken the gate to pass it.

- [ ] **Step 4: On success, finalize the fixtures**

Rewrite `docs/content/voice/fixtures.md` into its final form: the approved before/after pairs from gate 1 plus the blind 5, each with a one-line rationale for why the rewrite is right. Drop the round-by-round history into a `## Calibration log` section at the end — it explains why the rules exist and is worth keeping, but it is not the artifact plan 2 reads.

Record in the header: total rounds run, the model used, and the date both gates passed.

- [ ] **Step 5: Reconcile the spec**

Read `docs/superpowers/specs/2026-07-22-writing-voice-design.md` against what was actually built. If the skill's operations, the voice-file schema, or the calibration protocol drifted during implementation, update the spec to match reality and its `_Last reviewed:_` footer. If nothing drifted, change nothing.

- [ ] **Step 6: Commit**

```bash
git add docs/content/voice/fixtures.md docs/superpowers/specs/2026-07-22-writing-voice-design.md
git commit -m "docs: finalize voice fixtures after blind round"
```

- [ ] **Step 7: Report readiness for plan 2**

State explicitly: both gates passed, how many rounds it took, and where the artifacts live. Plan 2 (the repo text cleanup) can now be written, since its acceptance criteria depend on what the calibrated skill actually produces.

---

## Self-review notes

- **Spec coverage:** three-layer separation (Global Constraints + Tasks 1–4), skill anatomy and four operations (Tasks 1–4), voice-file schema with observed/inferred and inviolable Overrides (Task 3, applied Task 5), Cal's corpus as the reference (Task 5), calibration sample of 14 plus 5 held back (Task 6), round loop with the fold-back-the-principle rule (Task 7), both exit gates (Tasks 7–8), fixtures staying in this repo rather than the portable skill (Tasks 6–8), CONTENT.md pointer under the same-commit doc rule (Task 5). Covered.
- **Deliberate deviation from TDD:** this plan produces prose, and prose has no failing test to write first. Verification is substituted per task — structural checks on the artifacts (every entry has a before/after, every exemplar greps back to source, the project-free grep) and, for the skill's actual output quality, the two-gate calibration. The one place a mechanical check exists, it is used: the `grep -ril` project-contamination check in Tasks 3 and 4.
- **Only repo files are committed.** The skill files sit outside cal-portfolio and get no git history in this pass, so Tasks 1–4 end in a report rather than a commit and their review reads the files directly. The trade-off is accepted deliberately: versioning them would mean either polluting this project's history with unrelated files or standing up an agent-agnostic standards repo, which is a separate decision. The consequence to respect is that calibration edits are unrecoverable.
- **Agent neutrality is a hard constraint, not a preference.** The files sit in an agent-specific directory today purely for convenience. Any sentence written to one product's conventions makes the eventual move a rewrite instead of a copy, so the grep in Task 4 Step 2 checks for it.
- **Human gates are real gates.** Tasks 7 and 8 cannot be completed by a subagent alone; they require the maintainer's reactions. An executor that "approves" its own round has defeated the plan.
- **Risk flagged in Task 7 Step 6:** the loop has no iteration cap by design, but three unproductive rounds is the stated signal to escalate rather than grind.

---

_Last reviewed: 2026-07-22_
