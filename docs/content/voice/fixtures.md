# Voice calibration fixtures (Set A)

> Calibration started: 2026-07-22
> Model running calibration subagents: sonnet
> Round: 0

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

## Coverage notes

- Interpolated values: #7 (`${milesLabel}`, `${settings.hard_cutoff_miles}`).
- Zod validation messages (shared client/server): #8, #9.
- Longer than one sentence: #13 (three sentences), #10 (two sentences).
- Nothing drawn from `src/content/marketing.ts`.
