# Copy register — cleanup pass

> Audit of every user-visible non-Cal string against the `writing-in-voice`
> standard. Started 2026-07-23. Standard:
> `~/.claude/skills/writing-in-voice/`. Approved judgements and the calibration
> history live in `docs/content/voice/fixtures.md`.

The standard is conservative by design: across the 22 strings of calibration it
changed 2. This register is expected to be short. A long one means the audit
drifted into taste, not that the site is badly written.

## Method

Candidate strings were extracted mechanically from `src/**/*.{ts,tsx}`: every
string literal, template literal, and JSX text node outside a comment, filtered
to drop URLs, slugs, Tailwind class strings, `use client` directives, Supabase
select lists, and snake_case identifiers. The filter over-collects on purpose —
an auditor can reject noise, but a string that never reached the list never got
looked at.

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
| `C-account`    | Client account area             | 32    | 203        | 15           | 188      | 3       |
| `D-booking`    | Booking flow UI                 | 19    | 109        | 12           | 97       | 3       |
| `E-validation` | zod validation messages         | 5     | 23         | 0            | 23       | 1       |
| `F-feedback`   | Server errors, refusals, toasts | 32    | 163        | 66           | 97       | 5       |
| `G-admin`      | Admin surfaces                  | 54    | 338        | 20\*         | 225\*    | 2\*     |

\* Partial — this row covers only the 245 of 338 `G-admin` candidates that
live under `src/app/(site)/(admin)/**` (34 files). The remaining 93, under
`src/features/admin/**` and `src/features/inquiries/**`, are the next task's
scope and will complete this row.

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
| K1  | `Keep these up to date and don't worry, these forms are confidential and secure.` | `src/app/(site)/(account)/account/forms/page.tsx:76`       | craft: Cut words that don't change meaning | `rewrite`           | `Keep these up to date. They're confidential and secure.`           | Approved in fixtures. Splits a comma splice; "don't worry" told the reader how to feel instead of stating the fact.                                                                                                                                                                                   |
| K2  | `Client location is too far (${…} mi). Hard cutoff is ${…} mi.`                   | `src/features/booking/booking-service-shared.ts:706`       | craft: Vary sentence length                | `rewrite`           | `Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.` | Approved in fixtures. Matches the sibling warning at line 701. Subject stays "Client" — admin also reads this. tests: none (grepped `Hard cutoff` / `Client location is too far` / `mi away` under `src/**/*.test.{ts,tsx}`; only source and a settings-UI label match, no test asserts this string). |
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

No new entries flagged. 203 strings inspected, 188 in scope. Three flagged
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

| #   | String                                                                     | Location                                                   | Tell / rule                                       | Verdict           | Proposed text                                                           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `Your booking`                                                             | `src/features/booking/_components/booking-flow.tsx:456`    | craft: Match tense and person to the surface      | `rewrite`         | `Booking summary`                                                       | This `h2` sits in the summary card rendered identically for all three booking surfaces (public create, admin create-on-behalf, edit — see this file's own docstring). "Your" is right for the client's own create/edit flow and wrong when an admin books for someone else, the same trap that fixed the distance-refusal string's subject as "Client". "Booking summary" costs nothing to invent: it already exists two lines up as this card's `aria-label`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D2  | `Your booking`                                                             | `src/features/booking/_components/scheduler/legend.tsx:45` | COMPONENT_SYSTEM: capability-gated legend entries | `route:component` |                                                                         | Same admin-owns-someone-else's-booking problem as D1, but a wording swap doesn't fix it: `data.myBookings` is always an empty `Set` on the admin create-on-behalf flow (`use-admin-create-booking.ts:135`), so the dot this legend key describes can never appear there — it's a permanently-dead key, not just a mis-worded one. The sibling `Premium day` entry in this same `ENTRIES` list is already gated on `capabilities.premiumMarkable \|\| data.premiumDays?.size > 0` (lines 72-73); this entry needs the same conditional-render treatment, which is a component change.                                                                                                                                                                                                                                                                                                                  |
| D3  | `OK for Cal's dog Kiche to tag along. You'll get a discount if she joins.` | `src/features/booking/_components/quantity-forms.tsx:158`  | craft: Match tense and person to the surface      | `rewrite`         | `OK for Cal's dog Kiche to tag along. A discount applies if she joins.` | `KicheWelcomeRow` is rendered by both `QuantityForm` consumers identically and unconditionally — `service-booking-client.tsx:258` and `admin-create-booking-client.tsx:194` both mount `<QuantityForm kiche={{ welcome: kicheWelcome, onChange: onKicheWelcomeChange }} />` with no surface branch. On the client surface "you" is the payer and the discount recipient; on the admin surface "you" is the admin, and the discount accrues to the client being booked for, not to the operator toggling the switch — the same ownership-of-benefit trap as D1, this time about a discount rather than a booking. The fix works the same way D1's did: drop the ownership claim rather than branch on surface. The proposed text keeps only the fact the source already states — a discount applies if Kiche joins — without naming who receives it, an amount, or a condition the code doesn't state. |

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

