# Voice fixtures

> Calibration complete: 2026-07-23 · rounds: 2 plus a blind round · model: sonnet
> Gate 1: a full round approved with zero changes. Gate 2: a blind round on 5
> held-back strings, rewritten by a subagent that saw none of the feedback.

The regression artifact for the `writing-in-voice` standard as applied to this
project. Every pair below is maintainer-approved. If a later edit to the
standard would change what it does to these strings, that is a signal to look
twice, not a licence to update the fixtures.

**Nothing here has been applied to source.** These are approved judgements
about what the standard produces. The cleanup pass is a separate plan.

## Approved rewrites

| String                                                                            | Location                                             | Approved rewrite                                                    | Why it is right                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Keep these up to date and don't worry, these forms are confidential and secure.` | `src/app/(site)/(account)/account/forms/page.tsx:76` | `Keep these up to date. They're confidential and secure.`           | Splits a comma splice, and cuts "don't worry", which told the reader how to feel instead of stating the fact that does the reassuring.         |
| `Client location is too far (${milesLabel} mi). Hard cutoff is ${cutoff} mi.`     | `src/features/booking/booking-service-shared.ts:706` | `Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.` | One sentence instead of two clipped ones, matching the phrasing the sibling warning at line 701 already uses. Both interpolated values intact. |

## Approved as already correct

These matter as much as the rewrites. A standard that cannot leave good text
alone is worse than none, because it churns working copy.

| String                                                                                                        | Why it stands                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `No eligible pets yet. Add one to continue.`                                                                  | Fragment plus imperative. Nothing stands between the reader and the next action.                                          |
| `No pets added yet.` · `No inquiries yet.`                                                                    | The site's empty-state pattern, used consistently.                                                                        |
| `Messages you've sent to Cal. Mark one resolved once you no longer need a reply.`                             | Correct third-person POV about Cal, two sentences of different length, no filler.                                         |
| `Couldn't save your time`                                                                                     | Front-loaded toast title, in the contraction-heavy register the voice file describes.                                     |
| `Full name is required` · `Enter a valid 5-digit ZIP code`                                                    | Minimal zod messages that read correctly inline on the client and as server errors.                                       |
| `We need to sort out your account before you can book. Please get in touch and we'll help.`                   | "Please" stays. This message blocks the reader, and courtesy on a refusal is not filler. See the carve-out in `craft.md`. |
| `Approve before the visit?`                                                                                   | A confirm-dialog title that asks the actual question.                                                                     |
| `This clears it from your open queue. You can still find it under the Resolved filter. This can't be undone.` | Three sentences carrying three distinct facts: effect, recovery path, irreversibility. Lengths 7, 10, 4.                  |
| `Create a record for an offline client. They claim the account later.`                                        | Short, direct, correct neutral pronoun for an unspecified person.                                                         |
| `Holiday & peak-date rate — a surcharge that applies on major holidays and other high-demand dates.`          | Definitional copy already specific about scope. No further fact exists in the source to add without inventing one.        |
| `Long stay — applies once a booking runs longer than 4 nights.`                                               | States its threshold as a number.                                                                                         |
| `Per cat, including the first.`                                                                               | Left deliberately. See "the factual trap" below.                                                                          |

## Blind round (gate 2)

Five strings the maintainer never saw during calibration, rewritten by a
subagent with no access to the feedback. It changed none of them, and checked
its instincts against the codebase rather than asserting them.

