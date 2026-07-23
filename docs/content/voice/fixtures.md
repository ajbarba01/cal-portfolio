# Voice calibration fixtures (Set A)

> Calibration started: 2026-07-22
> Model running calibration subagents: sonnet
> Round: 1 (awaiting maintainer reaction)

14 real strings currently shipping in the codebase, used to calibrate
`docs/content/voice/cal.md` against reality. Mix: 5 client-facing microcopy, 5
feedback (validation/errors/toasts/gate panels/refusals), 4 admin-only.
`Rewrite` and `Rationale` are filled in during calibration rounds — this file
starts as a scaffold only, no rewrites yet.

| #   | String                                                                                                        | Location                                                                                   | Surface  | Rewrite | Rationale |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | ------- | --------- |
| 1   | `No eligible pets yet. Add one to continue.`                                                                  | `src/features/booking/_components/pet-assignment.tsx:76`                                   | client   |         |           |
| 2   | `No pets added yet.`                                                                                          | `src/features/accounts/_components/pet-list.tsx:216`                                       | client   |         |           |
| 3   | `Additional owners (optional)`                                                                                | `src/features/accounts/_components/profile-fields.tsx:95`                                  | client   |         |           |
| 4   | `Keep these up to date and don't worry, these forms are confidential and secure.`                             | `src/app/(site)/(account)/account/forms/page.tsx:76`                                       | client   |         |           |
| 5   | `Messages you've sent to Cal. Mark one resolved once you no longer need a reply.`                             | `src/app/(site)/(account)/account/inquiries/page.tsx:34`                                   | client   |         |           |
| 6   | `Couldn't save your time`                                                                                     | `src/features/accounts/_components/meet-greet-scheduler.tsx:175`                           | feedback |         |           |
| 7   | `Client location is too far (${milesLabel} mi). Hard cutoff is ${settings.hard_cutoff_miles} mi.`             | `src/features/booking/booking-service-shared.ts:706`                                       | feedback |         |           |
| 8   | `Full name is required`                                                                                       | `src/features/accounts/profile-schema.ts:9`                                                | feedback |         |           |
| 9   | `Enter a valid 5-digit ZIP code`                                                                              | `src/features/accounts/profile-schema.ts:21`                                               | feedback |         |           |
| 10  | `We need to sort out your account before you can book. Please get in touch and we'll help.`                   | `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx:394` | feedback |         |           |
| 11  | `No inquiries yet.`                                                                                           | `src/app/(site)/(admin)/admin/inquiries/_components/inquiries-client.tsx:108`              | admin    |         |           |
| 12  | `Approve before the visit?`                                                                                   | `src/features/admin/_components/onboarding-status-select.tsx:64`                           | admin    |         |           |
| 13  | `This clears it from your open queue. You can still find it under the Resolved filter. This can't be undone.` | `src/app/(site)/(admin)/admin/inquiries/_components/inquiries-client.tsx:110`              | admin    |         |           |
| 14  | `Create a record for an offline client. They claim the account later.`                                        | `src/app/(site)/(admin)/admin/clients/new/page.tsx:11`                                     | admin    |         |           |

## Round 1 — 2026-07-22

Fresh subagent, cold, loaded with the skill, `cal.md`, and `docs/CONTENT.md`.
Rewrote 3 of 14 and left 11 unchanged. Awaiting maintainer reaction; nothing
here is approved yet, and no source file has been edited.

| #   | Before                                                                                    | After                                                                              | What changed                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4   | Keep these up to date and don't worry, these forms are confidential and secure.           | Keep these up to date. Your forms are confidential and secure.                     | Split a comma splice; cut "don't worry" as throat-clearing. The reassurance survives as a stated fact rather than an aside.                      |
| 7   | Client location is too far (`${milesLabel}` mi). Hard cutoff is `${cutoff}` mi.           | Client is `${milesLabel}` mi away — past the `${cutoff}` mi cutoff.                | Merged two sentences into one, matching the phrasing the sibling warning at `booking-service-shared.ts:701` already uses. Both values preserved. |
| 10  | We need to sort out your account before you can book. Please get in touch and we'll help. | We need to sort out your account before you can book. Get in touch and we'll help. | Cut "Please" as mechanical filler.                                                                                                               |

**Left unchanged (11):** #1, #2, #3, #5, #6, #8, #9, #11, #12, #13, #14 — each
judged already clean against the tell catalog and the craft checks.

**Open questions from the round:**

- #3 `Additional owners (optional)` was left alone, but that string was chosen
  for the sample precisely because it violates the site's optional-label
  convention (required is the unmarked default; optional takes a muted suffix,
  not a parenthetical). That convention lives in `docs/COMPONENT_SYSTEM.md`,
  which the skill was never pointed at — a gap in what counts as "the
  project's rules", not a taste call.
- #7 — the subagent could not tell whether that refusal reaches a client or
  only an admin log, and flagged that "past the cutoff" reads more casually
  than "Hard cutoff is".
- #10 — "Please" may be earning its place on a panel telling someone their
  account is blocked.

## Coverage notes

- Interpolated values: #7 (`${milesLabel}`, `${settings.hard_cutoff_miles}`).
- Zod validation messages (shared client/server): #8, #9.
- Longer than one sentence: #13 (three sentences), #10 (two sentences).
- Nothing drawn from `src/content/marketing.ts`.
