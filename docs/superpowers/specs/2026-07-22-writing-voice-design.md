# Writing voice — design (2026-07-22)

A portable writing skill plus a cleanup pass over the site's non-Cal text.
Prerequisite for the tester-feedback plan's Group H (email templates), which
cannot write good copy until "good" is defined.

## Problem

Every string on the site that Cal did not write was written by an agent, one
string at a time, with no shared standard. Three failures follow:

- **AI tells.** Inflated significance, promotional framing, "it's not X, it's
  Y", rule-of-threes, uniform sentence length. Common to unguided LLM prose.
- **No voice.** Marketing carries Cal's personality; system text reads like
  software. The site splits into two registers with nothing connecting them.
- **Point of view drifts.** `docs/CONTENT.md` fixes the rule (marketing is
  Cal's first person, system text third person about Cal, with client-signed
  consent and Cal-signed email as exceptions), but nothing enforces it at
  writing time.

The rule doc exists. The craft standard does not, and neither does a
description of the voice being aimed at.

## Decision

Build one portable skill, `writing-in-voice`, and give this project a voice
file derived from Cal's own words. Then rewrite the site's non-Cal text with
it.

Structure the work as three layers that change on different clocks and belong
to different owners:

| Layer             | Lives in                             | Owns                                                                  |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------- |
| **Craft rules**   | `~/.claude/skills/writing-in-voice/` | AI-tell catalog, rhythm and specificity heuristics, rewrite procedure |
| **Voice**         | `docs/content/voice/` (this repo)    | trait profile + verbatim exemplars, derived from references           |
| **Project rules** | `docs/DESIGN.md`, `docs/CONTENT.md`  | POV per surface, Colorado-only, never invent substance                |

The skill reads layers 2 and 3 by pointer and restates neither. That is what
makes it liftable: another project supplies its own voice file and its own
rules doc, and the skill does not notice the difference.

## Prior art