| #   | String                                                      | Location                                             | Tell / rule                  | Verdict             | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------- | ---------------------------------------------------- | ---------------------------- | ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `Failed to load availability: ${windowsRes.error.message}`  | `src/features/booking/use-availability.ts:143`       | craft: Say what happens next | `route:engineering` |               | Confirmed rendered, not dead code: `windowsError` flows through `use-booking-scheduler.ts` into `booking-flow.tsx:357-361`'s `<ErrorState title="Couldn't load availability" message={windowsError} />`, live on all three booking surfaces (public create, admin create, edit) — plus a fourth: `meet-greet-scheduler.tsx:69` destructures the same `useAvailability` hook's `error` and renders it through `<ErrorState>` at `meet-greet-scheduler.tsx:183-184`, live on the onboarding meet-greet step. Unlike the sibling toast in `src/components/form/submit-action.ts` ("Something went wrong. Please try again."), this message names no next step and appends the raw Supabase driver error verbatim to the user. This task's own hard constraint requires any `rewrite` to keep every interpolated value, so a wording-only fix would have to keep showing the raw driver text — the actual fix is code-side (log the driver error server-side, show a static message client-side), which is why this is routed rather than rewritten.                                                                                                                                                                                                                                                                                                                                                                           |
| F2  | `Failed to record payment: ${insertError.message}`          | `src/features/payments/create-intent.ts:183`         | craft: Say what happens next | `route:engineering` |               | Same pattern as F1, confirmed live: `PrepayButton` (`.../account/bookings/_components/prepay-button.tsx:49`) renders `{error && <p ...>{error}</p>}` directly from this action's `result.error`. Only reachable after a booking's Stripe intent is minted but the DB insert of the `payments` row fails — a rare path, but the six sibling messages in this same file (`Booking not found.`, `You must be signed in.`, `This booking is already paid.`, etc.) are all clean, static, user-language strings; only this one and F1 interpolate a raw driver error. Same routing rationale as F1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| F3  | `Per cat, including the first.`                             | `src/features/pricing/term-descriptions.ts:19`       |                              | `route:copy-sync`   |               | This is the calibration's own "factual trap" (`fixtures.md`, "What calibration established"), independently reconfirmed here: `evaluate.ts`'s `unitCount()` counts a `flat_per_unit` "cat" modifier as `cats` (all cats, first included) only when a dog is present as the base pet, and as `cats - 1` (first cat excluded) on a cats-only booking — matching `docs/superpowers/plans/2026-06-18-pricing-engine-core.md:195`'s own statement of the rule ("counts ALL cats when a dog is base, else cats−1"). `Per cat, including the first.` is right for a mixed household and wrong for a cats-only one. Confirmed customer-facing: `pricingBreakdown()` (`display.ts`) attaches it as a tooltip on the public `/services` page. `Per dog, including the first.` (same file, line 20) was checked against the same code path and left alone: the design doc and the seed configs (`docs/superpowers/plans/2026-06-18-pricing-engine-core.md:174`) show `dog` is priced via `tiered_per_unit`, never `flat_per_unit`, so this key's own `termKeyForModifier` mapping is very likely never reached in practice — no defect to report, and fixtures.md's silence on it during calibration is consistent with that. Neither string was rewritten: the standard forbids correcting a fact it can't verify from first principles, and this one needs the `TERM_DESCRIPTIONS` owner's decision, same as fixtures.md concluded. |
| F4  | `parseResult.error.message` (zod's serialized issues array) | `src/features/booking/booking-service-shared.ts:506` | craft: Say what happens next | `route:engineering` |               | `computeBookingArtifacts` returns `{ kind: "validation_error", message: parseResult.error.message }` on a failed `createBookingInputSchema.safeParse`. In zod v4, `error.message` is not a sentence — it is the `JSON.stringify`d issues array, carrying each failure's `code`, `path`, and (for regex failures) `pattern`. Confirmed unmodified passthrough at `create-core.ts:74-76` and `edit-core.ts:215-216` / `edit-core.ts:361-362`, then rendered with no wrapping text at three surfaces: the booking toast (`.../book/_components/messages.ts:79-80`, `text: result.message`), the edit flow's error banner (`.../account/bookings/[id]/edit/_components/use-edit-booking.ts:336` and `:398`, `setErrorMsg(result.message)`), and the admin book-on-behalf flow (`.../admin/clients/[clientId]/book/_components/use-admin-create-booking.ts:250`, `setErrorMsg(result.message)`). No wording change can fix this: the leaking value is a variable carrying structured JSON, not a string this register can edit — the fix is code-side (catch the parse failure and substitute a static, field-aware message before it leaves `computeBookingArtifacts`).                                                                                                                                                                                                                                                        |

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
speak to them. 20 out of scope, 225 in scope, 2 flagged.

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

Two findings, both the same defect recurring at two call sites, found by
reading the code around a literal the extraction did surface (the Method
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

| #   | String                          | Location                                                                                   | Tell / rule                                          | Verdict             | Proposed text | Note                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `Action failed: ${result.kind}` | `src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx:525`       | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | This surface's `run()` wraps approve/decline/cancel and always shows the bare `kind` on failure, even for `validation_error`/`error` results that carry a real `message`. `settings-client.tsx:178-182` and `reviews-client.tsx:104-108` already check `"message" in result` first; this file skips that guard. Fix is code-side — see the shared note above and G2 (same defect, different file). |
| G2  | `Action failed: ${result.kind}` | `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx:155` | craft: Prefer the specific fact over the abstraction | `route:engineering` |               | Same defect as G1 in this surface's own `run()` (approve/decline/cancel/waive/settle/adjust all route through it). No `"message" in result` guard, so a `validation_error`/`error` result's real message is discarded in favor of the bare kind. Fix is code-side; see G1 for the sibling files that already guard correctly.                                                                      |

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

---

_Last reviewed: 2026-07-23_
