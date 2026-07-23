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
| `D-booking`    | Booking flow UI                 | 19    | 109        |              |          |         |
| `E-validation` | zod validation messages         | 5     | 23         |              |          |         |
| `F-feedback`   | Server errors, refusals, toasts | 32    | 163        |              |          |         |
| `G-admin`      | Admin surfaces                  | 54    | 338        |              |          |         |

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

| #   | String                                                                            | Location                                                   | Tell / rule                                | Verdict             | Proposed text                                                       | Note                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| K1  | `Keep these up to date and don't worry, these forms are confidential and secure.` | `src/app/(site)/(account)/account/forms/page.tsx:76`       | craft: Cut words that don't change meaning | `rewrite`           | `Keep these up to date. They're confidential and secure.`           | Approved in fixtures. Splits a comma splice; "don't worry" told the reader how to feel instead of stating the fact. |
| K2  | `Client location is too far (${…} mi). Hard cutoff is ${…} mi.`                   | `src/features/booking/booking-service-shared.ts:706`       | craft: Vary sentence length                | `rewrite`           | `Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.` | Approved in fixtures. Matches the sibling warning at line 701. Subject stays "Client" — admin also reads this.      |
| K3  | `Additional owners (optional)`                                                    | `src/features/accounts/_components/profile-fields.tsx:95`  | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | A `FieldGroup.title`, not a `FormField` label, so the optional-suffix convention never reaches it.                  |
| K4  | (same pattern)                                                                    | `src/features/accounts/_components/profile-fields.tsx:130` | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | Same `FieldGroup.title` gap as K3.                                                                                  |
| K5  | `Enter a valid 5-digit ZIP code`                                                  | `src/features/accounts/profile-schema.ts:21`               | craft: Prefer the specific fact            | `route:engineering` |                                                                     | Describes only the 5-digit case; the regex also accepts ZIP+4. Copy cannot fix a mismatch with the code.            |

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

_Audit pending._

### Group E — zod validation messages

_Audit pending._

### Group F — server errors, refusals, toasts

_Audit pending._

### Group G — admin surfaces

_Audit pending._

---

_Last reviewed: 2026-07-23_