No existing skill does this. Four related projects were reviewed and their
banned-pattern lists are worth mining rather than re-deriving:
[no_ai_slop_writing_rules](https://github.com/realrossmanngroup/no_ai_slop_writing_rules)
(closest — corpus-derived voice profile, but the voice is hardcoded to one
person rather than parameterized),
[anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing),
[Stop Slop](https://gabrielcassady.com/tools/stop-slop-claude-skill-to-remove-ai-writing-tells/),
and [writing-anti-ai](https://claudemarketplaces.com/skills/galaxy-dawn/claude-scholar/writing-anti-ai).
All four collapse voice and craft rules into one document; separating them is
the distinguishing move here.

Source material for the catalog: Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
(descriptive, not proof — the guide says so itself) for the tell taxonomy, and
the burstiness and specificity literature for the craft half.

## The skill

```
~/.claude/skills/writing-in-voice/
  SKILL.md                    when to invoke, the procedure, pointers to layers 2+3
  references/ai-tells.md      tell catalog, each entry with a real before/after
  references/voice-format.md  voice-file schema, derive and update protocol
  references/craft.md         burstiness, specificity, tense and POV discipline, cutting
```

Four operations:

- **derive** — N references (files, pasted text, URLs) produce a new voice file.
- **update** — new references merge into an existing voice file without
  discarding hand edits.
- **rewrite** — text plus voice file plus project rules produce rewritten text.
- **audit** — flag tells and voice drift, change nothing. The cleanup pass
  needs the inventory before it needs the edits.

Zero project assumptions in any file. The skill ships the voice-file _format_
plus two or three neutral examples; the calibration fixtures produced for this
project stay in this repo.

## Voice file

```markdown
---
name: cal
derived-from: docs/content/cal-source.md — 2026-07-22, N words
---

<!-- Traits: generated. Each one observable, not a vibe. -->

## Traits

- Sentences mostly 8–18 words, with occasional 4-word fragments for emphasis
- Contractions throughout; no semicolons anywhere in the corpus
- Leads with the reader's concern, not with self-description (9 of 11 openings)
- Concrete care nouns over abstractions; zero business jargon
- Never: hype adjectives, rule-of-threes, "passionate about"

<!-- Exemplars: generated. Verbatim, never paraphrased. -->

## Exemplars

> …

<!-- Overrides: hand-written. `update` never touches this section. -->

## Overrides

- …
```

Three rules govern it:

**Traits must be falsifiable.** "Warm and approachable" cannot be checked
against a rewrite. "Addresses the reader as _you_ in 9 of 11 openings" can.
`derive` marks which traits it observed and which it inferred, so the evidence
is separable from the guess.

**`update` merges.** Generated sections regenerate; `## Overrides` is
inviolable. Otherwise hand-tuning evaporates the first time a reference is
added.

**POV is a parameter, not a second voice file.** One file holds Cal's
personality; `rewrite` applies first or third person per surface from
`docs/CONTENT.md`. Two files would duplicate every trait and drift apart.

This project's reference corpus is `docs/content/cal-source.md` — Cal's actual
words, already captured and authoritative. System text then reads as the same
personality described from outside, instead of as a second, colder author.

## Calibration

The skill is judgment, so it is calibrated against real examples rather than
specified into correctness.

Two samples are drawn up front:

- **Calibration set** — roughly 14 real strings: about 5 microcopy, 5 feedback,
  4 admin, deliberately including the awkward cases (a refusal reason with
  interpolated numbers, a zod validation message, an empty state, an admin
  table header).
- **Held-back set** — 5 further strings the maintainer never sees during
  calibration.

Each round: a fresh subagent, cold, loaded with the current skill, voice file,
and project rules, rewrites all 14. The maintainer sees a before/after table
and reacts per item or wholesale. The skill or voice file is edited from that
feedback.

**Exit condition, both required:**

1. One full calibration round approved with zero changes.
2. A **blind round** on the held-back 5, rewritten by a subagent that never saw
   any of the maintainer's feedback, judged as good as the calibrated output.

The blind round exists because maintainer feedback can be satisfied two ways:
by finding the general principle behind an objection, or by patching the
specific string. The second looks identical during calibration and fails
everywhere else. Held-back strings are the only evidence that the skill
generalized, and they have to be bought before plan 2 spends effort on the
full corpus. A failed blind round means another calibration round aimed at the
principle, not the symptom.

Approved pairs land in `docs/content/voice/fixtures.md`, each with a line on
why the rewrite is right. Any rule a round produces folds back into
`references/ai-tells.md` or `references/craft.md`.

## Cleanup pass

Written as a separate plan, after calibration — rewriting text with an
uncalibrated skill wastes the pass.

In scope: client-facing UI microcopy (labels, buttons, hints, section titles,
placeholders, empty states across marketing, account, onboarding, booking),
feedback text (validation messages, server errors, toasts, gate panels,
refusal reasons), and admin-only surfaces.

Out of scope: email templates, which belong to Group H and will inherit the
finished voice; and developer-facing docs.

Method: audit mode produces a register of every user-visible non-Cal string
with its flagged tells, then rewrites proceed surface by surface, one commit
each.

Three constraints:

- **`src/content/marketing.ts` is out of bounds.** Cal owns it under
  `docs/CONTENT.md`'s authority rule.
- **Tests assert exact strings.** Form-system tests assert on validation text.
  Copy changes ship with their test updates in the same commit, never as
  follow-up.
- **Validation messages are shared client and server.** They live in zod
  schemas both sides parse, so those schema files are copy files.

## Verification

The skill cannot be verified by string equality. Its regression artifact is
the fixture set, and its acceptance gate is a final calibration round the
maintainer approves.

The cleanup pass takes ordinary gates: typecheck, scoped suites green, and
every register entry either rewritten or explicitly left alone with a reason.

## Risks

- **Overfitting to the calibration sample.** Fourteen strings is small, and
  round-by-round feedback invites symptom patches. The blind round is the
  control; if it keeps failing, the sample itself is too narrow and needs
  widening rather than more rounds.
- **Corpus size.** `cal-source.md` is a modest corpus. Traits derived from it
  should stay qualitative; measured statistics would imply precision the
  sample cannot support.
- **Scope creep into Cal's copy.** The line between "system text" and
  "marketing text" is occasionally blurry. When it is, the string stays
  untouched and gets flagged for copy-sync.

---

_Last reviewed: 2026-07-22_
