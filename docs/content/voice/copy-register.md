# Copy register — cleanup pass

> Audit of every user-visible non-Cal string against the `writing-in-voice`
> standard. Started 2026-07-23. Standard:
> `~/.claude/skills/writing-in-voice/`. Approved judgements and the calibration
> history live in `docs/content/voice/fixtures.md`.
>
> **Complete 2026-07-23.** 1,070 candidates extracted, 811 in scope, 23 flagged.
> Four warranted a copy rewrite and all four are `applied`. The twelve
> `route:engineering` rows are real code defects, recorded here for a follow-up
> plan — this pass deliberately does not fix them. The three `route:copy-sync`
> rows go to Cal; `unit:cat` is also recorded in
> `docs/content/pricing-language-drafts.md`. The four `route:component` rows go
> to whoever owns the component. No row is unresolved.

The standard is conservative by design: across the 22 strings of calibration it
changed 2. This register is expected to be short. A long one means the audit
drifted into taste, not that the site is badly written.

Across 1,070 candidates, 811 were in scope and 23 were flagged — 2.8%, against
calibration's 9%. Nineteen of the twenty-three are not copy problems at all:
they route to code, to a component, or to Cal. Four warranted a rewrite. The
standard left the site's text very largely alone, which is the result it was
built to produce.

## Method

Candidate strings were extracted mechanically from `src/**/*.{ts,tsx}`: every
string literal, template literal, and JSX text node outside a comment, filtered
to drop URLs, slugs, Tailwind class strings, `use client` directives, Supabase
select lists, and snake_case identifiers. The filter over-collects on purpose —
an auditor can reject noise, but a string that never reached the list never got
looked at.

A literal `$$` in a quoted string — a `$` immediately followed by a `${…}`
interpolation — was once written into this file as a display-math fence,
splitting a sentence in two and leaving a stray delimiter after the footer.
The cause was the authoring step, not `prettier`, which leaves such a
sequence untouched (checked directly). Quote a dollar amount carefully and
re-read the region afterwards; a formatter check will not catch this.

Each candidate was then opened in its source file and classified as
`out-of-scope` (not user-visible prose), `in-scope, clean`, or `in-scope,
flagged`. Only flagged strings get a row below. Enumerating all ~1,070
candidates was rejected: the artifact would be ten times the size and nine
tenths of it would read "no tell found". The coverage table carries the same
guarantee that nothing was skipped.

A blind spot in that extraction surfaced during review: it only ever sees
string literals and template literals, so a user-facing message assembled at
runtime from a variable — a driver error interpolated into a template
literal, a validation library's own serialized output passed straight through
as a `message` field — was invisible to it. The variable carrying the actual
leak is not a string literal; at most a neighboring template literal or a
`message:` property name is, and that scaffolding alone reads as harmless.
F1, F2, and F4 were all found this way: by reading the code around the
literals the extraction did surface, not by the extraction surfacing the
leaking value itself. Other instances of the same class may remain
uncounted, in any group, since nothing in the method catches this
systematically.

## Exclusions

| Path                                     | Why                                            |
| ---------------------------------------- | ---------------------------------------------- |
| `src/content/marketing.ts`               | Cal owns it (`docs/CONTENT.md` authority rule) |
| Anything rendered via `<MarketingCopy>`  | Cal's words, wherever the render site lives    |
| `src/content/rover-reviews.ts`           | Third-party reviewers' verbatim words          |
| `src/features/notifications/emails.ts`   | Email templates — tester-feedback Group H      |
| `src/app/showcase/**`                    | Dev-only catalog, 404s in production           |
| Comments, JSDoc, thrown invariant errors | Developer-facing                               |
| `docs/**`                                | Developer-facing                               |

## Coverage

| Group          | Surface                         | Files | Candidates | Out of scope | In scope | Flagged |
| -------------- | ------------------------------- | ----- | ---------- | ------------ | -------- | ------- |
| `A-public`     | Marketing chrome + app shell    | 58    | 187        | 104          | 83       | 3       |
| `B-auth`       | Auth + onboarding               | 8     | 47         | 5            | 42       | 0       |
| `C-account`    | Client account area             | 32    | 203        | 15           | 188      | 4       |
| `D-booking`    | Booking flow UI                 | 19    | 109        | 12           | 97       | 3       |
| `E-validation` | zod validation messages         | 5     | 23         | 0            | 23       | 1       |
| `F-feedback`   | Server errors, refusals, toasts | 32    | 163        | 66           | 97       | 5       |
| `G-admin`      | Admin surfaces                  | 54    | 338        | 57           | 281      | 7       |

## Verdicts

`rewrite` — warranted copy change, applied by this pass.
`leave` — tell present, deliberately not changed; the note says why.
`route:copy-sync` — needs Cal's approval before the string can change. Pricing terms are recorded in `docs/content/pricing-language-drafts.md`; other marketing/system-boundary strings are reported to the maintainer at close-out for routing to Cal. A row here does not need a named tell when the reason it needs Cal is ownership rather than craft.
`route:component` — the fix is a component change, not a copy change.
`route:engineering` — the copy describes the code incorrectly; the code is the question.

## Flagged entries

### Carried over from calibration

These five were settled in `docs/content/voice/fixtures.md` and are seeded here
so the pass applies and closes them.

| #   | String                                                                            | Location                                                   | Tell / rule                                | Verdict             | Proposed text                                                       | Note                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | `Keep these up to date and don't worry, these forms are confidential and secure.` | `src/app/(site)/(account)/account/forms/page.tsx:76`       | craft: Cut words that don't change meaning | `applied`           | `Keep these up to date. They're confidential and secure.`           | Approved in fixtures. Splits a comma splice; "don't worry" told the reader how to feel instead of stating the fact. tests: none.                                                                                                                                                                      |
| K2  | `Client location is too far (${…} mi). Hard cutoff is ${…} mi.`                   | `src/features/booking/booking-service-shared.ts:706`       | craft: Vary sentence length                | `applied`           | `Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.` | Approved in fixtures. Matches the sibling warning at line 701. Subject stays "Client" — admin also reads this. tests: none (grepped `Hard cutoff` / `Client location is too far` / `mi away` under `src/**/*.test.{ts,tsx}`; only source and a settings-UI label match, no test asserts this string). |
| K3  | `Additional owners (optional)`                                                    | `src/features/accounts/_components/profile-fields.tsx:95`  | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | A `FieldGroup.title`, not a `FormField` label, so the optional-suffix convention never reaches it.                                                                                                                                                                                                    |
| K4  | (same pattern)                                                                    | `src/features/accounts/_components/profile-fields.tsx:130` | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | Same `FieldGroup.title` gap as K3.                                                                                                                                                                                                                                                                    |
| K5  | `Enter a valid 5-digit ZIP code`                                                  | `src/features/accounts/profile-schema.ts:21`               | craft: Prefer the specific fact            | `route:engineering` |                                                                     | Describes only the 5-digit case; the regex also accepts ZIP+4. Copy cannot fix a mismatch with the code.                                                                                                                                                                                              |