| String                                                                                   | Location                                                             | Verdict and reasoning                                                                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A valid email is required`                                                              | `src/features/admin/create-client-actions.ts:30`                     | Unchanged. Roughly twenty sibling zod messages share this shape, so rewriting one in isolation would break consistency rather than improve anything. |
| `Complete your required profiles before changing this booking — see Account → Profiles.` | `.../account/bookings/[id]/edit/_components/use-edit-booking.ts:304` | Unchanged. Suspected the em dash of being a tic, found three sibling state-plus-next-step messages using the same construction, kept it.             |
| `Add or edit your pets. Name, species, breed, a photo, and any care notes.`              | `src/app/(site)/(account)/account/pets/page.tsx:47`                  | Unchanged. The second sentence names the five real fields instead of an abstraction like "pet details".                                              |
| `Update your contact info. Email is managed through your login.`                         | `src/app/(site)/(account)/account/page.tsx:26`                       | Unchanged. States a constraint as plain fact, with no hedging tail.                                                                                  |
| `Approve, edit, or cancel right from the row.`                                           | `src/app/(site)/(admin)/admin/bookings/page.tsx:35`                  | Unchanged. Flagged its own rule-of-threes suspicion, opened `booking-row.tsx`, confirmed all three are real distinct row actions.                    |

## What calibration established

**The factual trap.** `Per cat, including the first.` is wrong on a cats-only
booking, where the first cat is the base rate and is not charged the per-cat
amount. Both rounds left it alone and flagged it. That is the required
behaviour. The standard forbids inventing facts and forbids correcting them,
because a rewriter who "fixes" a fact is guessing at pricing logic it cannot
see. The sentence needs a decision from whoever owns `TERM_DESCRIPTIONS`,
routed through copy-sync.

**Courtesy on refusals.** Maintainer feedback in round 1 produced a general
rule rather than a patch. A "please" or "sorry" is filler in a routine
instruction, and does real work when the message refuses the reader, blocks
them, or asks them to go out of their way after a failure. Round 2 applied it
correctly to a string it had previously cut.

**Voice traits rarely bind on system copy.** The blind round observed that
none of its five strings were about Cal, so `cal.md`'s traits had no surface
to apply to, and said so rather than pretending otherwise. Most interface copy
is like this. The voice file will earn its keep on email templates and
anywhere the site speaks in a warmer register; the bulk of a cleanup pass runs
on `craft.md` and `ai-tells.md` alone. Plan 2 should scope accordingly.

**Three findings that are not copy problems**, surfaced by the rounds and left
for their owners:

- `Additional owners (optional)` is a `FieldGroup.title`, not a `FormField`
  label, so the site's optional-suffix convention never reaches it. Fixing it
  is a component change. Same pattern at `profile-fields.tsx:130`.
- The distance refusal is consumed by both the client's own booking flow and
  the admin's book-on-behalf flow, so its subject has to stay "Client".
  "Your location" would be wrong for an admin.
- `Enter a valid 5-digit ZIP code` describes only the 5-digit case, while its
  regex also accepts ZIP+4.

## Corpus completeness

Checked after calibration: all 89 Cal-authored IDs in `docs/content/copy-ledger.md`
appear in `docs/content/cal-source.md`, so the derive corpus was complete.
`src/content/marketing.ts` was deliberately not used — its live text is Cal's
source plus agent-applied transforms, so deriving from it would partly recover
the agent's voice rather than his.

**One known gap.** `services.notice.lede` was excluded whole because it
carries a bracketed note to the developer, even though eleven other entries
got a "strip the annotation, keep the prose" treatment. The lost prose is
Cal's own eight words: "Until August 25, please assume I can't…". Too small
to move a trait, but worth folding in at the next `update` — it is Cal using
courtesy to soften a refusal, which is direct corroboration for the carve-out
added during round 1.

## Calibration log

Kept because it explains why the standard's rules exist, not because a cleanup
pass needs it.

**Round 1** — 14 strings, 3 rewritten. The maintainer accepted the 11 left
alone and rejected one rewrite: "Please" had been cut from a blocked-account
panel as filler. The round also exposed two gaps. The skill had never been
pointed at `docs/COMPONENT_SYSTEM.md`, and the sample contained no
definitional copy at all.

**Between rounds** — the courtesy carve-out was added to `craft.md`.
`COMPONENT_SYSTEM.md` was added to the rules the skill reads. Three pricing
tooltip strings joined the sample as a new genre, one of them deliberately
carrying a factual error.

**Round 2** — 17 strings, 2 rewritten, approved with zero changes. Both traps
behaved correctly.

**Blind round** — 5 held-back strings, none rewritten, every judgement checked
against sibling code.

## Sample provenance

Set A was 14 strings across client microcopy, feedback, and admin surfaces,
chosen to include interpolated values, shared client and server zod messages,
and text longer than a sentence. Three definitional strings were added after
round 1. The held-back 5 were drawn at the same time as Set A, from strings
not in it, and were not read by the maintainer before gate 2. Nothing came
from `src/content/marketing.ts`, which Cal owns under `docs/CONTENT.md`'s
authority rule.
