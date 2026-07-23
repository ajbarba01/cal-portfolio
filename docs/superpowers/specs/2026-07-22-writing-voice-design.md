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

| Layer             | Lives in                                                        | Owns                                                                               |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Craft rules**   | `~/.claude/skills/writing-in-voice/`                            | AI-tell catalog, rhythm and specificity heuristics, rewrite procedure              |
| **Voice**         | `docs/content/voice/` (this repo)                               | trait profile + verbatim exemplars, derived from references                        |
| **Project rules** | `docs/DESIGN.md`, `docs/CONTENT.md`, `docs/COMPONENT_SYSTEM.md` | POV per surface, Colorado-only, never invent substance, form and label conventions |

`COMPONENT_SYSTEM.md` was added to that row during calibration. Round 1 left a
label untouched that violated the site's optional-suffix convention, because
nothing had told the skill the convention existed. Which docs count as
"project rules" is itself a per-project decision, and getting it wrong looks
exactly like a taste failure.

The skill reads layers 2 and 3 by pointer and restates neither. That is what
makes it liftable: another project supplies its own voice file and its own
rules doc, and the skill does not notice the difference.

**Layer 1 is also agent-neutral.** Its content names no agent product, tool,
or invocation convention — the same discipline this repo already applies with
`AGENTS.md` as source of truth and `CLAUDE.md` as a thin shim over it. The
skill sits in an agent-specific directory today for convenience only; nothing
in its body may depend on that. A sentence written to one product's
conventions turns the eventual move into a rewrite rather than a copy.

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
  table header). It grew to 17 during calibration: round 1 revealed the sample
  held no **definitional copy** — text whose whole job is explaining a concept
  — so three pricing tooltips were added, one of them carrying a known factual
  error, to test that the standard flags rather than "fixes" it.
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

**Scope correction from calibration (2026-07-23).** The voice file will do
far less work here than this design assumed. Almost no interface string is
_about_ Cal, so their traits have no surface to apply to, and the blind round
said so rather than pretending otherwise. The cleanup runs mostly on
`craft.md` and `ai-tells.md`; `cal.md` earns its keep on email templates and
anywhere the site speaks in a warmer register. Plan 2 should not budget effort
for voice-matching across the whole corpus.

Calibration also showed the standard is deliberately conservative: across 22
real strings it changed 2. That is the intended behaviour, and it means plan 2
should be sized as an audit that produces a small number of edits, not a
rewrite of every string it touches.

Out of scope: email templates, which belong to Group H and will inherit the
finished voice; and developer-facing docs.

Method: audit mode produces a register of every user-visible non-Cal string
with its flagged tells, then rewrites proceed surface by surface, one commit
each.

### Outcome (2026-07-23)

The pass ran and is complete. Register: `docs/content/voice/copy-register.md`.

Of 1,070 extracted candidates, 811 were user-visible and in scope. **Twenty-three
were flagged — 2.8%, against calibration's 9%.** Only four warranted a copy
rewrite, and all four are applied. The other nineteen route elsewhere: twelve to
engineering, four to a component owner, three to Cal.

That ratio is the pass's real finding. The site's copy was in better shape than
the spec assumed, and nearly everything the audit surfaced was a defect wearing
copy's clothes rather than a copy defect. The three genre-level predictions held:
the voice file bound almost nowhere, the standard stayed conservative, and the
register stayed short.

Two things the design did not anticipate:

**The extraction has a blind spot, and most findings hid in it.** Only string
literals were ever visible to it, so a user-facing message assembled at runtime
from a variable never reached the candidate list. Eight of the twenty-three
findings are exactly that — a raw driver error interpolated into a message, or a
real error message discarded in favour of a bare union tag. Every one was found
by reading the code around a literal, not by the extraction. The worst,
`booking-service-shared.ts:506`, passes zod's serialized issues array — a JSON
blob of schema internals — straight to users on three booking surfaces. Any
future pass built this way inherits the same gap.

**A conservative standard shifts the risk from the edits to the claims.** Every
significant review finding across seven audits was a confident assertion in a
report that turned out to be false — "only two strings reach the admin surface",
"eleven in-scope strings in this file", "both are true, neither is a tell". Not
one flagged string was itself wrong. Where a standard barely changes anything,
the thing to review is the reasoning, not the diff.

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

_Last reviewed: 2026-07-23_ (cleanup pass complete; outcome recorded)
_Earlier: 2026-07-22_