### Group A — marketing chrome + app shell

| #   | String                                                                                                                              | Location                                               | Tell / rule                             | Verdict           | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- | ----------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `Professional dog walking and house sitting across Colorado's Front Range. Reliable, caring pet care tailored to your dog's needs.` | `src/app/layout.tsx:35`                                | ai-tells: Promotional framing           | `route:copy-sync` |               | The default `<meta name="description">`. Sentence 1 is a plain fact (services + region); sentence 2 is adjectives only — "Reliable, caring... tailored" carries no checkable claim and would paste unchanged onto any competing pet-care business. Fixing it needs a real specific from Cal (a certification, a count, a named practice), not a wording change to what's already there. Same defect at A2, and duplicated (as JSON-LD `description`, out of scope) at `src/features/seo/business.ts:16`. |
| A2  | `Reliable dog walking and house sitting across Colorado's Front Range. Caring, dependable pet care tailored to your dog.`           | `src/app/(site)/(marketing)/page.tsx:93`               | ai-tells: Promotional framing           | `route:copy-sync` |               | Same construction as A1 (the home page's own meta description, not a shared render). Left for the same reason: no specific fact exists in the source to substitute for "dependable"/"tailored" without inventing one.                                                                                                                                                                                                                                                                                    |
| A3  | `Services coming soon — check back shortly.`                                                                                        | `src/app/(site)/(marketing)/services/page.tsx:271-273` | COMPONENT_SYSTEM: empty-state component | `route:component` |               | The sibling zero-state pages render through `EmptyState` (`gallery/page.tsx:54`, `reviews/page.tsx:61`); this one is a raw `<p>`, so it never picks up the shared empty-panel treatment (`COMPONENT_SYSTEM.md:78`). The copy is fine — fixing this is a component change, not a copy change.                                                                                                                                                                                                             |

### Group B — auth + onboarding

No entries flagged. 47 strings inspected, 42 in scope.

### Group C — client account area

One entry, added at the triage gate rather than by the group's own audit.

| #   | String                                      | Location                                                         | Tell / rule                  | Verdict             | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------- | ---------------------------------------------------------------- | ---------------------------- | ------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `Please try another slot (${result.kind}).` | `src/features/accounts/_components/meet-greet-scheduler.tsx:176` | craft: Say what happens next | `route:engineering` |               | A toast description that interpolates a raw internal discriminant — `result.kind` is a union tag, not prose — into text a client reads after a failed meet-greet booking. Same class as F1/F2/F4 and G4–G7: the leaking value is a variable, so no wording change fixes it. Surfaced during the Group C audit, judged as fitting no verdict cleanly, and registered here once the gate confirmed it belongs with the rest of the class. |

The rest of the group: 203 strings inspected, 188 in scope. Three flagged
strings living in this group's files were already settled in
`docs/content/voice/fixtures.md` and are recorded above under "Carried over
from calibration" rather than duplicated here: `K1`
(`src/app/(site)/(account)/account/forms/page.tsx:76`, `rewrite`), and `K3`/`K4`
(`src/features/accounts/_components/profile-fields.tsx:95` and `:130`, both
`route:component`). Four more strings on this surface — `No pets added yet.`,
`Messages you've sent to Cal. Mark one resolved once you no longer need a
reply.`, `Add or edit your pets. Name, species, breed, a photo, and any care
notes.`, and `Update your contact info. Email is managed through your login.`
— are likewise already approved as correct in `fixtures.md` and were left
alone on re-inspection, not re-flagged.

The 15 out-of-scope candidates were `aria-label`/`alt` mechanics duplicating
visible button or dialog text (`Filter by service`, `Filter by status`,
`Switch view`, `Cancel this booking`, `Prepay for this booking`, `${pet.name}
forms`, `Collapse pet details`, `Expand pet details`, `Selected pet photo`)
and developer-facing guard/exception strings unreachable through normal use
(`account-actions.ts`'s form-scope-mismatch and unknown-form-key messages,
`onboarding-action.ts`'s three thrown errors). The 63 intake-form hints in
`profile-fields.tsx` and `form-card.tsx` were read in full given this
surface's density; each states a specific fact (a field, a location, a
document) rather than an abstraction, so none were rewritten.

### Group D — booking flow UI

`BookingFlow` (`src/features/booking/_components/booking-flow.tsx`), its
`Scheduler.Legend`, and `quantity-forms.tsx`'s `KicheWelcomeRow` are the files
in this group actually shared between the client's `/book/[serviceSlug]` flow
and the admin book-on-behalf flow at `/admin/clients/[clientId]/book` —
`ServiceBookingClient` and `AdminCreateBookingClient` are separate components,
each with its own POV-correct copy already (e.g. the month-range intro reads
"your stay" for the client and "the stay" for admin, and the empty-price line
reads "your price" vs. "the price"). All three flagged rows below live in the
files that _are_ shared.

| #   | String                                                                     | Location                                                   | Tell / rule                                  | Verdict           | Proposed text                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `Your booking`                                                             | `src/features/booking/_components/booking-flow.tsx:456`    | craft: Match tense and person to the surface | `applied`         | `Booking summary`                                                       | This `h2` sits in the summary card rendered identically for all three booking surfaces (public create, admin create-on-behalf, edit — see this file's own docstring). "Your" is right for the client's own create/edit flow and wrong when an admin books for someone else, the same trap that fixed the distance-refusal string's subject as "Client". "Booking summary" costs nothing to invent: it already exists two lines up as this card's `aria-label`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D2  | `Your booking`                                                             | `src/features/booking/_components/scheduler/legend.tsx:45` | sibling precedent: `legend.tsx:72`           | `route:component` |                                                                         | Same admin-owns-someone-else's-booking problem as D1, but a wording swap doesn't fix it: `data.myBookings` is always an empty `Set` on the admin create-on-behalf flow (`use-admin-create-booking.ts:135`), so the dot this legend key describes can never appear there — it's a permanently-dead key, not just a mis-worded one. The sibling `Premium day` entry in this same `ENTRIES` list is already gated on `capabilities.premiumMarkable \|\| data.premiumDays?.size > 0` (lines 72-73); this entry needs the same conditional-render treatment, which is a component change.                                                                                                                                                                                                                                                                                                                  |
| D3  | `OK for Cal's dog Kiche to tag along. You'll get a discount if she joins.` | `src/features/booking/_components/quantity-forms.tsx:158`  | craft: Match tense and person to the surface | `applied`         | `OK for Cal's dog Kiche to tag along. A discount applies if she joins.` | `KicheWelcomeRow` is rendered by both `QuantityForm` consumers identically and unconditionally — `service-booking-client.tsx:258` and `admin-create-booking-client.tsx:194` both mount `<QuantityForm kiche={{ welcome: kicheWelcome, onChange: onKicheWelcomeChange }} />` with no surface branch. On the client surface "you" is the payer and the discount recipient; on the admin surface "you" is the admin, and the discount accrues to the client being booked for, not to the operator toggling the switch — the same ownership-of-benefit trap as D1, this time about a discount rather than a booking. The fix works the same way D1's did: drop the ownership claim rather than branch on surface. The proposed text keeps only the fact the source already states — a discount applies if Kiche joins — without naming who receives it, an amount, or a condition the code doesn't state. |

One other string in this group was flagged beyond D1 and D2 (see D3 above);
no others. 109 candidates inspected across
19 files, 12 out of scope, 97 in scope. Out-of-scope breakdown: `aria-label`s
duplicating adjacent visible text (`Is Kiche welcome on this booking`, `Add
leash manners training`, `Booking details`, `Close booking details`, `Price
estimate`, `Paint mode`, `Calendar legend`), the `StepShell` mechanic
`Booking summary` (the aria-label D1's proposed text reuses), one Tailwind
class string caught by the extractor alongside the `Your booking` legend
entry, one thrown invariant (`ContextDayButton must be rendered inside
MonthGrid`), and one stray code fragment the extractor mistook for a string
literal (`Math.abs(c - minuteFromTop)`).

Two strings already settled in `docs/content/voice/fixtures.md` recur in this
group's files and were left alone on re-inspection rather than re-flagged:
`No eligible pets yet. Add one to continue.`
(`src/features/booking/_components/pet-assignment.tsx:76`) and `We need to
sort out your account before you can book. Please get in touch and we'll
help.` (`src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx:394`).
`Anything Cal should know about this visit?` was inspected and left alone per
this task's brief — correct third-person POV, not a new finding. `Per cat,
including the first.`-style factual traps do not recur in this group's files.

The parallel status-label systems the brief warned about were checked and
hold: `Premium day` (`day-timeline.tsx` header badge and `legend.tsx` legend
key) match verbatim, and the two scheduler instruments' instructional
aria-labels (`day-painter.tsx`'s `Available ${…}. Drag to move; activate to
edit.` / `Remove availability ${…}`, `day-timeline.tsx`'s `Time selector for
${…}. Use arrow keys to move selection.`) follow one shared construction
rather than three independent ones, so none were rewritten in isolation.

### Group E — zod validation messages

No new entries flagged. 23 strings inspected, 23 in scope, 0 out of scope.
All 23 are `.min()`/`.regex()`/`.refine()` messages on `emergency-schema.ts`,
`home-access-schema.ts`, `owner-schema.ts`, `profile-schema.ts`, and
`reviews-schema.ts` — every one renders twice (inline under the field on the
client, and as the server-side error on the same schema), matching this
group's own hazard. Roughly twenty of them share the `X is required` /
`Enter a valid X` shape across the five files (emergency contact, vet, owner,
profile, and address fields); per this task's hazard and the blind round's
precedent on `A valid email is required` (`fixtures.md`), a flag here would
have to argue the whole set is wrong, and nothing about the set reads as
machine-written — each message is already the shortest correct statement of
the constraint. `Rating must be a whole number` / `at least 1` / `at most 5`
(`reviews-schema.ts`) and `Review text must be ${FIELD_LIMITS.note}
characters or fewer` are a second, equally minimal family; the last one
states its limit as a number, per craft's "prefer the specific fact."

One flagged string living in this group's files was already settled in
`docs/content/voice/fixtures.md` and is recorded above under "Carried over
from calibration" rather than duplicated here: `K5`
(`src/features/accounts/profile-schema.ts:21`, `route:engineering`). A
second string on the same file, `Full name is required`
(`profile-schema.ts:9`), is likewise already approved as correct in
`fixtures.md` and was left alone on re-inspection, not re-flagged.

`src/features/inquiries/inquiry-schema.ts` is not counted in this group,
despite belonging to it. The extractor's group rules are first-match-wins,
and `^src/features/inquiries/` matches before this group's schema rule, so
its four validation messages (`Name is required`, `Enter a valid email`,
`Phone is required`, `Message is required`, `inquiry-schema.ts:6-18`) were
routed to `G-admin` instead. That mislabels them: they render inline on the
**public** `/contact` page through `contact-form.tsx`, not on an admin
surface. They are counted and will be audited under `G-admin`'s numbers
when that group's pass runs, but they belong to Group E's `X is required` /
`Enter a valid X` family recorded above, so the same set-consistency rule
applies to them — a flag would have to argue the whole set is wrong, not one
member of it. No coverage numbers change here; the strings stay counted
where the extractor put them.

### Group F — server errors, refusals, toasts

`src/features/booking/booking-service-shared.ts` is the file this group's
brief calls out for the client/admin second-person trap: `K2`
(`booking-service-shared.ts:706`, carried over above) is the operative
refusal, and its sibling at line 701 — `Client is ${milesLabel} mi away
(beyond the ${…} mi cutoff).` — is the admin-warning variant K2's approved
rewrite was matched to. Both already read "Client," not "your location," so
neither surface breaks; nothing new to flag there. The file's other twelve
in-scope strings (onboarding-status / debt / profiles-incomplete warnings,
the pets-not-found and quantities-validation messages, the horizon/refuse
reasons, and `uuidLike`'s regex message `Invalid id`, `:139`, missed in an
earlier pass of this prose) are short, factual, and already in the
register's established register-family shape — none flagged. `Invalid id`
is a clean backstop: the file's own comment above `uuidLike` (`:130-133`)
notes these ids never come from user input, only from the auth session or
rows the server already owns, so the message is effectively unreachable in
practice, same as it would read if it ever did fire.

Two systemic findings, both about raw system error text reaching a real UI,
not about a single string's wording:

| #   | String                                                      | Location                                             | Tell / rule                  | Verdict           | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- | ----------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `Failed to load availability: ${windowsRes.error.message}`  | `src/features/booking/use-availability.ts:143`       | craft: Say what happens next | `fixed`           |               | Confirmed rendered, not dead code: `windowsError` flows through `use-booking-scheduler.ts` into `booking-flow.tsx:357-361`'s `<ErrorState title="Couldn't load availability" message={windowsError} />`, live on all three booking surfaces (public create, admin create, edit) — plus a fourth: `meet-greet-scheduler.tsx:69` destructures the same `useAvailability` hook's `error` and renders it through `<ErrorState>` at `meet-greet-scheduler.tsx:183-184`, live on the onboarding meet-greet step. Unlike the sibling toast in `src/components/form/submit-action.ts` ("Something went wrong. Please try again."), this message names no next step and appends the raw Supabase driver error verbatim to the user. This task's own hard constraint requires any `rewrite` to keep every interpolated value, so a wording-only fix would have to keep showing the raw driver text — the actual fix is code-side (log the driver error server-side, show a static message client-side), which is why this is routed rather than rewritten.                                                                                                                                                                                                                                                                                                                                                                           |
| F2  | `Failed to record payment: ${insertError.message}`          | `src/features/payments/create-intent.ts:183`         | craft: Say what happens next | `fixed`           |               | Same pattern as F1, confirmed live: `PrepayButton` (`.../account/bookings/_components/prepay-button.tsx:49`) renders `{error && <p ...>{error}</p>}` directly from this action's `result.error`. Only reachable after a booking's Stripe intent is minted but the DB insert of the `payments` row fails — a rare path, but the six sibling messages in this same file (`Booking not found.`, `You must be signed in.`, `This booking is already paid.`, etc.) are all clean, static, user-language strings; only this one and F1 interpolate a raw driver error. Same routing rationale as F1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F3  | `Per cat, including the first.`                             | `src/features/pricing/term-descriptions.ts:19`       |                              | `route:copy-sync` |               | This is the calibration's own "factual trap" (`fixtures.md`, "What calibration established"), independently reconfirmed here: `evaluate.ts`'s `unitCount()` counts a `flat_per_unit` "cat" modifier as `cats` (all cats, first included) only when a dog is present as the base pet, and as `cats - 1` (first cat excluded) on a cats-only booking — matching `docs/superpowers/plans/2026-06-18-pricing-engine-core.md:195`'s own statement of the rule ("counts ALL cats when a dog is base, else cats−1"). `Per cat, including the first.` is right for a mixed household and wrong for a cats-only one. Confirmed customer-facing: `pricingBreakdown()` (`display.ts`) attaches it as a tooltip on the public `/services` page. `Per dog, including the first.` (same file, line 20) was checked against the same code path and left alone: the design doc and the seed configs (`docs/superpowers/plans/2026-06-18-pricing-engine-core.md:174`) show `dog` is priced via `tiered_per_unit`, never `flat_per_unit`, so this key's own `termKeyForModifier` mapping is very likely never reached in practice — no defect to report, and fixtures.md's silence on it during calibration is consistent with that. Neither string was rewritten: the standard forbids correcting a fact it can't verify from first principles, and this one needs the `TERM_DESCRIPTIONS` owner's decision, same as fixtures.md concluded. |
| F4  | `parseResult.error.message` (zod's serialized issues array) | `src/features/booking/booking-service-shared.ts:506` | craft: Say what happens next | `fixed`           |               | `computeBookingArtifacts` returns `{ kind: "validation_error", message: parseResult.error.message }` on a failed `createBookingInputSchema.safeParse`. In zod v4, `error.message` is not a sentence — it is the `JSON.stringify`d issues array, carrying each failure's `code`, `path`, and (for regex failures) `pattern`. Confirmed unmodified passthrough at `create-core.ts:74-76` and `edit-core.ts:215-216` / `edit-core.ts:361-362`, then rendered with no wrapping text at three surfaces: the booking toast (`.../book/_components/messages.ts:79-80`, `text: result.message`), the edit flow's error banner (`.../account/bookings/[id]/edit/_components/use-edit-booking.ts:336` and `:398`, `setErrorMsg(result.message)`), and the admin book-on-behalf flow (`.../admin/clients/[clientId]/book/_components/use-admin-create-booking.ts:250`, `setErrorMsg(result.message)`). No wording change can fix this: the leaking value is a variable carrying structured JSON, not a string this register can edit — the fix is code-side (catch the parse failure and substitute a static, field-aware message before it leaves `computeBookingArtifacts`).                                                                                                                                                                                                                                                        |

No `rewrite`-verdict rows were produced in either group this pass, so this
task's Step 3 test-coupling grep (run against every `rewrite` row) had
nothing new to run; K2 above already carries its `tests:` result.

Out-of-scope breakdown (66 of 163): the whole of
`src/features/booking/booking-repository.ts` (37 — thrown `Error`s from a
repository layer plus two Supabase select-list literals, none ever reach a
caller outside the action/core layer that already converts them to typed
results); `booking-service-shared.ts`'s own `Unknown pricingType: ${…}` and
`endsAt must be after startsAt` (2 — an exhaustiveness backstop and a
schema-level guard on server-trusted ids the client never edits directly,
per that schema's own comment; the client-facing date-order message is
`calendar-model.ts`'s `Check-out must be at least one night after
check-in.`, already in scope and clean); `recurrence.ts` (2) and
`scheduler-context.tsx` (1)'s thrown invariants; `state-machine.ts` (5 —
returned but never UI-routed; the FSM's own docstring calls these
for-callers-to-log guards, and the booking UI never issues an invalid
transition in normal use); `series-cron.ts` (7 — `console.error`-prefixed
cron logs) and `mutations/create-booking.mutation.ts` (1, same);
`service-card-display.ts`'s `Unknown pricingType: ${…}` (1, same
exhaustiveness pattern); `payments/stripe-gateway.ts`'s missing-env-var
throw (1, a developer setup instruction); all of
`payments/webhook-core.ts` (7 — server-to-server Stripe webhook responses,
verified via `src/app/api/webhooks/stripe/route.ts`, never rendered to a
person). Two more were confirmed dead rather than merely unlikely:
`use-busy-ranges.ts`'s `Failed to load availability.` and
`use-overnight-nights.ts`'s `Failed to load overnight nights: ${…}` (1 each)
— both hooks' `error` field is destructured by zero callers (checked every
call site), unlike `useAvailability`'s, which is live (see F1). Close call,
not flagged: `admin-actions-core.ts`'s `Cannot change the Kiche discount on
a ${booking.status} booking.` and `Booking has no stored quote to
re-price.` interpolate a DB enum value and describe an admin-only edge
case respectively, but both read as plain English rather than raw driver
text, so they were left in-scope and clean rather than routed like F1/F2.

### Group G — admin surfaces

**Admin pages**

Scope: `src/app/(site)/(admin)/**`, 34 files, 245 of the group's 338
candidates — the first half of Group G (see the coverage table's note above).
The remaining 93 candidates, under `src/features/admin/**` and
`src/features/inquiries/**`, are the next task's scope; this section does not
speak to them. 20 out of scope, 225 in scope, 3 flagged.

The five strings this task's brief names as already approved and not to be
re-flagged were checked on re-inspection rather than skipped. Four live on
this half's surface and stand as approved: `No inquiries yet.` and `This
clears it from your open queue. You can still find it under the Resolved
filter. This can't be undone.` (both
`src/app/(site)/(admin)/admin/inquiries/_components/inquiries-client.tsx`),
`Create a record for an offline client. They claim the account later.`
(`src/app/(site)/(admin)/admin/clients/new/page.tsx:11`), and `Approve, edit,
or cancel right from the row.`
(`src/app/(site)/(admin)/admin/bookings/page.tsx:35`). The fifth,
`Approve before the visit?`, lives in
`src/features/admin/_components/onboarding-status-select.tsx:64` —
`src/features/admin/**`, not this half's scope — so it is out of reach here
and stays for the next task to re-confirm.

The first two findings below (G1, G2) are the same defect recurring at two
call sites, found by reading the code around a literal the extraction did
surface (the Method
section's noted blind spot: a message assembled at runtime from a variable is
invisible to a literal-based extractor). Both admin surfaces run a generic
mutation (approve/decline/cancel/waive/settle/adjust) through a local `run()`
helper whose failure branch shows the result's `kind` tag. Two sibling files
on this same admin surface —
`src/app/(site)/(admin)/admin/settings/_components/settings-client.tsx:178-182`
and `src/app/(site)/(admin)/admin/reviews/_components/reviews-client.tsx:104-108`
— already guard this correctly (`"message" in result ? result.message : ...`),
and `admin-kiche-control.tsx`'s own `errorMessage` mapper
(`:142-155`) goes further, naming a specific sentence per failure kind. The
two flagged files skip that guard, so a `validation_error` or `error` result
— both of which carry a real `message` string on `ApprovalResult` and
`CancelBookingResult` (`src/features/admin/approval-actions.ts:64-69`,
`src/features/booking/cancel-core.ts:18-22`) — surfaces only the bare kind
("Action failed: validation_error") to Cal, discarding the specific fact the
code already had. No wording fix can restore dropped data without inventing
text; the fix is the code-side guard already proven two files over.

| #   | String                                         | Location                                                                                   | Tell / rule                                          | Verdict             | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `Action failed: ${result.kind}`                | `src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx:525`       | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | This surface's `run()` wraps approve/decline/cancel and always shows the bare `kind` on failure, even for `validation_error`/`error` results that carry a real `message`. `settings-client.tsx:178-182` and `reviews-client.tsx:104-108` already check `"message" in result` first; this file skips that guard. Fix is code-side — see the shared note above and G2 (same defect, different file).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G2  | `Action failed: ${result.kind}`                | `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx:155` | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | Same defect as G1 in this surface's own `run()` (approve/decline/cancel/waive/settle/adjust all route through it). No `"message" in result` guard, so a `validation_error`/`error` result's real message is discarded in favor of the bare kind. Fix is code-side; see G1 for the sibling files that already guard correctly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| G3  | `The client is refunded in full and notified.` | `src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx:538`       | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | Splits into two claims. "Refunded in full" is code-backed: the admin cancel path forces `fullRefund: true` (`src/features/booking/actions.ts:136`, admin branch). "Notified" is not: `src/features/notifications/notifier.ts:7` documents `booking_cancelled` as intentionally omitted from the `NotificationEvent` vocabulary; `cancelBooking` (`src/features/booking/actions.ts:136`) and `cancelBookingCore` never construct or call a `Notifier`; the app's only two `ResendNotifier` instantiations are `actions.ts:77` (fires on `createBooking`) and `src/features/admin/approval-actions.ts:229` (fires on approval's `booking_confirmed`) — neither is reachable from a cancel. The Stripe refund call itself (`src/features/payments/stripe-gateway.ts:62`) passes no `receipt_email`. One caveat the reviewer could not settle from the code: Stripe's dashboard can be configured to email customers on a refund, a merchant-account setting invisible from this repo — that would not make the app's own copy code-backed, but it means the client may in fact receive something, so this is not a claim that the client is never notified. Same class as K5/F3: copy states a fact the code does not perform. The standard forbids correcting a fact as much as inventing one, so this needs a decision from whoever owns the notification vocabulary — build the notice or drop the claim — not a wording change. |

G3 is a different kind of finding: not a dropped-message guard gap like G1/G2,
but a copy claim the code only half backs. This surface's cancel-confirm
dialog was initially set alongside `client-detail-client.tsx`'s own
cancel-confirm text ("This cancels the booking per the refund policy.") as a
pair where "both are true and neither is a tell" — a comparison made without
tracing the notification path. Once traced, the "refunded" half held and the
"notified" half did not, so this row replaces that comparison rather than
sitting beside it as a second close call.

Out-of-scope breakdown (20 of 245): landmark/mechanic `aria-label`s naming a
region or control for screen readers rather than duplicating rendered prose —
`Today's bookings` (`today-timeline.tsx:60`), `Selected day availability`
(`availability-client.tsx:584`), `Filter by service`, `Filter by status`,
`Search client`, `Switch view` (`bookings-calendar-client.tsx:639`, `:621`,
`:656`, `:664`), `Price estimate` (`admin-create-booking-client.tsx:234`, an
`sr-only` heading — the same landmark pattern Group D already found
out-of-scope on the public booking surface), `Apply Kiche discount to this
booking` (`admin-kiche-control.tsx:133`), `Filter clients`, `Search clients`,
`View ${…}` (`clients-index-client.tsx:132`, `:126`, `:184`/`:258`), `${…}
out of 5 stars`, `Filter reviews by status`, `Search reviews`
(`reviews-client.tsx:31`, `:154`, `:148`), and `Requires approval`
(`service-edit-form.tsx:183`, duplicating the adjacent visible label
verbatim). Two Tailwind class template strings the extractor mistook for
prose (`booking-row.tsx:129`, `client-detail-client.tsx:356`) and one
`block truncate` fragment (`clients-index-client.tsx:204`). One `rel`
attribute value, `noopener noreferrer` (`client-detail-client.tsx:441`). One
data comparison constant, `Meet & Greet` (`client-detail-client.tsx:173`,
matched against a service name to find the onboarding booking — never itself
rendered).

Close calls, not flagged: a handful of "Could not X" error strings
(`clients/[clientId]/book/page.tsx:107`, the identical string at
`bookings/[bookingId]/edit/page.tsx:105`, and
`inquiries-client.tsx:42`'s `Could not update the inquiry.`) sit against a
much larger sibling family that contracts the same construction
("Couldn't load bookings", "Couldn't load clients", "Couldn't save:
${…}", "Couldn't generate a link", and the seven-plus `Couldn't load this` /
`Couldn't load inquiries` error-state titles elsewhere on this same surface).
`admin-kiche-control.tsx`'s own `errorMessage` mixes registers the same way
in one function — `"The client hasn't marked..."` and `"This service doesn't
offer..."` contract, `"This booking could not be found."` doesn't. No
heading in `ai-tells.md` or `craft.md` names contraction consistency, so
nothing was flagged, but the pattern recurs enough (four instances) that a
maintainer may want to standardize it. Also not flagged for the same
reason: `services-client.tsx:37`'s `Saved!` is the only exclamation mark
among a dozen sibling success confirmations on this surface (`Client
created`, `Booking created`, `Debit adjusted`, `Marked resolved`, and
others), all otherwise flat.

A third close call, for a different reason: `settings-client.tsx:353`'s
field label `Hard cutoff — refuse bookings beyond` is the only one of this
settings form's roughly dozen field labels carrying a name-prefix ahead of
its description. That reads like the odd one out in a parallel labelling
system, which is this group's own named hazard — but the hazard is scoped to
table headers, column labels, filter chips, and status badges, and a
settings-form field label is none of those, so it doesn't reach here. Left
unflagged for want of a named tell, same as the two items above it, not
because "Hard cutoff" is precedented elsewhere: the only other place that
phrase appears is the string K2 replaced, and K2's approved rewrite
(`fixtures.md`) folded it into a lower-case "cutoff" inside a sentence
precisely to move away from the standalone term, so it cannot argue for
keeping it here.

**Admin features + inquiries**

Scope: `src/features/admin/**` (14 files, 72 candidates) and
`src/features/inquiries/**` (6 files, 21 candidates) — the remaining 93 of
the group's 338 candidates. 37 out of scope, 56 in scope, 4 flagged.

Two strings this task's brief names as already settled were re-inspected
rather than skipped. `Approve before the visit?`
(`src/features/admin/_components/onboarding-status-select.tsx:64`) fell to
this task because the admin-pages half's scope stopped at
`src/app/(site)/(admin)/**`; re-opened here, it is still the confirm-dialog
title `fixtures.md` approved, and stands unchanged. `A valid email is
required` (`src/features/admin/create-client-actions.ts:30`) is the blind
round's own carried-over zod message, native to this task's scope rather
than merely recurring in it; re-confirmed live via `NewClientForm`'s `case
"validation_error": return { ok: false, message: result.message };`
(`new-client-form.tsx:98`), and left exactly as the blind round found it.

`src/features/inquiries/inquiry-schema.ts`'s four strings (`Name is
required`, `Enter a valid email`, `Phone is required`, `Message is
required`) are the ones Group E's own section already named as mislabeled
into this group by the extractor's first-match-wins rule. They render on the
public `/contact` page through `contact-form.tsx`, not on any admin surface,
and belong to Group E's `X is required` / `Enter a valid X` family; the same
set-consistency rule applies, so they were not flagged here either — this
section only confirms the re-inspection Group E's text promised.

This task's third hazard warned that `src/features/admin/pricing-config-fields.ts`'s
labels feed the admin pricing editor, and that a label rename there is
`route:copy-sync`, not `rewrite`, because Cal edits some of these labels
directly per `docs/content/pricing-language-drafts.md` §2. None of this
file's 19 candidates needed a rename to trigger that routing: the static
labels (`Base rate (per hour)`, `Minimum charge`, `Max dogs`, `Slot
interval`, `Soft distance warning (mi)`, and siblings) and the interpolated
ones (`Each ${…}`, `Each extra ${…} (from ${…})`, the free-units/per-unit
pair built from `mod.label`) are all minimal, specific noun phrases with no
tell, and the validation messages (`Enter a value.`, `Must be at least $`&#8203;`${…}.`, and siblings) match this register's established zod-message family
and render inline via `pricing-fields-editor.tsx`'s `errors[f.path]`. The
§2 renames themselves (`Premium night` → `Holiday & peak-date rate`, `Needy
pet care` → `Extra-attention care`) are per-service `mod.label` values Cal
edits in the live editor, not literals in this file, so they never surfaced
as candidates here. The one out-of-scope string in this file, `Unknown
pricing field path: ${…}`, is a thrown invariant the file's own docstring
calls "a bug, not a silent no-op."

Two new instances of the pass's own noted blind spot (Method: a message
assembled at runtime from a variable is invisible to the extractor) turned
up in this scope — one of G1/G2's discard shape, and two of F1/F2/F4's raw-
driver-text shape — each confirmed live by tracing every consumer rather
than assumed:

| #   | String                                                                   | Location                                                         | Tell / rule                                          | Verdict             | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- | ------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G4  | `Couldn't update status`                                                 | `src/features/admin/_components/onboarding-status-select.tsx:79` | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | Same defect as G1/G2, found the same way — by reading the failure branch around this literal title. `setOnboardingStatus`'s `ClientMutationResult` carries a real `message` on both failure kinds (`Invalid client id` / `Invalid onboarding status` on `validation_error`, `clients-actions.ts:402,525,529`; the driver error on `error`, `:536`), but this toast's `description` is set to the bare `result.kind` literal (`:79`) instead of that message, so Cal sees the word "validation_error" or "error," never the actual reason. Confirmed this file is the sole caller of `setOnboardingStatus` (repo-wide search: only `clients-actions.ts` and this file reference it). Fix is code-side, same as G1/G2: guard on `"message" in result` before falling back to `kind`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G5  | `Could not create the account.`                                          | `src/features/admin/create-client-actions.ts:102`                | craft: Say what happens next                         | `route:engineering` |               | Same blind-spot class as F1/F2/F4. `const msg = createErr?.message ?? "Could not create the account.";` — the static fallback only fires when Supabase's error object carries no `.message`; any other `admin.createUser` failure (e.g. a non-duplicate-email rejection) ships the raw driver text instead. Confirmed live: `NewClientForm.submit`'s `case "error": return { ok: false, message: result.message };` (`new-client-form.tsx:99-100`) is rendered verbatim by `FormRootError` (`form.tsx:53`). A second, unguarded leak sits four lines later in the same function — `profileErr.message` (`:139`) has no fallback text at all and reaches the same field. Contrast, confirmed by tracing rather than assumed: `generateClaimLinkCore`'s near-identical `error?.message ?? "Could not generate a link."` (`:203`) does _not_ leak — its only consumer, `account-claim-panel.tsx`, discards `result.message` entirely on every non-success kind in favor of a static "Please try again." Fix is code-side, matching F1/F2/F4's remedy.                                                                                                                                                                                                                                                                                                                                                              |
| G6  | `Insert failed.`                                                         | `src/features/admin/onbehalf-actions.ts:103`                     | craft: Say what happens next                         | `route:engineering` |               | Same class, on the admin's per-client pet/forms editor. `error?.message ?? "Insert failed."` in `adminCreatePetCore` only shows this text when Supabase's error is empty; a real failure ships raw driver text. Confirmed live via `PetForm.savePet` (`pet-form.tsx:124-151`), which returns any non-success `create`/`update`/`uploadPhoto` result's `message` straight into `FormRootError`, wired at `client-detail-client.tsx:177-196`'s `adminPetActions`, whose `create` branch forwards `adminCreatePetCore`'s result unchanged except for `forbidden`. (`PetList`'s own `onDelete` error path (`pet-list.tsx:88`, rendered `:179`/`:188`) is not reachable from admin: the admin zone's sole `PetList` call site, `client-detail-client.tsx:278-284`, passes no `onDelete`, so the Delete button — and this path — never renders there.) Six sibling branches in this same file carry the identical unguarded pattern, several with no fallback text at all — `adminUpdatePetCore` (`:167`), `adminSubmitFormCore`'s pet-lookup and write branches (`:250`, `:270`, `:283`, `:297`), and `adminUploadPetPhotoCore`'s upload and photo-url-update branches (`:361`, `:372`) — all confirmed reachable the same way, through `PetForm`/`FormCard`'s generic `result.message` display (`form-card.tsx:289`). Fix is code-side: substitute a static, field-aware message before the error leaves each core. |
| G7  | `You just sent a message - please wait a moment before sending another.` | `src/features/inquiries/inquiry-actions.ts:112`                  | craft: Say what happens next                         | `route:engineering` |               | The public `/contact` page's own instance of the class — the only one in this scope reaching a signed-out, non-admin reader. This flagged string is itself clean; the defect is the two neighboring raw-driver branches in the same function, found by reading around it. `submitInquiryCore`'s rate-limit check forwards `countError.message` (`:107`) as `r.error` if the count query itself fails, and the insert two lines later does the same with `error.message` (`:125`). Confirmed live via `contact-form.tsx:133-134`'s `return r.ok ? { ok: true } : { ok: false, message: r.error };`, rendered by the same `FormRootError` as G5. Fix is code-side, same remedy as F1/F2/F4/G5/G6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Out-of-scope breakdown (37 of 93): the whole of
`src/features/admin/availability-actions.ts` (12) — every validation/error
message in this file is either returned by a wrapper (`createWindow`,
`trimWindow`, `deleteWindow`, `listWindows`) that no page or component calls
anywhere in the app (confirmed by a repo-wide search), or reachable only
through `availability-client.tsx`'s callbacks, which fire the real server
action inside `startTransition` and then return a hardcoded success (or a
fixed conflict/success fallback) regardless of what the action actually
returned — the same returned-but-never-UI-routed pattern this register
already established for `state-machine.ts` and the two dead hooks in Group
F. The identical discard, confirmed the same way, applies to
`overnight-actions.ts`'s two strings and `premium-days-actions.ts`'s one,
both consumed by the same `availability-client.tsx` callbacks.
`approval-actions.ts`'s `Unexpected booking row shape: ${…}` is doubly dead:
`listPendingBookings` has no caller anywhere in the app (confirmed by a
repo-wide search), and the string is a DB-shape invariant besides; its
sibling `console.error`-prefixed log in the same file matches the dev-log
pattern already established for `series-cron.ts`. The same DB-shape-
invariant reasoning — not the dead-caller reasoning — covers
`reviews-actions.ts`'s `Unexpected review row shape: ${…}`,
`services-actions.ts`'s `Unexpected service row shape: ${…}`, and
`settings-actions.ts`'s `Unexpected settings row shape: ${…}`: each is
live-called, but every consuming page (`reviews/page.tsx`, `services/page.tsx`,
`settings/page.tsx`, and the dashboard's `listReviews()` call in
`admin/page.tsx`) already substitutes a static `ErrorState` message (or
silently defaults to zero) on any `kind: "error"` result rather than
rendering it, confirmed by reading each page. `create-client-actions.ts`'s
duplicate-email substring matches (`already been registered`, `already
registered`) are matched against Supabase's own error text and never
displayed; its `Client has no email.` and `Could not generate a link.` look
like G5's leak class but are confirmed dead the same way G5's contrast
paragraph describes. `onbehalf-actions.ts`'s two form-scope-mismatch
messages and its `Unknown form key: ${…}` mirror the identical guard shape
Group C already ruled out-of-scope in `account-actions.ts` — `FormCard`
always passes a matching scope in normal use. `clients-actions.ts`'s `Meet &
Greet` is the same never-rendered service-name comparison constant the
admin-pages half already found reused at `client-detail-client.tsx:173`, and
its Supabase select-list literal is excluded on the same grounds as every
other select list in this register. `inquiry-actions.ts`'s `Bad inquiry
row.` and `Bad inquiry row: ${…}` are the same DB-shape-invariant class as
the three "Unexpected X row shape" strings above. `inquiry-list.tsx`'s two
`aria-label`s and `inquiry-card.tsx`'s one duplicate rendered or placeholder
text, the same landmark-mechanic pattern established in Groups C, D, and G's
admin-pages half. `pricing-config-fields.ts`'s one thrown invariant is
covered above.

`clients-actions.ts`'s four validation messages (`Invalid client id`,
`Invalid debit id`, `Invalid onboarding status`, `Amount must be a positive
whole number of cents`) are in scope and clean on their own wording, but
none currently reaches Cal as written: `settleDebit`/`waiveDebit`/`adjustDebit`
all route through `client-detail-client.tsx`'s `run()` (G2's own bug), and
`setOnboardingStatus` routes through G4's bug above. Their proper display is
blocked by a call-site defect already flagged once each (G2, G4), not by
anything wrong with these four strings, so they were not re-flagged.

Close calls, not flagged: `onbehalf-actions.ts`'s `Insert failed.` and
`Pet not found.` and `inquiry-actions.ts`'s `This inquiry can no longer be
edited.` are all short "X failed"/"X not found" fragments with no named
next step, but `craft.md`'s "say what happens next" check is aimed at
states with a real recovery action to name, and these are rare, already-
terse edge cases matching this register's accepted convention for messages
like `Booking has no stored quote to re-price.` (Group F) — left in scope
and clean. The spaced hyphen in `You just sent a message - please wait...`
(`inquiry-actions.ts`) recurs identically in `reply-draft.ts`'s `Thanks for
reaching out -`; `ai-tells.md` has no entry for dash style, and two
instances sharing one unusual construction reads as a house convention
rather than a tic, so neither was flagged. `reply-draft.ts`'s three strings
are Cal's own outgoing reply draft (a mailto/sms pre-fill he completes
before sending), correctly first person throughout ("Thanks for reaching
out") rather than third-person system copy about him — checked against
`docs/CONTENT.md`'s POV rule and left alone, not flagged.

A fourth close call, named by this task's own brief rather than found during
the pass: `settings-actions.ts:140`'s `No fields to update` was flagged in
the hazards as "needs the call site checked before deciding" and had not
been recorded either way. Traced: `updateSettingsCore` returns this
`validation_error` message only when `settingsUpdateSchema.safeParse`'s
result has zero keys; its sole caller, `settings-client.tsx`'s `handleSave`
(`:141-184`), always builds and submits every settings field on every save —
there is no conditional field inclusion in the UI — so an empty update
object is realistically unreachable through normal use. Unlike the
discard-class bugs above (G1, G2, G4), this call site is correctly guarded:
`settings-client.tsx:178-181` checks `"message" in result` before falling
back to the bare `kind`, so even if this branch did fire, its message would
reach Cal intact rather than being discarded. Left unflagged: the string is
accurate and the path to it is dead in current use; what needed recording
was that check, not a change.

A fifth, unrelated to the raw-driver-text class above:
`inquiry-detail-dialog.tsx:162`'s `Cal replied` status label renders on both
`/admin/inquiries` and `/account/inquiries` — `InquiryList` (which mounts
`InquiryDetailDialog`) is the shared component behind both
`inquiries-client.tsx` and `account-inquiries-client.tsx`. Applying the
dual-surface test: on the client's own page the third person reads
naturally; on Cal's own queue it names him for his own action. That is not,
however, the same trap as D1/D2/D3 — those broke because the claim itself
("your booking", "you'll get a discount") became false depending on which
surface's reader "you" resolved to. "Cal replied" makes no such
surface-dependent claim: it is either true or false independent of who is
looking at it, so there is no wrong-POV reading on either surface, only a
self-referential one on the admin side. The sibling `InquiryCard` badge
sidesteps the question with a neutral lowercase `replied`, which is
arguably tidier, but a status label naming a real, verifiable actor and
shown back to that actor (e.g. "assigned to Alex" shown to Alex) is a
common and defensible pattern, not a tell named in `ai-tells.md` or
`craft.md`. Left unflagged, not added as a row: this is a judgment call
recorded for the maintainer, not a confirmed defect.

---

_Last reviewed: 2026-07-23_
