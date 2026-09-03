# Launch readiness — waved build plan

> **Purpose.** Take the site from "works for the tester" to "a real client can book, pay and be emailed safely, and Cal can run it" by working the verified findings register down to zero across eight gated waves of parallel builders on one shared `main` working tree.
>
> **Inputs.** The 59-item verified register (`REGISTER.md`), the adversarial verification verdicts (`VERIFY.txt` — its corrections override the register wherever they conflict), the owner's decisions (`DECISIONS.md`), the session-shape research (`meta-research.md`), and the repo docs this plan must satisfy: [WORKFLOW.md](../../WORKFLOW.md) (handoff contract, gates, Definition of Done, commit rules), [ENGINEERING.md](../../ENGINEERING.md), [CODE_STYLE.md](../../CODE_STYLE.md), [FRONTEND.md](../../FRONTEND.md), [COMPONENT_SYSTEM.md](../../COMPONENT_SYSTEM.md) and the constitution in [AGENTS.md](../../../AGENTS.md).
>
> **Machine-readable twin.** `waves.json` in the session scratchpad carries the same slices with per-builder briefs; the orchestrator dispatches from it and treats this file as the human contract.

Register IDs: **B** bug · **D** debt · **F** feature · **U** ux · **X** docs/tooling · **O** owner-gated. Every register item is assigned below; the coverage table at the end lists where, and names the deliberate deferrals.

---

## Owner decisions (from DECISIONS.md, 2026-09-02, all defaults accepted)

1. **Signup forms.** Meet & greet requires zero forms; delete the emergency wizard step; emergency contact and vet name/phone move into the `owner` form, required at the first _paid_ booking, never at signup.
2. **Payments kill-switch.** Env `NEXT_PUBLIC_PAYMENTS_ENABLED`, default off. Off means no prepay CTA anywhere, balances still shown as owed, the admin "Unpaid" pill stays, the prepay sentence is dropped from the confirmation email. Both modes tested.
3. **Service-area gate.** Origin = current settings origin, radius 50 mi, unknown or out-of-state ZIP counts as out of area. Client gets an inline field error on address save; admin create-client warns only. An address change on `/account` must re-geocode.
4. **Cal-adjustable price.** Generalize the per-booking Kiche mechanism into a manual-discount list Cal toggles from the booking: "Friends & Family (−50%)" and "Complimentary" (−100%, also zeroes travel). Breakdown lines are rendered to the client on their booking and to admin.
5. **Notifications.** Client gets "received" on create and "confirmed" on the confirmed transition. Admin alerts go to env `ADMIN_NOTIFICATION_EMAIL` for new booking request, new inquiry, client cancellation. New templates are drafted in the third-person system register and ship **disabled** (env var unset) until Alex approves wording at session end.
6. **Caret proximity effect.** Revive `CursorRing` in proximity-only mode (caret sweep, no site-wide glow); delete the rest of the dead glow surface.
7. **References.** Build the component reading from `src/content` (names, consent flags, contact, pet photo keys) plus a request-contact flow through the existing inquiry pipeline; renders only when content is present. Content arrives at session end.
8. **Multi-day availability.** Yes, and it needs genuinely good UX — redesign the selection model (range/multi-select, clear affordances, keyboard), not a flag flip.
9. **Recurrence engine.** Keep behind `RECURRING_UI_ENABLED`; document it.
10. **Vercel plan.** Assume Hobby (daily crons).
11. **CI.** GitHub Actions lint + typecheck + unit tests on push; integration job later.
12. **Docs.** Delete root `TEMP.md` and `PROMPTS.md`; fold unsynced `SYNC.md` text into `docs/content/cal-source.md` plus the ledger (never onto the site); keep `FORMS.md`; retire `HANDOFF.md` and `PRICING-HANDOFF.md` (prod has all migrations); archive shipped plans; rewrite the DESIGN.md pricing section as model-not-numbers (the DB is truth); fix the ~20 DESIGN/code contradictions.

**Orchestrator calls accepted:** delete dead admin-write RLS policies and document service-role-only; drop the 8 unused `pets` columns; delete the orphaned pgTAP suite; the no-show / grant-refund / settle-debt cores stay with their DESIGN claims removed and no UI; delete the unused `table.tsx`; narrow the `/showcase` doc claim; dark mode stays latent; keep the Rover URL and drop its TODO; all four paid services are pet-aware; a client may prepay the remainder after a partial refund; unit/apartment goes on the street line with a hint.

### Approved copy (system register, third person) — the ONLY new user-facing text

- Multi-day availability: "N days selected" · "for these days" · "Pick one or more days" · "Applies to all selected days"
- Service-area error: "That address is outside Cal's service area."
- Address hint placeholder: "Street address, apt or unit"
- Profiles-incomplete (paid flow): "Finish the required forms below before booking."
- Not-yet-approved: "Your account is pending Cal's approval."
- Discount labels: "Friends & Family (−50%)" · "Complimentary"
- Login states: "Your sign-in link has expired. Request a new one." · "Sign-in failed. Please try again."
- Rate-limit refusal: "Too many submissions. Please try again later."
- Chrome: skip link "Skip to content" · ticker "Pause"/"Play"
- Declined-onboarding page: reuse the shipped `/book` gate wording.

NO other new user-facing text. Marketing copy untouched. A slice that believes it needs a sentence not on this list ships the surface unchanged and escalates in the handoff log.

### Owner-gated at end (from DECISIONS.md)

Gallery photos; references content; Cal alert email plus Resend from-address/DNS; Stripe live keys plus webhook secret in Vercel; notification template sign-off; Vercel plan confirmation.

---

## Principles

1. **One file, one owner, per wave.** Every slice lists explicit write globs. Anything not listed is read-only for that slice. Within a wave no two slices may write the same file; the per-wave ownership tables below were checked pairwise, and every overlap is resolved by an explicit exclusion clause in the glob, never by convention. A builder that discovers it needs a file it does not own **stops and reports** in its handoff; the orchestrator applies the change between waves or reassigns it.
2. **Hotspots are serialized.** Every file in the register's hotspot table has exactly one owner per wave. Items touching the same hotspot are bundled into that owner or split across waves. `src/features/booking/**` is owned at file granularity throughout; other directories are owned as subtrees where possible.
3. **Contracts first, adopters later.** Every new shared module (formatters, pets repo, settings schema, cron auth, payments flag, recording test double, money projection, status pill, phone schema, drive-buffer guard, generated DB types, discount modifiers) lands in a wave strictly earlier than any slice that consumes it. Adopters import; they never edit the contract.
4. **Structure and behavior never share a commit.** Pure moves, renames, deletions and extractions are their own `refactor:`/`chore:` commits, listed separately in each slice. Bug fixes land first where they unblock clients; mechanical adoption sweeps run in a later wave against the already-corrected file.
5. **Orchestrator-only files.** `package.json`, `package-lock.json`, `supabase/migrations/**`, `src/app/globals.css`, `src/lib/design-tokens.ts`, `src/content/**`, `next.config.ts`, `vercel.json`, `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `docs/**`, `.github/**`, `.env*`, `.husky/**`. Builders **report** needed changes; the orchestrator applies them between waves. Exceptions, each named below: one designated **migrations slice** per wave that needs SQL (W1-S6, W2-S11, W4-S9, W6-S8); the **docs slices** in wave 7; the **CI slice** W7-S5; `src/content/**` is granted to W7-S4 only.
6. **Wave size 6–12 slices; slice size ~150–500 diff lines.** Anything bigger is split by directory. Every slice is sized for one agent with a fresh context that has read only its brief and the files in its globs.
7. **Gate between every wave.** Integrated `npm run typecheck` + `npm run lint` + `npm run test:unit` (plus `npm run test:integration` after a DB-touching slice, `npm run build` where route shape changed) → adversarial review of every slice diff by a fresh-context reviewer → fixes by the original owner → one re-review → next wave. Never start wave N+1 on a red gate. Two **tail** slices (W3-S10 generated types, W6-S9 strict index access) run sequentially _after_ their wave's other slices are green, because they redden the whole tree.
8. **Test-first for non-trivial logic** (ENGINEERING #5). Marked per slice: the failing test is written and shown before the implementation.
9. **No new copy, no new features, no new dependencies.** Only the approved strings above; only the F items and decisions; the one dependency change is promoting `dotenv` to a direct devDependency (it is load-bearing for `src/test-setup.ts` and today resolves only transitively through `shadcn`).
10. **Report, don't reach.** Builder report format is mandatory: files changed, commands run with exit codes, test output summary, orchestrator-file changes needed, risks, anything touched outside ownership (must be none).

### Standing conventions handed to every builder

- **Error convention** (VERIFY B9 rejected a shared helper): at every server-action or repository boundary, `console.error("<scope>:", error)` then return the feature's existing `{ kind: "error" }` union member with a static string — `"Something went wrong. Please try again."` for DB/exception failures, `"Please check your entries and try again."` for zod failures. Never return `error.message` or `parsed.error.issues`. Field errors use the `zodFieldErrors` shape already consumed in `onboarding-action.ts`.
- **Commit style:** Conventional Commits, subject line only, no body, no trailers, no plan/wave/slice identifiers in the subject. Repo policy overrides any harness default that appends attribution.
- **Line numbers in the register are approximate** — the repo was reformatted; briefs cite symbols, and builders grep before editing.
- **Verify commands** are the repo scripts: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run build`, `npx vitest run <paths>`.
- **Field legend for the slice tables:** _owns_ = write globs · _reads_ = key read-only dependencies · _TF_ = test-first marker · _verify_ = exact commands · _commits_ = subject lines in order.

---

## Wave 0 — Contracts, tooling, the live 500

Pure additions, one test-suite split, and the one bug fix that stops an active sitewide 500. No wave-0 contract has a consumer in wave 0.

### Orchestrator-only changes applied before wave 0

- `package.json` / `package-lock.json`: scripts `test:unit` (`vitest run --project unit`), `test:integration` (`vitest run --project integration`), `test:coverage`, `db:types` (`supabase gen types typescript --local > src/lib/supabase/database.types.ts`); `dotenv` as a direct devDependency; `tw-animate-css` and `shadcn` moved to devDependencies; `engines.node` pinned.
- `vitest.config.ts`: two projects — `unit` (excludes `**/*.integration.test.ts`) and `integration` (`**/*.integration.test.ts` only, `fileParallelism: false`, `hookTimeout: 30000`).
- `.husky/pre-commit`: add `npm run test:unit`.
- `.env.example`: add `NEXT_PUBLIC_SITE_URL=`, `NEXT_PUBLIC_PAYMENTS_ENABLED=false`, `ADMIN_NOTIFICATION_EMAIL=`.
- Commit or stash the pre-existing uncommitted `docs/DEV_NOTES.md` change so builders start from a clean tree.

### Slices

**W0-S1 · Split integration suites out of the unit run** — items X1 (code half)

- owns: the 13 module-scope-env test files (`grep -rlE "throw new Error\(.*(env|SUPABASE)" src --include=*.test.ts`): `src/features/accounts/account-actions.test.ts`, `src/features/accounts/onboarding-action.test.ts`, `src/features/admin/admin.test.ts`, `src/features/admin/create-client.integration.test.ts`, `src/features/booking/admin-create-booking.integration.test.ts`, `src/features/booking/booking-service.test.ts`, `src/features/booking/edit-booking.integration.test.ts`, `src/features/booking/series-cron.test.ts`, `src/features/inquiries/inquiry-client-actions.test.ts`, `src/features/notifications/completion-cron.test.ts`, `src/features/notifications/reminder-cron.test.ts`, `src/features/payments/payments.test.ts`, `src/features/reviews/reviews-action.test.ts`; `src/test-setup.ts`
- reads: `vitest.config.ts`, `package.json`
- TF: no
- verify: `npm run test:unit` (green with no Supabase env) · `npm run typecheck`
- commits: `test: separate integration suites from the unit run` · `test: keep pure cron cases in the unit suite`
- notes: rename ten of the thirteen to `*.integration.test.ts`. Per VERIFY X1, **split, do not rename**, `series-cron`, `completion-cron` and `reminder-cron` — their pure `describe` blocks precede the module-scope throw; move those into the sibling `*.test.ts` and leave the DB half as `*.integration.test.ts`. Later waves refer to the renamed files (`booking-service.integration.test.ts`, `account-actions.integration.test.ts`, `onboarding-action.integration.test.ts`, `admin.integration.test.ts`, `inquiry-client-actions.integration.test.ts`, `payments.integration.test.ts`, `reviews-action.integration.test.ts`).

**W0-S2 · Denver time and money display contract** — D2 (contract)

- owns: `src/lib/time-of-day.ts`, `src/lib/time-of-day.test.ts`, `src/features/pricing/display.ts`, `src/features/pricing/display.test.ts`, `src/features/booking/format-money.ts`
- reads: the ad-hoc copies listed under D2
- TF: yes — DST boundary days, both `dayHeading` variants (with and without year), negative cents
- verify: `npx vitest run src/lib/time-of-day.test.ts src/features/pricing/display.test.ts` · `npm run typecheck`
- commits: `feat(lib): add shared denver time formatters` · `feat(pricing): add one two-decimal money formatter`
- notes: export `DENVER_TZ`, `denverTime`, `denverDate`, `denverDateTime`, `denverDayLabel`, `denverDayKey`; build every `Intl.DateTimeFormat` at module scope. `format-money.ts` becomes a re-export. No call site is repointed in this wave.

**W0-S3 · Pets data module** — D3 (contract)

- owns: `src/features/pets/**`
- reads: `src/features/accounts/account-actions.ts` and `src/features/admin/onbehalf-actions.ts` (the two `PET_COLUMNS` copies), the five signed-URL copies listed under D3
- TF: yes — column completeness (`birthdate` present); batched signing is called once for N pets
- verify: `npx vitest run src/features/pets` · `npm run typecheck`
- commits: `feat(pets): add a shared client-pets repository`
- notes: new `pets-repo.ts` exporting `listClientPets(serviceClient, clientId)` (signed view, one batched `createSignedUrls`), `PET_COLUMNS` (with `birthdate`), `SIGNED_URL_TTL_SECONDS`, `AssignablePet`. Do not touch the five copies; do not move `pet-avatar.tsx` (W6-S2).

**W0-S4 · Single settings row schema** — D4 (contract)

- owns: `src/features/admin/settings-schema.ts`, `src/features/admin/settings-schema.test.ts`
- reads: the six existing shapes listed under D4
- TF: yes — table-driven `safeParse` cases including the untested refine; the derived select string contains `drive_buffer_pct`
- verify: `npx vitest run src/features/admin/settings-schema.test.ts` · `npm run typecheck`
- commits: `feat(admin): add one settings row schema`
- notes: export `settingsRowSchema`, `SETTINGS_COLUMNS` (derived from `Object.keys(schema.shape)`), and a `.pick()`-friendly shape for the repository's narrow read. No reader is edited here.

**W0-S5 · Constant-time cron authorization** — D14 (contract)

- owns: `src/lib/cron-auth.ts`, `src/lib/cron-auth.test.ts`
- reads: `src/app/api/cron/*/route.ts`
- TF: yes — missing header, wrong length, wrong value, correct value
- verify: `npx vitest run src/lib/cron-auth.test.ts` · `npm run typecheck`
- commits: `feat(lib): add a constant-time cron auth check`

**W0-S6 · Payments kill-switch flag** — F4 (contract)

- owns: `src/lib/payments-enabled.ts`, `src/lib/payments-enabled.test.ts`
- TF: yes — unset, `"false"`, `"true"`
- verify: `npx vitest run src/lib/payments-enabled.test.ts` · `npm run typecheck`
- commits: `feat(lib): add the payments enabled flag`
- notes: `PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true"`, build-time, default off, importable from client, server and route handlers.

**W0-S7 · Argument-recording Supabase test double** — D12 (contract)

- owns: `src/test-stubs/**`
- reads: `src/features/booking/services-repo.test.ts` (the one good fake)
- TF: yes — the double's own recording behavior
- verify: `npx vitest run src/test-stubs` · `npm run typecheck`
- commits: `test: add an argument-recording supabase double`
- notes: `fake-supabase.ts` records every `.eq/.in/.gte/.lt/.order/.limit` call into `_calls` so a dropped predicate fails a test. No suite is retargeted here (W6-S5/S6).

**W0-S8 · SEO surface: JSON-LD escaping, sitemap, breadcrumb, business image** — B3 (part 1), X1 (sitemap half), B15 (image path)

- owns: `src/features/seo/**`, `src/app/sitemap.ts`, `src/app/(site)/(marketing)/contact/_components/contact-form.tsx`, `src/app/(site)/(marketing)/contact/_components/contact-form.test.tsx`
- reads: `docs/content/copy-ledger.md`
- TF: yes — a payload containing `</script>` renders escaped
- verify: `npx vitest run src/features/seo "src/app/(site)/(marketing)/contact"` · `npm run typecheck` · `npm run lint`
- commits: `fix(seo): escape angle brackets in json-ld payloads` · `fix(seo): point the sitemap and breadcrumb at services` · `fix(seo): use a stable business image path`
- notes: keep `JSON.stringify(data).replace(/</g, "\\u003c")` verbatim — VERIFY B3 calls it the load-bearing fix (no CSP exists anywhere; report the CSP gap for the owner list). Drop `"/book"` from `SITEMAP_STATIC_PATHS` in `features/seo/sitemap.ts` and retarget the two live refs: breadcrumb crumb → `{ name: "Services", path: "/services" }`, contact-form link → `/services`. `BUSINESS.imagePath` → `/bg/IMG_0048.JPG`.

**W0-S9 · Stop the species-enum 500 on the booking calendars** — B4 (P0 + P0b)

- owns: `src/features/booking/booking-repository.ts`, `src/features/booking/busy-ranges.ts`, `src/features/booking/busy-ranges.test.ts`, `src/app/(site)/(account)/account/pets/page.tsx`, `src/features/admin/clients-actions.ts` (the `ClientPet.species` type only), `src/features/booking/_components/pet-avatar.tsx`, `src/features/booking/_components/pet-assignment.tsx` (icon/label lookups, only if the widening breaks them)
- reads: `src/features/pets/species.ts`
- TF: yes — a busy-row fixture with `species: "bird"` parses instead of throwing
- verify: `npx vitest run src/features/booking/busy-ranges.test.ts` · `npm run typecheck`
- commits: `fix(booking): accept every pet species in busy-range rows` · `fix(account): keep birthdate when loading the pets page`
- notes: VERIFY B4 sequencing — the zod widening (`speciesEnum` in `publicBusyRowSchema` and `adminBusyRowSchema`; widen `PetSpeciesDb`, `PublicBusyRange.species`, `ClientPet.species`) is the only piece that stops the live 500 on `/book` and `/admin/availability`. Add `birthdate` to the pets page select. **Do not** widen `allowedSpeciesOf` (P1, W6-S4). Do not edit `booking-service.test.ts` (W0-S1 is renaming it).

**W0-S10 · Money projection contract** — B8 (contract)

- owns: `src/features/payments/projection.ts`, `src/features/payments/projection.test.ts`, `src/features/payments/types.ts`, `src/features/payments/index.ts`, `src/features/payments/index.client.ts`
- reads: `src/features/booking/booking-repository.ts` (payment row shape), `src/features/booking/cancel-core.ts`
- TF: yes — `netPaid` / `amountOwedCents` for one intent, two intents, a partial refund, fully refunded
- verify: `npx vitest run src/features/payments/projection.test.ts` · `npm run typecheck`
- commits: `feat(payments): export net-paid and amount-owed projections`
- notes: `sums` is module-private and `amountOwedCents` is in neither barrel today. Add `refundedCents` to `PaymentTxn` (default `0` so consumers compile before the repository populates it). Drop the register's `chooseReuse` extraction (VERIFY B8).

**W0-S11 · Status pill and phone schema contracts** — D13 (the two extractions)

- owns: `src/features/booking/state-machine.ts`, `src/features/booking/state-machine.test.ts`, `src/lib/phone-schema.ts`, `src/lib/phone-schema.test.ts`
- reads: the four drifted status maps, the five phone regexes
- TF: yes — exhaustive status coverage; phone accept/reject table drawn from all five existing regexes
- verify: `npx vitest run src/features/booking/state-machine.test.ts src/lib/phone-schema.test.ts` · `npm run typecheck`
- commits: `feat(booking): add one booking status pill mapping` · `feat(lib): add a shared phone schema`
- notes: the admin wording is canonical for `completed`/`no_show`; record the drift in the test so wave-4 adopters do not invent a third map.

**W0-S12 · Drive-buffer guard extraction** — B5 (prerequisite)

- owns: `src/features/booking/create-core.ts`, `src/features/booking/drive-buffer-guard.ts`, `src/features/booking/drive-buffer-guard.test.ts`
- reads: `src/features/booking/drive-buffer.ts`
- TF: yes — characterize the guard's current behavior before the move; the same test passes after
- verify: `npx vitest run src/features/booking/drive-buffer-guard.test.ts src/features/booking/drive-buffer.test.ts` · `npm run typecheck`
- commits: `refactor(booking): extract the drive buffer guard`
- notes: pure move of the guard out of `create-core`. The edit-side call is W2-S8, once the repository can exclude the booking being edited (W1-S2).

**Wave 0 gate:** `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `npm run test:integration` · adversarial review per diff (criteria: is each contract's shape right for its known consumers; did any slice touch a consumer).

---

## Wave 1 — A real client can book safely

Highest blast radius first: onboarding is a dead end, refunds over-request and leave bookings active, review bodies are an XSS vehicle, an address change never re-geocodes, and the "confirmed" email fires on unconfirmed bookings. Wave-0 contracts are adopted here; nothing new is contracted.

### Orchestrator-only changes applied before wave 1

None beyond carrying wave-0 reports.

### Slices

**W1-S1 · Onboarding: unblock meet & greet, delete the emergency step, fix the declined page** — B1, B2, B13, B12 (onboarding half), U1 (onboarding landmark)

- owns: `src/features/booking/required-profiles.ts`, `src/features/booking/required-profiles.test.ts`, `src/features/accounts/onboarding-form.ts`, `src/features/accounts/onboarding-form.test.ts`, `src/features/accounts/onboarding-action.ts`, `src/features/accounts/onboarding-action.integration.test.ts`, `src/features/accounts/owner-schema.ts`, `src/features/accounts/emergency-schema.ts`, `src/features/accounts/form-registry.ts`, `src/features/accounts/_components/form-card.tsx`, `src/features/accounts/_components/form-card.test.tsx`, `src/features/accounts/_components/form-card.characterization.test.tsx`, `src/features/accounts/_components/meet-greet-scheduler.tsx`, `src/app/(onboarding)/**`
- reads: `src/features/booking/create-core.ts`, `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` (the shipped declined-gate wording), `supabase/migrations/20260616130001_pets_identity_columns.sql`
- TF: yes — `required-profiles` (meet & greet vacuous, paid services still require `owner`; retarget the **five** assertions VERIFY lists); `ownerSchema` requires emergency contact plus vet name/phone; `runOnboarding` no longer inserts an `emergency` row
- verify: `npx vitest run src/features/booking/required-profiles.test.ts src/features/accounts "src/app/(onboarding)"` · `npm run typecheck` · `npm run lint`
- commits: `fix(booking): require no forms for a meet and greet` · `refactor(accounts): drop the emergency step from signup` · `feat(accounts): collect emergency and vet contact on the owner form` · `fix(onboarding): replace the declined-page copy stubs` · `fix(onboarding): give the onboarding zone a main landmark`
- notes: B1 is one line — `REQUIRED_PROFILES.meet_greet = []`; VERIFY confirms the booking then lands in `pending_approval`, not `refuse`. B2 per DECISIONS 1: `onboardingClientSchema = profileSchema`, drop `splitOnboardingInput` and the insert, delete the two `FormSection`s and their defaults, the subtitle loses "and emergency info"; **same commit** move emergency contact and `vet_name`/`vet_phone` into `ownerSchema` (booking-gated, required at the first paid booking) and delete the stale vet comment in `owner-schema.ts` — otherwise vet capture is silently lost. Keep the emergency schema, registry entry and `EmergencyFields` so legacy rows still render in admin. B13 is **not** owner-gated (VERIFY): inline the shipped `/book` gate wording verbatim — title "Your account needs attention", subtitle "We need to sort out your account before you can book. Please get in touch and we'll help." — and delete the "Copy is Cal's voice" comment. B12/U1: wrap onboarding children in `<main id="main-content" className="flex-1">`, pass `bare` to the meet-greet `Scheduler`, outer card `variant="emphasis"`. Report the stale DESIGN.md lines (33, 85, 88, 264, 266–268) for W7-S1.

**W1-S2 · Money correctness: net refunds, clamp, guard every gateway call** — B8 (all but the two role reads), B10 (repository swallow), O2 (verified, no UI)

- owns: `src/features/booking/booking-repository.ts`, `src/features/booking/cancel-core.ts`, `src/features/booking/admin-actions-core.ts`, `src/features/booking/kiche.ts`, `src/features/booking/kiche.test.ts`, `src/features/booking/set-kiche-applied.test.ts`, `src/features/booking/cancellation.ts`, `src/features/booking/cancellation.test.ts`, `src/features/booking/preview-cancellation.ts`, `src/features/booking/booking-service.integration.test.ts`, `src/features/payments/**`, `src/app/(site)/(account)/account/bookings/page.tsx`
- reads: `src/features/payments/projection.ts` (W0-S10), `src/features/pets/index.ts`
- TF: yes — partial-refund netting (one intent, two intents, fully refunded); a refund never requests more than an intent's remaining amount; a Kiche partial refund followed by a client cancel changes status and does not over-request; `getActiveBusyRanges` excludes the given booking id
- verify: `npx vitest run src/features/booking/cancellation.test.ts src/features/booking/kiche.test.ts src/features/booking/set-kiche-applied.test.ts src/features/payments` · `npm run typecheck` · `npm run lint` · `npm run test:integration` before reporting done
- commits: `fix(booking): net refunded amounts into paid totals` · `fix(payments): clamp refunds to each intent's remaining amount` · `fix(payments): handle gateway failures on intent and refund calls` · `fix(booking): guard and key the full-refund grant` · `feat(booking): let active busy ranges exclude a booking`
- notes: add `refunded_cents` to the select, row schema and mapper so `payments` is a real `PaymentTxn[]`; VERIFY widens the netting to `getBookingForKiche`, `getBookingForEdit` and the account page's own `paidCents` — use W0-S10's `netPaid`/`amountOwedCents` at all six gross sites. Clamp each refund to `amountCents − refundedCents` (`find(succeeded)` over-refunds one intent on two-intent bookings). Try/catch + `console.error` + the existing `{ kind: "error" }` around every `gateway.refund`, `createIntent` and the reconcile path; `reconcileOverpay` is already keyed and refund-aware — only clamp it and stop dropping read errors. Ordering (VERIFY): try/catch alone still leaves the booking active because the refund precedes `updateBookingStatus`; only the netting removes the over-request, so land both in the first commit. `grantFullRefundCore` has zero importers — add a booking-status guard and a deterministic idempotency key as dead-endpoint hardening; keep the O2 cores, ship no UI. Contract for W2-S8: `getActiveBusyRanges` returns the row `id` and accepts `excludeBookingId`. Log and surface the swallowed error in the repository's busy read (B10). The two role reads in `actions.ts` belong to W1-S9 — report, do not edit. This is the largest slice in the plan (~500 lines); it gets the heaviest review budget.

**W1-S3 · Account pages: real error states, pets repository** — B10 (account pages), D3 (first adopter)

- owns: `src/app/(site)/(account)/account/pets/**`, `src/app/(site)/(account)/account/forms/**`, `src/app/(site)/(account)/account/inquiries/**`, `src/app/(site)/(account)/account/page.tsx`
- reads: `src/features/pets/pets-repo.ts` (W0-S3), `src/components/feedback/error-state.tsx`
- TF: no (IO wiring; the repository test covers the columns)
- verify: `npm run typecheck` · `npm run lint` · `npx vitest run "src/app/(site)/(account)"`
- commits: `refactor(account): load pets through the shared repository` · `fix(account): show an error state when account reads fail`
- notes: repoint the pets page at `listClientPets` (deletes one of five copies). Destructure `error` on every page and early-return the `ErrorState` admin already uses instead of `?? []`; a failed debits read must not render "no outstanding balance". Do not touch `account/bookings/page.tsx` (W1-S2).

**W1-S4 · Session and read errors fail closed** — B10 (proxy, account layout, services-repo), D6 (pure redirect rule extracted)

- owns: `src/lib/supabase/proxy.ts`, `src/lib/supabase/onboarding-redirect.ts`, `src/lib/supabase/onboarding-redirect.test.ts`, `src/app/(site)/(account)/layout.tsx`, `src/features/booking/services-repo.ts`, `src/features/booking/services-repo.test.ts`
- reads: `docs/DESIGN.md` (the middleware paragraph that must move with the extraction — report to W7-S1)
- TF: yes — pure `onboardingRedirect` decision: approved, not approved, read failed
- verify: `npx vitest run src/lib/supabase src/features/booking/services-repo.test.ts` · `npm run typecheck`
- commits: `refactor(auth): extract the onboarding redirect rule` · `fix(auth): stop treating a failed profile read as unapproved`
- notes: fix `proxy.ts` **and** `(account)/layout.tsx` together — both derive `approved` from the same swallowed read; patching only the proxy is fail-open and still locks the nav. Distinguish read error from not-approved: log and render an error rather than bouncing to `/onboarding`. `services-repo` stops swallowing its query error and logs the silent skip its docstring already claims to log.

**W1-S5 · Public write surfaces** — B3 (parts 2–4), B10 (reviews-repo), B9 (inquiry-actions admin sites)

- owns: `src/features/reviews/**`, `src/features/inquiries/inquiry-actions.ts`, `src/features/inquiries/inquiry-schema.ts`, `src/features/inquiries/inquiry-client-actions.integration.test.ts`
- reads: `supabase/migrations/20260607160000_inquiries_lock_insert.sql` (the pattern), W1-S6 (the paired revoke)
- TF: yes — display-name fallback never returns an email; review count-check boundaries; inquiry second bound keyed by session user
- verify: `npx vitest run src/features/reviews src/features/inquiries` · `npm run typecheck` · `npm run lint`
- commits: `refactor(reviews): write reviews through the service role` · `fix(reviews): cap how many reviews one client can post` · `fix(reviews): stop publishing reviewer email addresses` · `fix(inquiries): rate-limit submissions per session` · `fix(reviews): fail the reviews page instead of baking an empty one` · `fix(inquiries): return static error text from admin inquiry actions`
- notes: VERIFY B3 — a count check in the action is decorative while `authenticated` can insert directly with the publishable key; mirror the inquiries lock (W1-S6 revokes and drops the policy) and switch `submitReview` to `createServiceClient()` with identity still from `getUser()`, then the count binds. Drop the `user.email ??` rung → "Anonymous" (existing string). Inquiry second bound keyed on the session user id, never global. Refusal copy: "Too many submissions. Please try again later." (approved). `reviews-repo` **rethrows** on error (a swallowed error bakes an empty ISR page for 24h); do not add the unrelated `.limit()`. Apply the error convention to the seven admin sites in `inquiry-actions.ts`. Stored email `author_name` rows are an owner cleanup (W7-S8).

**W1-S6 · Migrations, wave 1** — B3 (SQL), B11 (functions, storage), D9 (publication, indexes)

- owns: `supabase/migrations/**`
- verify: `supabase db reset` · `npm run test:integration`
- commits: `fix(db): lock review inserts to the service role` · `fix(db): pin the search path on security definer functions` · `fix(db): cap storage uploads by size and mime type` · `feat(db): publish availability tables for realtime` · `perf(db): index series and window end predicates`
- notes: append-only. Revoke `insert` on `reviews` from `anon`/`authenticated` and drop the insert policy (pairs with W1-S5). `set search_path = ''` on the **two** live SECURITY DEFINER functions, qualifying the bare `profiles` reference or RLS breaks. Bucket `file_size_limit` + `allowed_mime_types` (image/\*). Add `availability_windows` and `overnight_nights` to `supabase_realtime` (keep `bookings` out). Indexes `bookings(series_id)`, `availability_windows(ends_at)`. **Deliberately not here:** the `pets`/`bookings`/`profiles.email` grant narrowing — that lands in W2-S11, after W1-S7 has moved the `photo_url` write to the service client.

**W1-S7 · Accounts server actions** — B7, B11 (code half except the pet-ownership guard), B9 (account-actions sweep), B4 (`PET_COLUMNS` adoption)

- owns: `src/features/accounts/account-actions.ts`, `src/features/accounts/account-actions.integration.test.ts`, `src/features/accounts/authorizations.ts`, `src/features/accounts/authorizations.test.ts`, `src/features/accounts/index.ts`, `src/features/accounts/index.client.ts`
- reads: `src/features/accounts/onboarding-action.ts` (the `OnboardingDeps` pattern), `src/features/pricing/geocoding/zip-centroid-geocoder.ts`, `src/features/accounts/claim-actions.ts` (service-client pattern), `src/features/pets/pets-repo.ts`
- TF: yes — `runUpdateProfile` with an injected geocoder writes coordinates for a known ZIP and nulls for an unknown one; photo upload rejects a non-image MIME, an over-cap file and a non-uuid `petId`
- verify: `npx vitest run src/features/accounts` · `npm run typecheck` · `npm run lint`
- commits: `fix(accounts): re-geocode the profile on every address save` · `fix(accounts): write pet photo urls with the service client` · `fix(accounts): validate pet photo uploads` · `fix(accounts): take the e-sign kind and version from the server` · `fix(accounts): return static error text from account actions` · `refactor(accounts): use the shared pet column list`
- notes: VERIFY B7 — pass `geocoder` and `serviceClient` as deps to `runUpdateProfile` (mirror `OnboardingDeps`); geocode on **every** save and write `lat`/`lng` unconditionally after the session update (offline bundled lookup, idempotent, sole writer); amend the "session client, never service role" invariant comment. Move the `photo_url` write to `createServiceClient()` — the prerequisite for W2-S11's grant. Insert `EXPENSE_AUTH_KIND`/`VERSION` from the module and call the dead `authorizationCurrent`. Twelve raw-message returns get the standing error convention. Import `PET_COLUMNS` from `@/features/pets` and delete the local copy.

**W1-S8 · Booking edit: keep the walk add-on; shared-core hardening** — B5 (walk half), B10 (create-core rethrow), B9 (`booking-service-shared`), B11 (pet-ownership guard)

- owns: `src/features/booking/edit-core.ts`, `src/features/booking/quantity-state-from-quote-inputs.ts`, `src/features/booking/quantity-state-from-quote-inputs.test.ts`, `src/features/booking/_components/quantity-forms.tsx`, `src/features/booking/_components/quantity-forms.test.tsx`, `src/features/booking/create-core.ts`, `src/features/booking/booking-service-shared.ts`, `src/features/booking/edit-booking.test.ts`, `src/features/booking/build-quote-input.test.ts`
- reads: `src/app/(site)/(marketing)/book/_components/messages.ts` (renders `kind: "error"` already)
- TF: yes — `quantity-state-from-quote-inputs.test.ts` currently **pins the bug** (asserts `walkMinutesPerDay: 0` from a persisted `QuoteInput`): retarget it; a comments-only edit of a paid house-sit leaves `final_cents` unchanged; the walk add-on can be explicitly zeroed
- verify: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/edit-booking.test.ts src/features/booking/build-quote-input.test.ts src/features/booking/_components/quantity-forms.test.tsx` · `npm run typecheck`
- commits: `fix(booking): keep the walk add-on when re-quoting an edited stay` · `fix(booking): lock pricing on a paid booking edit` · `fix(booking): return an error result for unexpected create failures` · `fix(booking): check pet ownership on every booking request` · `fix(booking): return static error text from the shared booking core`
- notes: read `exerciseMinutesPerDay` as the fallback in both places (mirror `reconstructMaxHoursAway`). VERIFY adds: `quantitiesToRecord` omits the key at 0, so always emit `walkMinutesPerDay` or the patch spread restores the old minutes; the paid-lock only blocks pets/quantities patches, so a paid booking is re-priced down by a time- or comments-only edit — close that. `create-core` returns `kind: "error"` instead of rethrowing past `CreateBookingResult`. In `booking-service-shared`, delete the `petAware &&` guard (meet & greet accepts foreign `petIds` today) and apply the error convention at the raw-message return. The drive-buffer guard on edit is W2-S8.

**W1-S9 · Confirmation email on the confirmed transition** — B6, B8 (the two role reads), B10 (series-cron), O4 (keep behind the flag)

- owns: `src/features/notifications/**`, `src/features/booking/mutations/**`, `src/features/booking/actions.ts`, `src/features/admin/approval-actions.ts`, `src/features/booking/series-cron.ts`, `src/features/booking/series-cron.test.ts`, `src/features/booking/series-cron.integration.test.ts`
- reads: `src/features/booking/booking-repository.ts` (W1-S2 is changing the payment row; read its diff before relying on the shape)
- TF: yes — pure status gate: a `pending_approval` create sends nothing; approve sends once; series promote sends once; on-behalf for a claimed client sends; an unclaimed client sends nothing
- verify: `npx vitest run src/features/notifications src/features/booking/mutations src/features/booking/series-cron.test.ts` · `npm run typecheck`
- commits: `refactor(notifications): send booking confirmations from one place` · `fix(booking): email confirmation only on the confirmed transition` · `fix(admin): send a confirmation when a booking is approved` · `fix(booking): fail closed when an admin role read errors` · `fix(booking): continue the series roll after one failure`
- notes: VERIFY B6 gives the shape — `sendBookingConfirmationFor(serviceClient, bookingId)`: one select (`status`, times, cents, `profiles(email, unclaimed)`, `services(name)`) plus status gate plus `shouldNotify` plus notify, called from the create mutation, `approveBooking`, the on-behalf path (widen its select) and the series promote. Collapses `loadConfirmationRow` and `approvalConfirmationRowSchema`; log the loader error. The on-behalf path has no session email, so recipient and `shouldNotify` come from the row. **No new templates here** — the "received" email and admin alerts are W3-S1. B8: the money-path role read and the cancel-path role read fail closed on error (the other two already do). `series-cron` continues instead of aborting mid-run; keep the engine behind `RECURRING_UI_ENABLED` (DECISIONS 9).

**W1-S10 · Pet form: species select, real File upload, species label** — B12 (pet-form half), B18 (photo half), U8 (raw species slug)

- owns: `src/features/accounts/_components/pet-form.tsx`, `src/features/accounts/_components/pet-form.test.tsx`, `src/features/accounts/_components/pet-list.tsx`, `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` (the `uploadPhoto` wrapper type only)
- reads: `src/components/ui/radio-group.tsx`, `src/app/showcase/showcase-client.tsx` (null-guard idiom), `src/app/(site)/(account)/account/bookings/_components/account-bookings-client.tsx` (`<SelectValue>{label}</SelectValue>` idiom), `src/features/pets/species.ts`
- TF: yes — rewrite the existing radio assertions to open the trigger and assert `option` roles
- verify: `npx vitest run src/features/accounts/_components` · `npm run typecheck` · `npm run lint`
- commits: `fix(accounts): replace the species radio track with a select` · `fix(accounts): upload cropped pet photos as named files` · `fix(accounts): render species labels in the pet list`
- notes: the 7-segment `RadioGroup` track clips inside the form cell; worst case is mobile (<640px, one column) including the pre-booking `/book` "Add a pet" path. Use the established `<SelectValue>{label}</SelectValue>` idiom (not `items=` on Root — no in-repo precedent), `aria-label="Species"`, null-guard `onValueChange`. B18: build `new File([croppedPhoto], "pet.jpg", { type })` once in `savePet` and narrow `PetFormActions.uploadPhoto` to `File`; the account wrapper stops supplying a filename; adjust the admin wrapper's type in `client-detail-client.tsx` only if it no longer compiles. `pet-list` renders the `SPECIES` label.

**W1-S11 · Auth pages onto the form recipe** — U2

- owns: `src/app/(auth)/**`, `src/proxy.ts`
- reads: `src/app/(auth)/claim/_components/claim-form.tsx` (the pattern), `src/components/form/**`
- TF: yes — the error-code → message mapping as a pure function; the password floor
- verify: `npx vitest run "src/app/(auth)"` · `npm run typecheck` · `npm run lint`
- commits: `refactor(auth): move login and signup onto the form recipe` · `fix(auth): show a reason when a sign-in link fails` · `fix(auth): raise the signup password floor to eight characters` · `fix(auth): run the claim route through the middleware`
- notes: port `/login` and `/signup` onto `useAppForm` + `Form` + `FormRootError` + `submitAction`, mapping error codes as `claim-form` does; read `searchParams.error` on `/login`. Approved copy only: "Your sign-in link has expired. Request a new one." · "Sign-in failed. Please try again." `/claim` gets the ShimmerCard shape and `variant="brand"`. `z.string().min(8)` on signup. Add `"/claim"` to the matcher.

### Wave 1 ownership check

Pairwise-disjoint: S1 (required-profiles, onboarding-_, owner/emergency schema, form-registry, form-card, meet-greet-scheduler, `(onboarding)/**`) · S2 (repository, cancel/admin cores, kiche, cancellation, `payments/**`, `account/bookings/page.tsx`) · S3 (`account/{pets,forms,inquiries}/**`, `account/page.tsx`) · S4 (`lib/supabase/proxy.ts`, `onboarding-redirect._`, `(account)/layout.tsx`, services-repo) · S5 (`reviews/**`, three inquiries files) · S6 (`supabase/migrations/**`) · S7 (account-actions, authorizations, accounts barrels) · S8 (edit-core, quantity-*, create-core, booking-service-shared, two tests) · S9 (`notifications/**`, `booking/mutations/**`, `booking/actions.ts`, approval-actions, series-cron) · S10 (pet-form, pet-list, client-detail-client) · S11 (`(auth)/\*\*`, `src/proxy.ts`). `src/proxy.ts`(S11) and`src/lib/supabase/proxy.ts` (S4) are different files.

**Wave 1 gate:** `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `supabase db reset` + `npm run test:integration` (W1-S6) · adversarial review per diff, budget weighted to W1-S2 (money), W1-S5 (security), W1-S6 (grants), W1-S7 (service-role writes). Manual smoke: sign up → onboarding without an emergency step → book a meet & greet (must reach pending, not "Please try another slot") → cancel a booking that already carries a partial refund.

---

## Wave 2 — Cal's admin works; edit paths; query and route hygiene

Cal cannot see the bookings that need approving, her availability paint silently reverts, and the house-sitting service blocks every rate edit. The remaining client-facing correctness items (drive buffer on edit, stored breakdown rendered) land alongside.

### Orchestrator-only changes applied before wave 2

- `src/content/marketing.ts`: delete the orphan `services.notice.*` keys (past their own 2026-09-01 expiry; D1). Note the removal for the ledger (W7-S4).
- `src/app/globals.css`: delete the `focus-text` block only; keep every `--u`/`data-ring-*` token (O3 revival is W3-S9).

### Slices

**W2-S1 · Availability mutations tell the truth** — B17, B9 (availability/overnight sites), D1 (dead availability actions), D4 (availability page casts)

- owns: `src/features/admin/availability-actions.ts`, `src/features/admin/availability-actions.test.ts`, `src/features/admin/overnight-actions.ts`, `src/features/admin/overnight-actions.test.ts`, `src/features/admin/window-slice.ts`, `src/features/admin/window-slice.test.ts`, `src/features/admin/index.ts`, `src/app/(site)/(admin)/admin/availability/**`
- reads: `src/app/layout.tsx` (toast provider), `src/features/admin/settings-schema.ts` (W0-S4)
- TF: yes — `bookingsInWindowSlice` extracted to `window-slice.ts` with overlap cases (a stay starting before the day, ending after it, spanning it)
- verify: `npx vitest run src/features/admin` · `npm run typecheck` · `npm run lint`
- commits: `fix(admin): surface availability conflicts instead of reverting silently` · `fix(admin): detect overlapping stays when gating a carve-out` · `fix(admin): stop returning raw errors from availability actions` · `refactor(admin): delete the unused availability server actions` · `refactor(admin): parse the availability settings row with the shared schema`
- notes: VERIFY B17 — `await` the action and toast the non-success result in all four callbacks of `availability-client.tsx` via the existing `useToast`; no `DayPainter`/`DayControls` change. Change the client gate from start-day matching to instant-overlap against the day-clamped slice; **defer** carrying `concurrency` on `AdminBusyRangeView` (owner list — aligning predicates first would make a 1h carve-out offer to cancel a whole house-sit). `parsed.error.message` is still raw in both action files — inline the log plus static string. Delete the superseded `"use server"` exports (`createWindow`/`trimWindow`/`deleteWindow` have zero callers) with their tests and barrel lines. Replace the raw `as number` casts on the availability page with `settingsRowSchema.safeParse`. Conflict messaging reuses the strings the server already returns; no new copy.

**W2-S2 · Availability painter keyboard access** — U4

- owns: `src/features/booking/_components/scheduler/day-painter.tsx`
- TF: no (UI); manual keyboard pass required
- verify: `npx vitest run src/features/booking/_components/scheduler` · `npm run typecheck` · `npm run lint` · manual keyboard pass on `/admin/availability`
- commits: `fix(booking): make availability blocks selectable by keyboard`
- notes: VERIFY U4 — `onClick={(e) => { if (e.detail === 0) setSelectedOpen(open) }}` on the block button (unguarded it fires after a mouse drag and resets the selection to the stale pre-drag `open`; `suppressNextClick` is written and never read — delete it or read-and-clear it). Arrow-key `onKeyDown` on the two handles reusing `commitBounds`, then `setSelectedOpen`. Fix the two stale header claims. No new copy — the existing `aria-label` already says "activate to edit". The eraser track drag still has no keyboard path — log it. Lands before W3-S3 rewrites the selection model.

**W2-S3 · Admin bookings window and attention counts** — B16, D8, D2 (bookings-calendar day key)

- owns: `src/app/(site)/(admin)/admin/bookings/**`, `src/app/(site)/(admin)/admin/page.tsx`, `src/app/(site)/(admin)/admin/_components/**`, `src/app/(site)/(admin)/layout.tsx`, `src/features/admin/attention-counts-query.ts`, `src/features/admin/attention-counts-query.test.ts`, `src/features/admin/attention-counts.ts`, `src/features/admin/approval-actions.ts`, `src/features/admin/nav-badges-action.ts`, `src/features/admin/bookings-calendar-actions.ts`, `src/features/admin/bookings-calendar-actions.test.ts`, `src/features/admin/bookings-view.ts`, `src/features/admin/bookings-view.test.ts`, `src/lib/admin-guard.ts`, `src/lib/supabase/service.ts`, `src/components/header-auth-client.tsx`
- reads: `src/lib/time-of-day.ts` (W0-S2), `src/lib/supabase/server-cache.ts` (the `cache()` pattern)
- TF: yes — the overlap predicate in `listBookingsInRangeCore` (a stay spanning the month boundary in each direction); count-only queries return the same integers as the row reads (characterize first)
- verify: `npx vitest run src/features/admin` · `npm run typecheck` · `npm run lint`
- commits: `fix(admin): source pending approvals from the unbounded query` · `feat(admin): drive the bookings calendar from a month parameter` · `fix(admin): include in-progress stays in the bookings window` · `perf(admin): count attention items instead of listing rows` · `refactor(admin): use the shared day-key formatter`
- notes: VERIFY B16 rejects `endIso = month+13`. Ship the follow-up now: `?month=YYYY-MM` drives the window, an optional `onMonthChange` prop on `MonthGrid` pushes it, the caption follows the param, and the predicate becomes a true overlap (`lt starts_at endIso` and `gte ends_at startIso`). Source `pendingApprovals` from `listPendingBookings()` in both the attention query and the dashboard (`final_cents` is NOT NULL, so its parse is safe). D8: three `select("id", { count: "exact", head: true })` queries; the dashboard reuses `getAttentionCounts()`; wrap `createServiceClient` and `assertActorIsAdmin` in React `cache()`; one badge-mapping object; delete the never-rendered `flaggedConflicts`/`recentReviews`. D2: `bookings-calendar-client.tsx` imports `denverDayKey` and redefines it — delete the local copy. Report `getActiveBusyRangesEnriched` (second unbounded forward read) to W2-S8.

**W2-S4 · Admin client detail** — B18 (rest), B10 (client-detail reads), B9 (clients/onbehalf actions), D10 (client-detail core), D3 (adoption)

- owns: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/**`, `src/app/(site)/(admin)/admin/clients/[clientId]/page.tsx`, `src/features/admin/clients-actions.ts`, `src/features/admin/clients-actions.test.ts`, `src/features/admin/clients-view.ts`, `src/features/admin/clients-view.test.ts`, `src/features/admin/onbehalf-actions.ts`, `src/features/admin/onbehalf-actions.test.ts`
- reads: `src/features/accounts/form-registry.ts`, `src/features/booking/meet-greet-upcoming.ts`, `src/features/pets/pets-repo.ts`, `src/test-stubs/fake-supabase.ts`
- TF: yes — `pickLivePayment` / `toBookingViews` / `hasUpcomingMeetGreet` as pure functions against fixtures; a legacy `form_key` row is excluded from both the count and the map; a failing debits read fails the action
- verify: `npx vitest run src/features/admin/clients-actions.test.ts src/features/admin/onbehalf-actions.test.ts src/features/admin/clients-view.test.ts` · `npm run typecheck` · `npm run lint`
- commits: `fix(admin): skip legacy form keys on the client detail page` · `fix(admin): identify meet and greets by service slug` · `fix(admin): link disputes to the live stripe dashboard` · `fix(admin): fail client detail reads instead of showing empty state` · `fix(admin): return static error text from client and on-behalf actions` · `refactor(admin): load client detail queries in parallel` · `refactor(admin): use the shared pets repository and column list`
- notes: VERIFY B18 — filter **once** (`const known = client.forms.filter(f => f.form_key in formRegistry)`) for the counts and the map, or "N on file" over-reports; legacy `home`/`pet` rows then go invisible to Cal (owner list). Select `services(slug)` and reuse `deriveMeetGreetUpcoming` in both places (services can be renamed). Drop `/test/` from the dispute link. B10: check the five reads; fail the action on the debits read. D10: `Promise.all` the five independent queries, split mapping from IO, aggregate payment rows for `retainedHalfLabel`. Adopt `listClientPets` and `PET_COLUMNS` from `@/features/pets` in `onbehalf-actions.ts`. The per-section component split is W6-S3; the admin-side breakdown rendering is W5-S1.

**W2-S5 · Client booking breakdown and account bookings formatters** — B14 (client half), D2 (account bookings adoption)

- owns: `src/features/booking/_components/quote-panel.tsx`, `src/features/booking/_components/quote-panel.test.tsx`, `src/features/booking/_components/quote-lines.tsx`, `src/features/booking/_components/quote-lines.test.tsx`, `src/app/(site)/(account)/account/bookings/page.tsx`, `src/app/(site)/(account)/account/bookings/_components/**`
- reads: `src/features/pricing/display.ts`, `src/lib/time-of-day.ts` (W0-S2), `src/features/payments/projection.ts`
- TF: yes — `QuoteLines` renders nothing for a legacy `{}` breakdown and one row per line otherwise
- verify: `npx vitest run src/features/booking/_components/quote-lines.test.tsx src/features/booking/_components/quote-panel.test.tsx "src/app/(site)/(account)/account/bookings"` · `npm run typecheck` · `npm run lint`
- commits: `refactor(booking): extract the quote lines from the quote panel` · `feat(account): show the price breakdown on a booking` · `fix(account): build the bookings calendar from the filtered list` · `refactor(account): use the shared denver and money formatters`
- notes: VERIFY B14 — extract the lines block of `QuotePanel` as `QuoteLines` (`QuotePanel` is a live-estimate surface with a "Live" pill and a Book CTA; do not reuse it wholesale); add `quote_breakdown` to the page select; guard legacy `{}`. No new `quoteInputSchema` (validate only `quote_inputs.config` via `parsePricingConfig` — W5-S1). Carry-through of `enabledManualIds` is deferred to F3 (latent today). Build the hub calendar from `filtered`. Repoint the four Denver copies and inline money formatting in `account-bookings-client.tsx`; output must not change (snapshot before/after). DECISIONS 4: lines are visible to the client.

**W2-S6 · Admin services and settings: unblock house-sitting edits** — B19, D4 (settings-actions adoption), B9 (settings-actions), U8 (settings field errors, services toast, page-title register)

- owns: `src/features/admin/pricing-config-fields.ts`, `src/features/admin/pricing-config-fields.test.ts`, `src/features/admin/services-actions.ts`, `src/features/admin/settings-actions.ts`, `src/app/(site)/(admin)/admin/services/**`, `src/app/(site)/(admin)/admin/settings/**`
- reads: `src/features/admin/settings-schema.ts` (W0-S4), `src/features/booking/use-booking-scheduler.ts` (the `pricing_type === "house_sitting"` mode predicate)
- TF: yes — a house-sitting fixture saves with `default_duration_min: null`; a walk service still requires a duration of at least 1; update the existing duration cases
- verify: `npx vitest run src/features/admin/pricing-config-fields.test.ts "src/app/(site)/(admin)/admin/services"` · `npm run typecheck` · `npm run lint`
- commits: `fix(admin): stop requiring a duration on per-night services` · `refactor(admin): parse settings with the shared schema` · `fix(admin): report field errors when saving settings` · `fix(admin): confirm service saves with a toast`
- notes: VERIFY B19 — thread `service.pricing_type` (already in scope in `service-edit-form.tsx`) into `validateEditableFields` and `PricingFieldsEditor`; require and render the duration only when `pricing_type !== "house_sitting"`. The guard blocks house-sitting **rate** edits too, not just the no-op approval flip. `settings-actions` adopts `settingsRowSchema` and the error convention; settings save reports field-level errors through the existing `zodFieldErrors` shape; services "Saved!" uses the existing toast; page titles use the nav labels ("Services", not "Services Editor"). Leave the dead `listServices` export for W3-S7 (its barrel line is not owned here).

**W2-S7 · Admin clients index semantics** — U3, D1 (`table.tsx`)

- owns: `src/app/(site)/(admin)/admin/clients/_components/**`, `src/app/(site)/(admin)/admin/clients/page.tsx`, `src/components/ui/table.tsx` (delete)
- TF: no (markup); manual keyboard and screen-reader pass
- verify: `npm run typecheck` · `npm run lint` · keyboard-only pass on `/admin/clients`
- commits: `fix(admin): restore table semantics on the clients index` · `refactor(ui): delete the unused table primitive`
- notes: VERIFY U3 — rows are already keyboard-operable through the inner `Link`; only sorting is unreachable. Delete `role`/`tabIndex`/`aria-label`/`onKeyDown` from rows (this also kills Enter-on-status-select navigating away), wrap the header label in `<button type="button">`, keep `aria-sort` on the `<th>`, add a focus-visible ring on the inner `Link`. Do **not** adopt `table.tsx` here (the mobile `<ul>` is a different card); delete it. Report the `FRONTEND.md` kit-list correction (drop "table"; the table-to-cards line is accurate) for W7-S3.

**W2-S8 · Booking edit: drive buffer and settings parsed at the edge** — B5 (edit buffer half), D4 (repository and form-data adoption), D9 (repository bounds)

- owns: `src/features/booking/edit-core.ts`, `src/features/booking/booking-repository.ts`, `src/features/booking/booking-form-data.ts`, `src/features/booking/edit-booking.test.ts`, `src/features/booking/booking-service.integration.test.ts`, `src/app/(site)/(account)/account/bookings/[id]/edit/**`, `src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`
- reads: `src/features/booking/drive-buffer-guard.ts` (W0-S12), `src/features/admin/settings-schema.ts` (W0-S4), W1-S2's `excludeBookingId`
- TF: yes — an edit into a buffer-violating slot is refused; a comments-only edit of the same booking is not; a settings row missing a column fails the parse loudly rather than yielding `NaN`
- verify: `npx vitest run src/features/booking/edit-booking.test.ts` · `npm run typecheck` · `npm run lint` · `npm run test:integration` before reporting done
- commits: `fix(booking): apply the drive buffer guard when editing a booking` · `refactor(booking): parse settings rows at the edge` · `perf(booking): bound the availability and series reads`
- notes: call W0-S12's guard from `edit-core` with `excludeBookingId` (without it the edit self-overlaps and every non-time edit reads "unavailable"); pass `viewerDriveBufferMin` to the edit picker on both the account and admin edit pages (only the book page supplies it today). **Defer `reschedule-core`** to W5-S7 (`getBookingTimes` returns no concurrency or coordinates). D4: replace the repository's hand-written settings shape with `settingsRowSchema.pick()` + `safeParse`, derive the select from `SETTINGS_COLUMNS`, delete the six raw `as number` casts in `booking-form-data.ts`, wrap `getSettings` in React `cache()`, return the drive-buffer fields from `loadBookingFormData`. D9: `.limit()` on `getOpenWindows`, `getOpenNights`, `getActiveSeries`, `getActiveBusyRanges`, `getActiveBusyRangesEnriched` and `listWindowsCore`; delete the dead `hasFormResponse`. The admin edit page's kiche control is not owned here (W5-S1).

**W2-S9 · Cron route hygiene** — D14 (adoption), D4 (reminder-cron settings), D9 (completion bound)

- owns: `src/app/api/cron/**`, `src/features/notifications/completion-cron.ts`, `src/features/notifications/completion-cron.test.ts`, `src/features/notifications/completion-cron.integration.test.ts`, `src/features/notifications/reminder-cron.ts`, `src/features/notifications/reminder-cron.test.ts`, `src/features/notifications/reminder-cron.integration.test.ts`
- reads: `src/lib/cron-auth.ts` (W0-S5), `src/features/admin/settings-schema.ts` (W0-S4), `src/test-stubs/fake-supabase.ts` (W0-S7)
- TF: yes — bulk completion issues one update for N bookings (recording fake); a bad bearer returns 401 without touching the DB
- verify: `npx vitest run src/app/api/cron src/features/notifications/completion-cron.test.ts src/features/notifications/reminder-cron.test.ts` · `npm run typecheck` · `npm run lint`
- commits: `refactor(api): share the cron authorization check` · `fix(api): handle failures in the completion and series crons` · `fix(notifications): bound and order the reminder batch` · `refactor(notifications): complete bookings in one update`
- notes: adopt `assertCronAuth` in all three routes; copy the reminders try/catch into the other two; `maxDuration` on both (report the `vercel.json` change); `.order("starts_at")` + `.limit(100)` on the reminder batch; collapse the completion loop to one bulk update; `reminder-cron` adopts `settingsRowSchema`. The schedule stays daily (DECISIONS 10); `reminder_sent_at` already makes an hourly schedule safe if the plan changes.

**W2-S10 · Live availability hooks: polling, batching, memoization** — D9 (hooks half), D2 (`availability.ts` formatter hoist), D1 (unread availability derivations)

- owns: `src/features/booking/use-busy-ranges.ts`, `src/features/booking/busy-ranges.ts`, `src/features/booking/busy-ranges.test.ts`, `src/features/booking/use-availability.ts`, `src/features/booking/use-availability.test.ts`, `src/features/booking/use-overnight-nights.ts`, `src/features/booking/availability.ts`, `src/features/booking/availability.test.ts`, `src/features/booking/hourly-scheduler-data.ts`, `src/features/booking/hourly-scheduler-data.test.ts`, `src/features/booking/calendar-model.ts`, `src/features/booking/calendar-model.test.ts`, `src/features/booking/schedule-selection.ts`, `src/features/booking/schedule-selection.test.ts`
- reads: `src/lib/time-of-day.ts` (W0-S2), `src/features/pets/pets-repo.ts` (W0-S3), W1-S6's realtime publication
- TF: yes — `deriveOpenSlots` memoization is behavior-neutral (assert output identity across recomputes) or, if D1's "unread" claim holds, its deletion; bounded overnight read asserts `.gte("night", today)` via the recording fake
- verify: `npx vitest run src/features/booking/availability.test.ts src/features/booking/busy-ranges.test.ts src/features/booking/use-availability.test.ts src/features/booking/calendar-model.test.ts` · `npm run typecheck` · manual: two browsers on `/book`, a new booking appears within the poll interval
- commits: `perf(booking): back off the busy-range poll and cache signed urls` · `perf(booking): batch and bound the client availability reads` · `refactor(booking): hoist the availability time formatters` · `refactor(booking): delete unread availability derivations`
- notes: realtime now fires for the two anon-readable tables; keep the poll as a fallback at ~5 min, pause when the document is hidden, cache signed URLs for their TTL. `Promise.all` the independent reads; batched `createSignedUrls`; `useMemo` around `deriveOpenSlots` **unless** it is genuinely unread, in which case delete `deriveOpenSlots`/`openSlots` (D1) — confirm with a grep and say which. `.gte("night", today)` on the browser `overnight_nights` read. Hoist the three per-call `Intl` formatters in `availability.ts` (~1,100 constructions per recompute). Delete `markSlotsBusy` and the dead `schedule-selection` export (D1). Repository-side bounds are W2-S8.

**W2-S11 · Migrations, wave 2** — B11 (grant narrowing), D16 (dead columns, redundant index, pgTAP), O5

- owns: `supabase/migrations/**`, `supabase/tests/**`
- reads: `src/features/accounts/account-actions.ts` as W1-S7 left it (`runUpdatePet`'s exact column set)
- verify: `supabase db reset` · `npm run test:integration` · manual: a client edits a pet and uploads a photo
- commits: `fix(db): scope client write grants to the columns clients edit` · `refactor(db): drop unreachable admin write policies` · `refactor(db): drop unused pet identity columns` · `test(db): delete the orphaned pgtap suite`
- notes: now that `photo_url` is written with the service client, narrow: `revoke update on bookings from authenticated` outright (every bookings write already uses the service client — VERIFY B11), `grant update (name, species, breed, notes, birthdate) on pets` (exactly what `runUpdatePet` writes — re-read it first), drop `email` from the `profiles` grant. Delete the ~8 unreachable admin-write RLS policies. Drop the 8 dead `pets` identity columns (W1-S1 moved vet capture to the owner form) and the dead `form_responses.booking_id`; drop the redundant `form_responses_client_id_idx`. Delete the orphaned pgTAP pair and note that Vitest covers RLS. Append-only; never retro-edit the shipped seed.

**W2-S12 · Marketing routes static and lean** — D7, B15 (cast half), D1 (unused public assets)

- owns: `src/app/(site)/(marketing)/layout.tsx`, `src/app/(site)/(marketing)/page.tsx`, `src/app/(site)/(marketing)/about/**`, `src/app/(site)/(marketing)/resources/**`, `src/app/(site)/(marketing)/gallery/**`, `src/app/(site)/(marketing)/services/page.tsx`, `src/components/marketing/faq-accordion.tsx`, `src/components/layout/site-footer.tsx`, `src/components/effects/card-shimmer.tsx`, `src/features/gallery/**`, `src/features/seo/**`, `src/app/showcase/**`, `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `src/app/old.ico`
- reads: `src/features/booking/services-repo.ts`, `src/components/marketing/service-photo-strip.tsx` (the `placeholder={x ? "blur" : "empty"}` idiom)
- TF: no; the route-table check is the test
- verify: `npm run build` (confirm `○` for `/about`, `/contact`, `/gallery`, `/resources`) · `npx vitest run src/features/gallery src/features/seo` · `npm run lint`
- commits: `perf(marketing): keep the marketing layout static` · `perf(marketing): server-render the resources cards` · `fix(gallery): type image placeholder lookups` · `chore: delete unused public assets`
- notes: drop `makesOffer` from the marketing layout node and emit `buildBusinessJsonLd(services)` on `/services` (which already fetches and revalidates) — this de-dynamises four routes and removes the build-time Supabase dependency. Server-render the resources cards with a small client filter toggling `hidden`; pass resolved FAQ strings from the server page. B15 (VERIFY): type the dynamic placeholder maps `Record<string, string | undefined>`, delete the static casts, reuse the `blur`/`empty` idiom on the about page, and fix the sixth cast plus the three hardcoded hashed `/services/walk/*.jpg` names in `showcase-client.tsx`; no new `blurFor` helper. Wrap the gallery `<ul>` in `RevealGroup`. Report to the orchestrator: `gallery-sync` should emit width/height into `image-placeholders.json`.

### Wave 2 ownership check

Pairwise-disjoint: S1 (availability/overnight actions, `window-slice.*`, `admin/index.ts`, `admin/availability/**`) · S2 (`scheduler/day-painter.tsx`) · S3 (`admin/bookings/**`, `admin/page.tsx`, `admin/_components/**`, `(admin)/layout.tsx`, attention-counts*, approval-actions, nav-badges-action, bookings-calendar-actions*, bookings-view*, `lib/admin-guard.ts`, `lib/supabase/service.ts`, header-auth-client) · S4 (`clients/[clientId]/_components/**`, `clients/[clientId]/page.tsx`, clients-actions*, clients-view*, onbehalf-actions*) · S5 (quote-panel*, quote-lines*, `account/bookings/page.tsx`, `account/bookings/_components/**`) · S6 (pricing-config-fields*, services-actions, settings-actions, `admin/services/**`, `admin/settings/**`) · S7 (`admin/clients/_components/**`, `admin/clients/page.tsx`, `ui/table.tsx`) · S8 (edit-core, booking-repository, booking-form-data, two tests, `account/bookings/[id]/edit/**`, admin `bookings/[bookingId]/edit/page.tsx`) · S9 (`api/cron/**`, completion-cron*, reminder-cron\*) · S10 (the availability hooks and their tests) · S11 (`supabase/**`) · S12 (marketing routes minus `book/**`, `contact/**`, `reviews/**`; gallery, seo, showcase, public assets). `account/bookings/_components/**` (S5) and `account/bookings/[id]/edit/**` (S8) are disjoint subtrees; `clients/[clientId]/_components/**` (S4) and `clients/[clientId]/bookings/[bookingId]/edit/page.tsx` (S8) are disjoint; `clients/[clientId]/**` (S4) and `clients/_components/**` (S7) are disjoint.

**Wave 2 gate:** `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `supabase db reset` + `npm run test:integration` (W2-S11) · `npm run build` (route table from W2-S12) · adversarial review per diff, weighted to W2-S11 (a wrong revoke breaks client edits), W2-S8 (guard and bounds) and W2-S3 (predicate change). Manual: Cal approves a next-month booking from the hub; paints and un-paints availability with a conflicting stay present and sees a message; saves a house-sitting rate; a client edits a pet and uploads a photo.

---

## Wave 3 — Owner features, loaders, structure part 1, generated types (tail)

Behavior on the paths that carry money and clients is now correct. This wave lands the redesigned availability editor, the kill-switch, the service-area gate, the notification templates (disabled), the first loader extractions, and — as a sequential tail once everything else is green — the generated Supabase types that wave 4 fans out.

### Orchestrator-only changes applied before wave 3

- `src/app/globals.css`: delete the dead tokens (`--tex-wood`, `--button-shimmer*`, `--chart-*`, `--brand-hot`); **keep** the `--u`/`data-ring-*` plumbing.
- `src/lib/design-tokens.ts`: delete `SEMANTIC_COLORS` and the `zIndex` export that contradicts the live `z-[100]`.

### Slices

**W3-S1 · Notifications: received email, admin alerts (disabled), payments-aware builder** — O1 (shipped disabled), F4 (email half), D13 (email shell, reply-to)

- owns: `src/features/notifications/**`
- reads: `src/lib/payments-enabled.ts` (W0-S6), W1-S9's `sendBookingConfirmationFor`
- TF: yes — the pure builder for both flag states and every event; the dispatcher sends nothing to Cal when `ADMIN_NOTIFICATION_EMAIL` is unset; a `pending_approval` create produces the "received" event and a `confirmed` transition the "confirmed" event
- verify: `npx vitest run src/features/notifications` · `npm run typecheck` · `npm run lint`
- commits: `feat(notifications): send a booking received email on create` · `feat(notifications): add admin alert emails behind an address variable` · `feat(notifications): omit prepay wording when payments are disabled` · `refactor(notifications): share one email shell and set a reply-to`
- notes: DECISIONS 5. The "received" template and the three admin alerts (new booking request, new inquiry, client cancellation) are **new user-facing text not on the approved list**: draft them in the third-person system register, ship them unreachable with the env var unset, and put wording sign-off on the owner list. One `NotificationEvent` variant plus builder per alert, dispatched beside the client send; no user-side toggles. `paymentsEnabled` parameter on the pure builder drops the prepay sentence. Collapse the duplicated HTML shell, add `reply_to`, resolve the recipient from one source, add the booking link both templates lack. The inquiry-side dispatch call lives in `inquiry-actions.ts` and the cancel-side in `cancel-core.ts` — not owned here: expose the functions and report the two one-line call sites for the wave-4 owners of those directories.

**W3-S2 · Payments kill-switch gate points** — F4 (gate half)

- owns: `src/app/(site)/(account)/account/bookings/_components/prepay-button.tsx`, `src/app/(site)/(account)/account/bookings/_components/prepay-dialog.tsx`, `src/features/payments/create-intent.ts`, `src/features/payments/payments.integration.test.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`
- reads: `src/lib/payments-enabled.ts` (W0-S6)
- TF: yes — both modes (DECISIONS 2): the action early-returns with the flag off; the webhook 404s; the button is absent
- verify: `npx vitest run src/features/payments src/app/api/webhooks` · `npm run typecheck` · `npm run lint`
- commits: `feat(payments): gate the prepay flow behind the payments flag`
- notes: gate points — the prepay button hidden; `createPrepayIntent` early-returns reusing the existing `prepay-dialog` disabled string; the webhook route returns 404; the admin cancel confirm reuses the existing `client-detail-client` string. Off means balances still show as owed and the admin "Unpaid" pill stays. The block-off confirm's refund line lives in `availability-client.tsx` (W3-S3 owns it this wave — that slice applies the one-line omission). Report DESIGN.md lines for W7-S1.

**W3-S3 · Multi-day availability editor (UX redesign)** — F1, D10 (scheduler drag extraction), F4 (block-off confirm line), U4 (keyboard model)

- owns: `src/features/booking/schedule-capabilities.ts`, `src/features/booking/_components/scheduler/**`, `src/features/booking/use-schedule-selection.ts`, `src/app/(site)/(admin)/admin/availability/**`
- reads: `docs/FRONTEND.md`, `docs/COMPONENT_SYSTEM.md`, `src/features/admin/availability-actions.ts` (batch write paths), W2-S1's toast wiring and `window-slice.ts`, `src/lib/payments-enabled.ts`
- skill: **impeccable**
- TF: yes — the pure selection reducer (anchor, range extend, toggle, clear, keyboard step) as a plain module outside the client component; batch dedupe of overlapping rows; `commitBounds` after the drag hooks are extracted
- verify: `npx vitest run src/features/booking/_components/scheduler src/features/booking/use-schedule-selection.test.ts` · `npm run typecheck` · `npm run lint` · manual mouse and keyboard pass on `/admin/availability` including a range across a month boundary
- commits: `refactor(booking): extract the day painter drag hook` · `refactor(booking): extract the month grid drag hook` · `feat(booking): support multi-day selection in the availability editor` · `feat(admin): apply availability changes across selected days`
- notes: DECISIONS 8 — a selection-model redesign, not a flag flip. Model: click selects a day; click-drag selects a contiguous range; shift-click extends from the anchor; ctrl/cmd-click toggles one day; Escape or "Clear dates" resets; full keyboard equivalence (arrows move focus, Space toggles, Shift+arrows extend). Affordances: a visible selected state that survives focus changes; a persistent `SelectionSummary` with the count and a `ClearDates` control; the day-controls header states the scope of the next action. Wire-through: flip `daySelection` to `"multi"`; `DayControls` and `handleAddWindow` take all selected `dayKeys` (`checked = every()`); `.sort()[0]` for single-day affordances; dedupe before dispatch (`createWindowsBatchCore` does not). Skip bulk block-out. Extract `use-day-painter-drag.ts` and `use-month-grid-drag.ts` first as structural commits (D10). **Approved strings only**: "N days selected" · "for these days" · "Pick one or more days" · "Applies to all selected days". Also omit the refund line from the block-off confirm when payments are off (F4). Report DESIGN.md/FRONTEND.md lines for wave 7.

**W3-S4 · Booking loaders: service page and edit view** — D5 (parts 1–2), D3 (adoption), U1 (book and edit page shells), B10 (book page read error)

- owns: `src/app/(site)/(marketing)/book/**`, `src/features/booking/service-detail.ts`, `src/features/booking/service-detail.test.ts`, `src/features/booking/services-repo.ts`, `src/features/booking/services-repo.test.ts`, `src/features/booking/load-service-booking-page.ts`, `src/features/booking/load-service-booking-page.test.ts`, `src/features/booking/booking-edit-view.ts`, `src/features/booking/booking-edit-view.test.ts`, `src/features/booking/booking-form-data.ts`, `src/features/booking/index.ts`, `src/app/(site)/(account)/account/bookings/[id]/edit/page.tsx`
- reads: `src/features/pets/pets-repo.ts` (W0-S3), `src/components/layout/**` (`PageContainer`, `PageHeader`, `BackToSite`), `src/components/feedback/error-state.tsx`
- TF: yes — pure `toServiceDetail(row)` (copied 4× today); the loaders against the recording fake
- verify: `npx vitest run src/features/booking/service-detail.test.ts src/features/booking/load-service-booking-page.test.ts src/features/booking/booking-edit-view.test.ts src/features/booking/services-repo.test.ts` · `npm run typecheck` · `npm run lint` · `npm run build` (route shape unchanged)
- commits: `refactor(booking): extract a service detail mapper` · `refactor(booking): move the booking page loader into the feature` · `refactor(booking): move the edit view loader into the feature` · `fix(booking): surface service load failures instead of a not-found` · `refactor(booking): put the booking and edit pages on the standard shell`
- notes: the booking page is ~290 lines of queries, mapping and URL signing — it becomes routing only behind `loadServiceBookingPage(client, slug)`; the account edit page becomes routing only behind `getBookingEditView(client, id)`. Both adopt `listClientPets` (two more of the five copies). Pure moves first, then the U1 shell (`<main>` → `<div>`, `PageContainer width="narrow"` + `PageHeader` + `BackToSite`, `<ErrorState>` for load failures) and the B10 read-error fix as separate commits. The admin book/edit pages reuse these loaders in W6-S1. Exports go on `booking/index.ts` only — do not touch `index.client.ts`.

**W3-S5 · Account forms loader** — D5 (part 2, forms), U1 (forms page)

- owns: `src/features/accounts/forms-repo.ts`, `src/features/accounts/forms-repo.test.ts`, `src/features/accounts/index.ts`, `src/app/(site)/(account)/account/forms/**`
- reads: `src/features/accounts/form-registry.ts`, the second copy of the form-scope keying rule in `book/[serviceSlug]/page.tsx` (W3-S4 is replacing it; both must call the same rule)
- TF: yes — the form-scope keying rule, tested once
- verify: `npx vitest run src/features/accounts/forms-repo.test.ts "src/app/(site)/(account)/account/forms"` · `npm run typecheck` · `npm run lint`
- commits: `refactor(accounts): extract the client forms loader`
- notes: `listClientForms(client, clientId)` on the accounts barrel; the forms page becomes routing only. Coordinate with W3-S4 by contract, not by file: W3-S4 imports `listClientForms` from `@/features/accounts` — this slice must land the export under that exact name.

**W3-S6 · Oversized units: repository split, timeline move, artifact gates** — D10 (repository, timeline, `computeBookingArtifacts` gates)

- owns: `src/features/booking/booking-repository.ts`, `src/features/booking/booking-repository-types.ts`, `src/features/booking/booking-service-shared.ts`, `src/features/booking/compute-artifacts-validation.test.ts`, `src/features/booking/booking-service.integration.test.ts`, `src/features/admin/_components/**`, `src/app/(site)/(admin)/admin/bookings/_components/**`, `src/app/(site)/(admin)/admin/_components/**`
- TF: yes — the two front gates of `computeBookingArtifacts` get direct unit tests once extracted
- verify: `npx vitest run src/features/booking/compute-artifacts-validation.test.ts src/features/admin` · `npm run typecheck` · `npm run lint`
- commits: `refactor(booking): split the repository types from the adapter` · `refactor(booking): extract the front gates of compute booking artifacts` · `refactor(admin): move the booking day timeline into the feature`
- notes: **structural commits only.** Split `booking-repository.ts` (~1,400 lines) at the type/impl seam, keeping the interface (consumers already `Pick<>`), so the client barrel stops reaching the whole adapter through one value re-export. Move `BookingDayTimeline` from `app/` into `features/admin/_components`. Extract the two front gates. Leave `use-booking-scheduler.ts` and `settings-client.tsx` alone. The reviewer's job is to confirm zero behavior change.

**W3-S7 · Delete dead code** — D1 (remaining groups)

- owns: `src/features/pricing/types.ts`, `src/features/pricing/index.ts`, `src/features/admin/index.ts`, `src/features/admin/approval-actions.ts`, `src/features/admin/premium-days-actions.ts`, `src/features/admin/overnight-actions.ts`, `src/features/admin/services-actions.ts`, `src/components/ui/tabs.tsx`
- reads: the dead-code lens's "Suggested order"
- verify: `npm run typecheck` · `npm run lint` · `npm run test:unit`
- commits: `chore(pricing): delete the unused pricing type surface` · `chore(admin): delete unused admin server actions` · `chore(components): delete the unused tabs primitive`
- notes: mechanical deletes, one commit per group; `tsc` proves the type deletes. The superseded `"use server"` exports are live RPC endpoints — delete them and their barrel lines. The stale `Task 9` guard comment goes with the pricing types. Delete the exported-but-file-local values only in owned files; report the rest. The `booking/index.ts` wildcard re-export belongs to W3-S4 — report it. **Do not delete** the O2 cores, `cursor-ring` (W3-S9), `public/brand/*`.

**W3-S8 · Service-area gate and address hint** — F5, F6

- owns: `src/features/accounts/service-area.ts`, `src/features/accounts/service-area.test.ts`, `src/features/accounts/account-actions.ts`, `src/features/accounts/account-actions.integration.test.ts`, `src/features/accounts/onboarding-action.ts`, `src/features/accounts/onboarding-action.integration.test.ts`, `src/features/admin/create-client-actions.ts`, `src/features/admin/create-client-actions.test.ts`, `src/features/accounts/_components/profile-fields.tsx`, `src/features/accounts/_components/profile-fields.test.ts`, `src/app/(onboarding)/onboarding/_components/info-step.tsx`, `src/app/(onboarding)/onboarding/_components/info-step.test.tsx`, `src/app/(site)/(account)/account/_components/profile-form.tsx`
- reads: W1-S7's geocoder DI (hard prerequisite), `src/lib/haversine.ts`, `src/features/admin/settings-actions.ts` (`getSettings`, session-readable), `src/features/pricing/distance.ts` (`deriveApproval`)
- TF: yes — in-area ZIP saves; a ZIP inside the dataset but beyond 50 mi refuses; unknown ZIP refuses; the admin path only warns
- verify: `npx vitest run src/features/accounts src/features/admin/create-client-actions.test.ts` · `npm run typecheck` · `npm run lint`
- commits: `feat(accounts): reject addresses outside the service area` · `feat(admin): warn when a new client is outside the service area` · `feat(accounts): hint that unit numbers go on the street line`
- notes: `checkZipServiceArea(client, zip)` ≈ 25 lines: geocode + `getSettings()` + `haversineMiles` + `deriveApproval === "refuse"`, with an **unknown ZIP counting as out of area** (DECISIONS 3 — a distance-only gate is a no-op for the case Cal describes). Origin = settings origin, radius 50 mi. One geocode serves both the gate and W1-S7's persist. Client: `fieldErrors.zip`; onboarding: `validation_error`; admin: warn only. Approved copy: "That address is outside Cal's service area." F6: `hint`/`placeholder` props only, approved copy "Street address, apt or unit"; reject the separate-column route; check whether `autoComplete="street-address"` collapses a two-line autofill and note the finding.

**W3-S9 · Cursor ring, proximity only** — O3 (N17), D1 (`focus-text`)

- owns: `src/components/effects/**`, `src/components/layout/page-shell.tsx`, `src/components/account-menu.tsx`, `src/components/layout/sign-in-link.tsx`
- reads: `src/app/globals.css` (the `--u`/`data-ring-*` plumbing, orchestrator-only)
- skill: **impeccable**
- verify: `npm run typecheck` · `npm run lint` · manual at three viewports with `prefers-reduced-motion` on and off; keyboard navigation unaffected
- commits: `refactor(effects): delete the unused focus text effect` · `feat(effects): revive the cursor ring in proximity mode` · `fix(effects): re-measure the ring when the auth cluster mounts`
- notes: DECISIONS 6 — proximity-only caret sweep, no site-wide glow; delete `FocusText` and the glow-only branches. Fix the tester-reported caret proximity bug: a two-line re-measure when the async auth cluster mounts. Remove the `page-shell` CursorRing prose that no longer matches. Report the glow half of the `globals.css` block for the orchestrator (keep the proximity half). Touch only ring plumbing in `account-menu` and `sign-in-link` (W5-S4 owns their a11y).

**W3-S10 · Generated Database types (tail — runs after every other wave-3 slice is green)** — D11 (generation and wiring)

- owns: `src/lib/supabase/**`
- reads: the schema as W2-S11 left it
- verify: `npm run db:types` (regenerates identically) · `npx vitest run src/lib/supabase` · `npx tsc --noEmit 2>&1 | tee typecheck-inventory.txt` — the per-directory error inventory **is** the deliverable; record it in the handoff, do not fix it
- commits: `feat(supabase): generate database types` · `refactor(supabase): type the supabase client factories`
- notes: `supabase gen types typescript --local > src/lib/supabase/database.types.ts`; parameterise the five factories (`client`, `server`, `service`, `static`, `proxy`) with `Database`. **Do not fix downstream errors** — wave 4 fans them out by directory. **Do not** enable `noUncheckedIndexedAccess` (W6-S9). This is the only slice permitted to leave the tree red, and it runs alone after the rest of wave 3 has passed its gate.

### Wave 3 ownership check

Pairwise-disjoint: S1 (`notifications/**`) · S2 (prepay-button, prepay-dialog, create-intent, payments integration test, webhook route, client-detail-client) · S3 (schedule-capabilities, `scheduler/**`, use-schedule-selection, `admin/availability/**`) · S4 (`book/**`, service-detail*, services-repo*, two loader modules, booking-form-data, `booking/index.ts`, account edit `page.tsx`) · S5 (forms-repo*, `accounts/index.ts`, `account/forms/**`) · S6 (booking-repository, repository-types, booking-service-shared, two tests, `admin/_components/**`, `admin/bookings/_components/**`, `admin/admin/_components/**`) · S7 (pricing types/index, `admin/index.ts`, four admin action files, `ui/tabs.tsx`) · S8 (service-area*, account-actions*, onboarding-action*, create-client-actions*, profile-fields*, info-step*, profile-form) · S9 (`components/effects/**`, page-shell, account-menu, sign-in-link) · S10 (`lib/supabase/**`, sequential tail). `account/bookings/\_components/prepay-*.tsx`(S2) versus`account/bookings/[id]/edit/page.tsx`(S4): disjoint.`admin/approval-actions.ts` (S7) is not in S6.

**Wave 3 gate (two-step):** first, with S1–S9 landed: `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `npm run test:integration` · `npm run build` · adversarial review per diff, weighted to W3-S3 (new UX surface), W3-S1 (templates unreachable with the var unset) and W3-S8 (permissions). Then launch W3-S10; on its report, `npm run lint` and `npm run test:unit` must be green and every typecheck error must trace to `database.types.ts` — the recorded per-directory inventory becomes wave 4's work list.

---

## Wave 4 — Typed-client fan-out (the one deliberate big fan-out) plus discount modifiers

One slice per top-level directory, each fixing only the type errors W3-S10 surfaced in its own subtree, plus the mechanical adoption of finished wave-0 contracts in the same files. Ownership is by directory, so collisions are impossible by construction.

### Orchestrator-only changes applied before wave 4

None. `tsconfig.json` stays as is until W6-S9.

### Shared rules for every fan-out slice

- Fix type errors by **narrowing to the generated row types**, never by widening with `any` or `as`. Where a cast is genuinely required (jsonb columns), parse with the feature's existing zod schema. An `as` that survives carries a one-line comment saying why.
- A type error that reveals a real defect (a selected column that does not exist, an enum wider than the code assumes) is a **finding**: fix it, call it out in the report, and commit it separately as `fix:`.
- While the directory is owned, land the mechanical adoptions as separate `refactor:` commits: W0-S2's Denver/money formatters (output must not change), W0-S11's `bookingStatusPill` and `phoneSchema`, W0-S3's `PET_COLUMNS`. Wave 3's two notification call sites (inquiry receipt in `inquiries`, client cancellation in `booking/cancel-core.ts`) are wired here by the owning slices as `feat:` commits.
- Do not touch another directory. If an error traces to a shared type elsewhere, report and stop.
- verify (all): `npx tsc --noEmit 2>&1 | grep "<own directory>"` must be empty · `npx vitest run <own directory>` · `npm run lint` on owned files.

| id        | title                                                            | items                                                                       | owns                                                                                                                                   | commits                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W4-S1** | Type errors in the booking feature                               | D11, D2/D13 adoption, O1 cancel alert call                                  | `src/features/booking/**`                                                                                                              | `refactor(booking): use generated database types` · `refactor(booking): use the shared formatters and status pill` · `feat(booking): alert the admin address on a client cancellation` |
| **W4-S2** | Type errors in the admin feature                                 | D11, D2/D13 adoption                                                        | `src/features/admin/**`                                                                                                                | `refactor(admin): use generated database types` · `refactor(admin): use the shared formatters and status pill`                                                                         |
| **W4-S3** | Type errors in accounts and pets                                 | D11, D13 adoption                                                           | `src/features/accounts/**`, `src/features/pets/**`                                                                                     | `refactor(accounts): use generated database types` · `refactor(accounts): use the shared phone schema`                                                                                 |
| **W4-S4** | Type errors in the remaining features                            | D11, D13, O1 inquiry alert call                                             | `src/features/{payments,notifications,reviews,inquiries,pricing,gallery,seo}/**`                                                       | `refactor(features): use generated database types` · `feat(inquiries): alert the admin address on a new inquiry`                                                                       |
| **W4-S5** | Type errors in the admin routes                                  | D11, D2/D13 adoption                                                        | `src/app/(site)/(admin)/**`                                                                                                            | `refactor(admin): use generated database types in admin routes` · `refactor(admin): use the shared status pill in admin views`                                                         |
| **W4-S6** | Type errors in the account, onboarding and auth routes           | D11, D2/D13 adoption                                                        | `src/app/(site)/(account)/**`, `src/app/(onboarding)/**`, `src/app/(auth)/**`, `src/proxy.ts`                                          | `refactor(account): use generated database types in account routes` · `refactor(account): use the shared status pill in account views`                                                 |
| **W4-S7** | Type errors in the marketing routes, API handlers and root files | D11                                                                         | `src/app/(site)/(marketing)/**`, `src/app/(site)/layout.tsx`, `src/app/api/**`, `src/app/*.ts`, `src/app/*.tsx`, `src/app/showcase/**` | `refactor(app): use generated database types in marketing and api routes`                                                                                                              |
| **W4-S8** | Type errors in lib, components and scripts                       | D11, D13 (`ErrorState` defaults, `card-shimmer` union, `useAppForm` typing) | `src/lib/**` (excluding `src/lib/supabase/database.types.ts`), `src/components/**`, `scripts/**`                                       | `refactor(lib): use generated database types` · `refactor(ui): give error state default props` · `fix(form): type app forms on schema input`                                           |
| **W4-S9** | Migrations, wave 4 — manual discount modifiers                   | F3 (SQL)                                                                    | `supabase/migrations/**`                                                                                                               | `feat(db): add manual discount modifiers`                                                                                                                                              |

Notes, wave 4:

- **W4-S7** must not extract loaders — the 40 raw `.from()` calls in route files produce most of its errors; fix types only (W3-S4 already moved the two biggest; W6-S1 moves the admin pair).
- **W4-S8**: collapse the six identical `ErrorState` prop sets onto default props (backward compatible; adoption is W6-S7); make `card-shimmer`'s `Seg` a real union so the twelve `!` assertions disappear; type `useAppForm` on the schema's input side so call sites stop casting.
- **W4-S9**: append one `manual: true` `pct_discount` modifier per paid service for "Friends & Family (−50%)" and one for "Complimentary" (−100%), following the shape of the existing `kiche` modifier; manual modifiers are hidden from `/services` automatically. The labels are the **approved** strings and nothing else. Note that the live walk config already ships `off_leash` and `vetted_2nd_dog` as manual discounts with no toggle — W5-S1 surfaces them or the owner hides them. Verify: `supabase db reset` · `npm run test:integration` · `/services` lists only non-manual modifiers.
- Generated types: `src/lib/supabase/database.types.ts` is read-only for every slice.

**Wave 4 gate:** `npm run typecheck` **must be green** — this closes W3-S10's exception; a non-zero count blocks wave 5. Then `npm run lint` · `npm run format:check` · `npm run test:unit` · `supabase db reset` + `npm run test:integration` (W4-S9) · `npm run build` · adversarial review per diff with one explicit instruction: hunt for casts that hid a real error and for behavior that drifted while "fixing a type". At this gate the orchestrator measures `noUncheckedIndexedAccess` (enable locally, count errors per directory, revert) and records the count as W6-S9's input.

---

## Wave 5 — Owner-decided features and client-facing polish

Everything DECISIONS.md approved that is not yet built, plus the page-shell, accessibility and design-system work a client actually sees.

### Orchestrator-only changes applied before wave 5

- `src/content/references.ts`: create from Cal's reference dump if it has arrived; otherwise create the typed empty registry so W5-S2 renders nothing.
- `eslint.config.mjs`: none yet (widened `CLASS_CHECKS` follows W5-S5's report, applied before wave 6).

### Slices

**W5-S1 · Cal-adjustable manual discounts** — F3, B14 (admin half and carry-through), O2 (cores stay)

- owns: `src/features/booking/admin-actions-core.ts`, `src/features/booking/kiche.ts` → `src/features/booking/manual-discounts.ts`, `src/features/booking/kiche.test.ts` → `src/features/booking/manual-discounts.test.ts`, `src/features/booking/set-kiche-applied.test.ts`, `src/features/booking/booking-service-shared.ts`, `src/features/booking/build-quote-input.test.ts`, `src/features/booking/preview-edit.ts`, `src/features/booking/booking-service.integration.test.ts`, `src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/**`, `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`
- reads: W4-S9's migration, `src/features/booking/_components/quote-lines.tsx` (W2-S5), `src/features/pricing/**` (`parsePricingConfig`, `quoteInputSupportsManual`, `requoteWithManual`)
- TF: yes — applying and removing each manual id re-quotes correctly; a Complimentary booking totals $0 including travel at more than 5 billable miles; two manual discounts survive an unrelated edit; the quote-inputs config is validated through `parsePricingConfig` before the money path
- verify: `npx vitest run src/features/booking` · `npm run typecheck` · `npm run lint` · manual: Cal applies Friends & Family from a booking and the client sees the line
- commits: `refactor(booking): generalize the manual discount mechanism` · `feat(admin): toggle manual discounts from the booking` · `feat(admin): show the price breakdown on client detail` · `fix(pricing): zero travel on a complimentary booking` · `fix(booking): validate stored quote inputs before re-quoting`
- notes: DECISIONS 4. The engine is already id-generic; only the action and UI are pinned to `"kiche"`. Generalize to `setManualApplied(id)`, thread `id` through the preview, render one switch per manual modifier, drop the hardcoded `serviceSupportsKiche` gate. Travel is phase 7 and never discounted, so "Complimentary" must explicitly zero travel. Carry `enabledManualIds`/`customAdjustments` from the stored input through `computeBookingArtifacts` (deferred from B14). Validate `quote_inputs.config` with the existing `parsePricingConfig` at the admin money path — no new schema. Render `QuoteLines` on admin client detail. Never use the `discount_cents` column. Labels come from the DB modifier rows written in W4-S9. The `off_leash`/`vetted_2nd_dog` modifiers become reachable — flag to the owner list. Leave the O2 cores in place with no UI.

**W5-S2 · References with contact reveal** — F2, O6 (consent tail)

- owns: `src/features/references/**`, `src/app/(site)/(marketing)/about/**`, `src/app/(site)/(marketing)/page.tsx`, `src/app/(site)/(marketing)/contact/_components/contact-form.tsx`, `src/app/(site)/(marketing)/contact/_components/contact-form.test.tsx`, `scripts/gallery-sync/**`
- reads: `src/content/references.ts` (orchestrator-supplied), `src/features/reviews/display-name.ts` (first-name pattern), `src/features/inquiries/inquiry-schema.ts`
- TF: yes — the pure first-name helper; the component renders nothing for an empty registry
- verify: `npx vitest run src/features/references "src/app/(site)/(marketing)/contact"` · `npm run typecheck` · `npm run lint` · `npm run build` (`/about` and `/contact` stay `○`)
- commits: `feat(marketing): add a references section driven by content` · `fix(marketing): point the references link at the about section` · `feat(scripts): add a references image sync job`
- notes: DECISIONS 7 — read names, consent flags, contact and pet photo keys from `src/content`; render nothing when content is absent. One `"use client"` island: `Button variant="outline"` plus one `Dialog` for the consented contacts; the request path links to `/contact?ref=<name>` and prefills inside the existing browser-side effect (no `useSearchParams`; `/contact` stays static). `submitInquirySchema` requires name/email/phone, so a bare "Yes" cannot work anonymously — the request path goes through the prefilled form. A `references-originals → public/references` gallery-sync job (`hashed: false`), `next/image` with blur. Zero new server code, zero new strings — reuse existing button/dialog labels; if one is genuinely missing, ship hidden and list it. Home copy currently links references to `/reviews` — retarget the href only.

**W5-S3 · Page-shell conformance for error, 404 and the app shell** — U1 (remainder)

- owns: `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/(site)/layout.tsx`, `src/components/layout/app-shell.tsx`
- reads: `src/components/layout/**` (read-only; W5-S4 owns the rest)
- verify: `npm run build` · `npm run lint` · manual 404 and error boundaries
- commits: `fix(app): put the error and not-found pages on the site shell` · `fix(app): stop double-padding account and admin content`
- notes: move `not-found.tsx` under `(site)` and use `TextLink`; add `BackToSite` to `error.tsx`; drop the extra `px-5 sm:px-8` from `app-shell.tsx`. The admin book/edit shells are W6-S1.

**W5-S4 · Accessibility sweep: landmarks, focus, announcements, skip link, ticker pause** — U5, U6

- owns: `src/components/layout/**` (excluding `app-shell.tsx`), `src/components/account-menu.tsx`, `src/components/site-nav.tsx`, `src/components/site-header.tsx`, `src/components/marketing/stat-ticker.tsx`, `src/components/marketing/stat-ticker-track.tsx`, `src/components/ui/number-stepper.tsx`, `src/components/ui/result-count.tsx`, `src/components/ui/pagination.tsx`, `src/components/ui/control-variants.ts`, `src/components/ui/dialog.tsx`, `src/components/ui/dialog.test.tsx`, `src/components/ui/char-counter.tsx`, `src/components/ui/lightbox.tsx`, `src/features/accounts/_components/photo-crop-field.tsx`, `src/app/(site)/(marketing)/reviews/_components/review-form.tsx`, `src/app/(site)/(marketing)/reviews/_components/review-form.test.tsx`, `src/features/inquiries/components/inquiry-detail-dialog.tsx`, `src/app/(site)/(account)/account/page.tsx`, `src/app/(auth)/layout.tsx`, `src/app/(site)/(marketing)/layout.tsx`
- reads: `src/components/ui/unit-input.tsx` (focus-within classes), `src/app/(site)/(marketing)/services/_components/service-tabs.tsx` (refs-map focus pattern)
- verify: `npm run typecheck` · `npm run lint` · `npx vitest run src/components` · axe pass on `/`, `/services`, `/book/dog-walking`, `/account`, `/admin` · keyboard-only booking flow
- commits: `refactor(components): share the header dropdown assembly` · `fix(a11y): correct navigation and footer landmark roles` · `fix(a11y): keep focus visible and stable on keyboard activation` · `fix(a11y): announce filtered result counts` · `feat(a11y): add a skip-to-content link` · `feat(marketing): let the stat ticker be paused`
- notes: no new copy except the approved chrome strings ("Skip to content", "Pause"/"Play"). Drop the `role="menu"` declarations and wrap in `<nav aria-label="Account">`; `if (e.detail !== 0) blur()`; `Drawer.Title`; real `<ul>/<li>` in the footer; focus ring on `NumberStepper`; one focus fragment exported from `control-variants.ts` replacing the three idioms (dialog-close buttons use it); `h3 → h2` where the order skips; `role="status"`/`aria-live` on result counts and the char counter; refs-map focus for star-rating arrows; `autoFocus` + focus return on inquiry edit; `aria-hidden` on doubled ticker items; `tabIndex={-1}` on the hidden file input; `aria-label` on pagination and lightbox controls. `id="main-content"` on the three `<main>`s (onboarding's landed in W1-S1) plus an `sr-only focus:not-sr-only` anchor first in `PageShell`; the ticker pauses on `focus-within` and on the button. Extract the shared dropdown assembly from `AccountMenu`/`SignInLink` as a separate structural commit; keep W3-S9's ring plumbing. Lightbox: add the labels and leave its colors with a comment naming the deliberate exception (owner list).

**W5-S5 · Design-system adoption and registry** — U7

- owns: `src/components/ui/surface.tsx`, `src/components/feedback/dialog-shell.ts`, `src/components/marketing/section-header.tsx`, `src/components/marketing/eyebrow.tsx`, `src/components/marketing/marketing-hero.tsx`, `src/components/marketing/service-photo-strip.tsx`, `src/components/marketing/stat-display.tsx`, `src/components/marketing/marketing-copy.tsx`, `src/components/marketing/marketing-prose.tsx`, `src/app/showcase/**`, `src/app/(site)/(marketing)/services/**`, `src/app/(site)/(marketing)/gallery/**`, `src/app/(site)/(marketing)/resources/**`, `src/app/(site)/(marketing)/reviews/page.tsx`, `src/app/(site)/(marketing)/reviews/_components/reviews-list.tsx`, `src/features/accounts/_components/pet-list.tsx`
- reads: `docs/COMPONENT_SYSTEM.md`, `docs/FRONTEND.md`, `eslint.config.mjs` (`CLASS_CHECKS`)
- skill: **impeccable**
- verify: `npm run lint` · `npm run typecheck` · `npm run build` · visual diff pass on `/`, `/services`, `/gallery`, `/showcase`
- commits: `refactor(marketing): adopt the shared section header and eyebrow` · `refactor(components): sweep card radius and elevation onto tokens` · `feat(components): give surface a default card padding` · `refactor(account): use the empty state on the pets list`
- notes: replace the hand-rolled heading clusters and eyebrows with `SectionHeader`/`Eyebrow` (weights and tracking have drifted); sweep `rounded-xl/2xl` on card-like containers to `rounded-card` and `shadow-xl`/raw rgba in `dialog-shell` to `shadow-elev-*`; `Surface` defaults to `p-[var(--card-pad)]`; `EmptyState` on the pets list. Add a `Select` registry row and **narrow** the `/showcase` doc claim (DECISIONS) — report the doc edits and the `CLASS_CHECKS` widening (`rounded-xl/2xl/3xl`, `shadow-*`, `text-white`, `text-[Npx]`, walk extracted consts and `ui/**`) to the orchestrator. Excludes `about/**`, `page.tsx`, `contact/**` (W5-S2), `layout.tsx` and `review-form.tsx` (W5-S4), `book/**`.

**W5-S6 · Small polish cluster** — U8 (remainder)

- owns: `src/app/(site)/(admin)/admin/clients/new/**`, `src/app/(site)/(admin)/admin/reviews/**`, `src/app/(onboarding)/onboarding/_components/meet-greet-step.tsx`
- reads: W2-S6's diff (settings and services halves already landed), `src/features/booking/state-machine.ts` (`bookingStatusPill`)
- verify: `npm run typecheck` · `npm run lint` · `npx vitest run "src/app/(site)/(admin)/admin/clients/new"`
- commits: `fix(admin): show the status label in the new client form` · `fix(admin): render the link the duplicate-email message promises` · `fix(admin): keep review moderation state on the server` · `fix(onboarding): show the real meet and greet status`
- notes: `new-client-form`'s bare `SelectValue` uses the `<SelectValue>{label}</SelectValue>` idiom; `email_exists` renders the link it promises; the reviews client stops holding moderation state locally; the meet-greet card stops saying "confirmed" while `pending_approval` — reuse the approved "Your account is pending Cal's approval." register or the existing pending label. The three Resources notes in Cal's voice are W7-S4's; the two borderline chrome sentences go on the owner list. No new sentences.

**W5-S7 · Reschedule drive-buffer guard** — B5 (reschedule half, deferred from wave 2)

- owns: `src/features/booking/reschedule-core.ts`, `src/features/booking/reschedule-booking.test.ts`, `src/features/booking/booking-repository.ts`
- reads: `src/features/booking/drive-buffer-guard.ts` (W0-S12), W2-S8's edit-side call
- TF: yes — a reschedule into a buffer-violating slot is refused; an unchanged reschedule is not
- verify: `npx vitest run src/features/booking/reschedule-booking.test.ts` · `npm run typecheck`
- commits: `fix(booking): apply the drive-time buffer when rescheduling`
- notes: VERIFY B5 deferred this because `getBookingTimes` returns no concurrency and no coordinates — widen that select (repository), then call the shared guard with `excludeBookingId`.

**W5-S8 · Stripe and environment plumbing** — D13 (cluster 2)

- owns: `src/app/api/webhooks/stripe/route.ts`, `src/features/payments/stripe-gateway.ts`, `src/features/payments/webhook-core.ts`, `src/features/payments/types.ts`, `src/lib/stripe/**`, `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/service.ts`, `src/lib/supabase/static.ts`, `scripts/db-seed/**`, `scripts/rover-sync/**`
- reads: W3-S10's typed factories (do not undo them)
- TF: yes — `verifyWebhook` returns a typed event or a typed failure, no double cast
- verify: `npx vitest run src/lib src/app/api/webhooks src/features/payments` · `npm run typecheck`
- commits: `refactor(payments): verify stripe webhooks through the gateway` · `refactor(lib): share the environment variable reader` · `refactor(scripts): share the script supabase client`
- notes: add `verifyWebhook` to the gateway so the route stops importing the raw SDK; pin `apiVersion` once; one env-read-and-throw helper replacing the four factory copies (keep route SDK init out of module scope — see project memory); unify the two script client constructions. Document the `stripe_events` convergence contract in the gateway header; a real ledger table is an owner decision, not built here.

### Wave 5 ownership check

Pairwise-disjoint: S1 (admin-actions-core, kiche → manual-discounts, three tests, booking-service-shared, preview-edit, integration test, admin `bookings/[bookingId]/**`, client-detail-client) · S2 (`references/**`, `about/**`, marketing `page.tsx`, contact-form*, `scripts/gallery-sync/**`) · S3 (not-found, error, `(site)/layout.tsx`, app-shell) · S4 (`components/layout/**` minus app-shell, header/nav components, ticker, six `ui/` files, lightbox, photo-crop-field, review-form*, inquiry-detail-dialog, account `page.tsx`, auth and marketing layouts) · S5 (surface, dialog-shell, seven `marketing/` components, `showcase/**`, marketing `services/**` `gallery/**` `resources/**`, reviews `page.tsx` and `reviews-list.tsx`, pet-list) · S6 (`clients/new/**`, `admin/reviews/**`, meet-greet-step) · S7 (reschedule-core, its test, booking-repository) · S8 (webhook route, stripe-gateway, webhook-core, payments types, `lib/stripe/**`, `lib/env.*`, four supabase factories, `scripts/db-seed/**`, `scripts/rover-sync/**`). `components/marketing/stat-ticker*.tsx` (S4) versus the other `components/marketing/*` files (S5): listed by file, disjoint. `ui/lightbox.tsx` is S4 only.

**Wave 5 gate:** `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `npm run test:integration` · `npm run build` · axe and keyboard pass · adversarial review per diff, weighted to W5-S1 (Complimentary must reach exactly $0) and W5-S8 (webhook verification). Manual: the full booking happy path with payments **on** and again **off**; Cal applies a discount and the client sees the line.

---

## Wave 6 — Structure, pricing engine, test fidelity, dedupe

All behavior is correct and all features are in. Structural work lands here because it is cheapest to do once and most expensive to redo, and because structural commits must never ride with behavior commits.

### Orchestrator-only changes applied before wave 6

- `eslint.config.mjs`: widen `CLASS_CHECKS` per W5-S5's report; add the `boundaries/element-types` rules (`lib` ✗ feature/app/components; `components` ✗ feature/app) and a `content` element — **rules only**, so W6-S2's moves are what turns them green.
- `src/content/rover-reviews.ts`: drop the `TODO(cal)`, keep the URL (DECISIONS; O6).

### Slices

**W6-S1 · Admin on-behalf routes onto the shared loaders** — D5 (part 3), U1 (admin shells)

- owns: `src/app/(site)/(admin)/admin/clients/[clientId]/book/**`, `src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`, `src/app/(site)/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/loading.tsx`
- reads: `src/features/booking/load-service-booking-page.ts`, `src/features/booking/booking-edit-view.ts` (W3-S4)
- verify: `npm run typecheck` · `npm run lint` · manual pass on admin book and edit
- commits: `refactor(admin): reuse the shared booking loaders on admin pages` · `refactor(admin): drop the duplicated admin role guard` · `fix(admin): put the admin booking pages on the standard shell`
- notes: both pages re-query `profiles.role` although the layout already gates — delete it. Pure moves first; shell last. The kiche control under `edit/_components` is not owned (W5-S1 finished it).

**W6-S2 · Module boundaries and barrels** — D6

- owns: `src/features/booking/index.ts`, `src/features/booking/index.client.ts`, `src/features/booking/quantities.ts`, `src/features/booking/_components/quantity-forms.tsx`, `src/features/booking/_components/quantity-forms.test.tsx`, `src/features/booking/return-to.ts` → `src/lib/return-to.ts` (with its test), `src/features/notifications/completion-cron.ts` → `src/features/booking/completion-cron.ts` (with both tests), `src/app/api/cron/complete/route.ts`, `src/features/booking/_components/pet-avatar.tsx` → `src/features/pets/pet-avatar.tsx`, `src/features/pets/index.ts`, `src/features/admin/index.ts`, `src/features/admin/attention-counts-query.ts`, `src/features/admin/header-role.ts`, `src/features/accounts/index.client.ts`, `src/features/payments/index.client.ts`, `src/features/inquiries/index.ts`, `src/features/inquiries/components/**`, `src/components/header-auth-client.tsx`, `src/app/(site)/(marketing)/book/[serviceSlug]/_components/recurring-controls.tsx` → `src/features/booking/_components/recurring-controls.tsx`, `src/app/(site)/(account)/account/bookings/[id]/edit/**` (its `_components` move to `src/features/booking/_components/`; the page's imports follow), `src/app/(site)/(marketing)/services/page.tsx`, `src/app/sitemap.ts`, `src/app/(site)/(marketing)/layout.tsx`, plus the importers of each moved module enumerated at start — any importer inside another wave-6 slice's globs is reported, not edited
- reads: `eslint.config.mjs` (the new rules), `docs/ENGINEERING.md` #1 (two sentences to report for W7-S3)
- verify: `npm run typecheck` · `npm run lint` (boundary rules now green) · `npm run test:unit` · `npm run build` (record the marketing bundle size before and after)
- commits: `refactor(booking): move completion cron into the booking feature` · `refactor(lib): move the return-to helper out of booking` · `refactor(pets): move the pet avatar into the pets feature` · `refactor(booking): split pure quantity helpers from the client module` · `refactor(booking): move route-local booking components into the feature` · `refactor(booking): align the booking barrels and drop client re-exports` · `refactor(admin): move the header role read into the admin feature`
- notes: one `refactor:` commit per move; **no behavior change and no renamed exports**. Break the two cycles (`booking↔notifications`, `booking↔accounts`). Split `quantitiesToRecord` into `booking/quantities.ts`. Import `listActiveServices` from `services-repo` in the three marketing callers and drop the client re-exports from `booking/index.ts` (what drags Stripe/Resend/`react-day-picker` into the marketing graph); add the four missing accounts client exports; reconcile the drifted names between the booking barrels; delete the two `payments/index.client.ts` service-role lines; relative import in `attention-counts-query`; move the client component out of the inquiries barrel; delete the `PetSpecies` re-exports through booking UI; hoist `header-auth-client`'s role and badge read into `features/admin`. Remove a re-export only when every importer is inside this slice's globs.

**W6-S3 · Split the admin client detail component** — D10 (remainder)

- owns: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/**`
- reads: the W2-S4, W3-S2 and W5-S1 diffs (all touched this file)
- verify: `npm run typecheck` · `npm run lint` · manual pass on the client detail page
- commits: `refactor(admin): split client detail into per-section components`
- notes: **structural only.** ~480 lines → per-section siblings (profile, pets, forms, bookings, payments, debits). The reviewer confirms zero behavior change.

**W6-S4 · Pricing engine: the $0-base hole, dead levers, every species bookable** — D15, B4 (P1), X3 (`isPetAware` code half), O4 (flag documented), D12 (seed fixture)

- owns: `src/features/pricing/**`, `src/features/booking/booking-service-shared.ts`, `src/features/booking/schedule-capabilities.ts`, `src/features/booking/use-booking-scheduler.ts`, `src/features/booking/scheduler-constraints.test.ts`, `src/features/booking/build-quote-input.test.ts`, `src/test-stubs/seed-fixture.ts`
- reads: W5-S1's diff of `booking-service-shared.ts`, `supabase/migrations/20260529205144_seed.sql` and the later pricing migrations, `src/features/pets/species.ts`
- TF: yes — modifier stacking order, the minimum floor, `perPremiumNight`, `tiered_per_unit` rounding (all untested today); a bird house-sit prices without a `$0` base and **without** firing `cat_only`; a table-driven `toggleCount` covering all six conditions
- verify: `npx vitest run src/features/pricing src/features/booking/scheduler-constraints.test.ts src/features/booking/build-quote-input.test.ts` · `npm run typecheck` · `npm run lint`
- commits: `fix(pricing): count every toggle condition` · `fix(pricing): round tiered per-unit lines` · `feat(pricing): price house sits for pets other than dogs and cats` · `fix(booking): allow every species to be booked` · `chore(pricing): delete unreachable holiday and adjustment plumbing` · `refactor(pricing): label receipt units consistently` · `refactor(booking): share one pet-aware predicate` · `test(pricing): pin quote cases to one seed fixture`
- notes: **deliberate deviation from the register's default.** VERIFY B4 shows widening `allowedSpeciesOf` without an `others` producer gives a bird stay a `$0` base and a wrong "Cat-only home" discount, so **wire `others`** into `houseSittingQuantitiesSchema` and `buildQuoteInput`, derive it in `booking-service-shared`, and widen `allowedSpeciesOf` to `constraints.allowedSpecies` (rewrite the narrowing assertion in `scheduler-constraints.test.ts`); `others` is already backed by the config unit schema, so no config change. Delete `customAdjustments` and the holiday scaffolding that never reaches `QuoteInput`. `conditionHolds(c) ? 1 : 0`; `round()` around the tiered line. Reuse `display.ts` unit labels in receipt lines so "Extra other (2)" stops leaking raw keys — existing labels only; escalate if none fits. Move and rename `estimateDrivingMinutes` and fix its docstring. Export one `isPetAware(pricingType)` and use it in the shared core (the edit hook is wired in W7-S1). Document `RECURRING_UI_ENABLED` in the scheduler hook with a pointer to DESIGN.md (O4). Build one seed fixture module both pricing suites read (they currently mirror a superseded seed). Rate confirmation goes on the owner list.

**W6-S5 · Test fidelity: booking suites** — D12 (booking half)

- owns: `src/features/booking/**/*.test.ts`, `src/features/booking/**/*.test.tsx`, **excluding** `scheduler-constraints.test.ts`, `build-quote-input.test.ts` (W6-S4), `_components/quantity-forms.test.tsx`, `return-to.test.ts`, the moved `completion-cron` tests and the moved `edit-booking-client` tests (W6-S2)
- reads: `src/test-stubs/fake-supabase.ts` (W0-S7)
- verify: `npx vitest run src/features/booking` · `npm run test:integration` · coverage delta reported
- commits: `test(booking): assert query predicates with the recording double` · `test(booking): replace vacuous scheduler and hook assertions` · `test(booking): split the booking service suite by core`
- notes: replace the mock builders in `booking-service.integration.test.ts` with the recording fake and **assert `_calls` arguments** so a dropped `.in("night", …)` fails; split that suite by core **last**. Assert intermediate state in `month-grid.identity` (passes if nothing happens today); fix the `use-service-booking` test that asserts only `hasSelection` with `as never`; add `inspect-scheduler` cases.

**W6-S6 · Test fidelity: admin, accounts, pets, notifications, routes, components** — D12 (remainder)

- owns: `src/features/admin/**/*.test.ts`, `src/features/accounts/**/*.test.ts`, `src/features/accounts/**/*.test.tsx`, `src/features/pets/**/*.test.ts`, `src/features/notifications/**/*.test.ts` (excluding the moved `completion-cron` tests), `src/app/**/*.test.ts`, `src/app/**/*.test.tsx` (excluding `account/bookings/[id]/edit/**` — W6-S2 — and `reviews/_components/review-form.test.tsx` — W6-S7), `src/components/**/*.test.tsx` (excluding `components/form/**` — W6-S7)
- reads: `src/test-stubs/fake-supabase.ts`
- verify: `npx vitest run src/features/admin src/features/accounts src/features/pets src/features/notifications src/app src/components`
- commits: `test(admin): assert query predicates with the recording double` · `test(accounts): cover the account form schemas and registry` · `test(notifications): cover the cron gate and stripe failure branches` · `test: assert roles instead of copy in booking flow tests`
- notes: `overnight-actions.test.ts` adopts the recording fake (it passes today with the `.in("night", …)` filter removed). Table-driven `safeParse` cases for the five account form schemas and `formRegistry`. Tests for `getClientDetailCore` (extracted in W2-S4) and `listBookingsInRangeCore`. Extract and unit-test the reminder cron gate and Stripe 400 branches. Drop the characterization framing and plan codenames from the `service-booking-client` tests and assert roles, not copy. Add `MarketingProse` block-parsing and `CharCounter` threshold tests.

**W6-S7 · Shared kit dedupe, stale comments, final dead-code sweep** — D13 (remainder), D1 (post-move sweep), X4 (code-comment half, non-docs)

- owns: `src/components/feedback/error-state.tsx`, `src/components/feedback/empty-state.tsx`, `src/components/ui/star-rating.tsx`, `src/components/form/**`, `src/components/effects/card-shimmer.tsx`, `src/components/marketing/stat-ticker.tsx`, `src/components/layout/page-shell.tsx`, `src/lib/plural.ts`, `src/lib/plural.test.ts`, `src/lib/pagination.ts`, `src/lib/pagination.test.ts`, `src/features/inquiries/inquiry-list.ts`, `src/features/inquiries/inquiry-list.test.ts`, `src/app/(site)/(admin)/admin/inquiries/**`, `src/features/gallery/service-images.ts`, `src/app/(site)/(marketing)/reviews/_components/review-form.tsx`, `src/app/(site)/(marketing)/reviews/_components/review-form.test.tsx`, `src/app/(site)/(marketing)/reviews/_components/reviews-list.tsx`, `src/app/(site)/(marketing)/page.tsx`, `src/app/(site)/(account)/account/page.tsx`, `src/app/(site)/(account)/account/pets/page.tsx`, `src/app/(site)/(account)/account/forms/page.tsx`, `src/app/(site)/(account)/account/inquiries/page.tsx`, `src/app/(site)/(account)/account/bookings/page.tsx`
- reads: the wave-5 review reports (leftover D13 sites), the dead-code lens
- TF: yes — the pluralization helper; `paginate` behavior preserved by its existing tests before the shim goes
- verify: `npm run typecheck` · `npm run lint` · `npm run test:unit` · `npm run build`
- commits: `refactor(ui): adopt error state defaults on the account pages` · `feat(components): add star rating to the kit` · `refactor(lib): share one pluralization helper` · `fix(admin): keep the server inquiry ordering` · `chore(lib): delete the pagination compatibility shim` · `refactor(gallery): reuse the gallery file listing for service images` · `docs: correct stale code comments` · `chore: delete code orphaned by the structure moves`
- notes: one `StarRating` in the kit (two exist with different visuals; the list imports it from the form module); adopt `ErrorState` defaults at the account call sites; pluralization at the sites in owned files (report the rest); keep the server's status-first inquiry sort instead of discarding it with `sortByRecency`; delete the `paginate` shim and its duplicate tests; `service-images` reuses `listGalleryFiles`; fix the `yearsSince`, stat-ticker cursor-coupling and `page-shell` comments. Re-run the dead-code analysis against the post-move tree once W6-S2 has landed (sequence this commit after W6-S2's report) and delete what it finds in owned files; report the rest.

**W6-S8 · Migrations, wave 6 — seed convergence** — D16 (remainder)

- owns: `supabase/migrations/**`
- verify: `supabase db reset` · `supabase migration list --linked` (record prod state for W7-S3's handoff retirement) · `npm run test:integration`
- commits: `feat(db): converge the seeded pricing configuration` (only if local and prod diverge)
- notes: the retro-edited seed migration is **not** repaired by editing it — if local and prod pricing JSON diverge, append a migration that converges them and record the divergence; otherwise land nothing and report. Report the append-only rule wording for W7-S3.

**W6-S9 · Strict index access (tail — sequential, with a stop rule)** — D11 (tail)

- owns: everything the flag reddens; runs alone after the wave-6 gate
- verify: `npm run typecheck` · `npm run test:unit`
- commits: `refactor(types): guard indexed access`
- notes: the orchestrator enables `noUncheckedIndexedAccess` in `tsconfig.json`; this slice fixes the fallout with real guards. **Stop rule:** if the wave-4 measurement exceeded ~150 errors, or fixes start requiring non-null assertions, revert the flag, report the count, and log it as a follow-up. Nothing in DECISIONS asks for this; it is a nice-to-have.

### Wave 6 ownership check

Pairwise-disjoint: S1 (admin `book/**`, admin edit `page.tsx` + `loading.tsx`) · S2 (booking barrels, quantities, quantity-forms*, return-to move, completion-cron move, cron complete route, pet-avatar move, pets and admin barrels, attention-counts-query, header-role, accounts/payments client barrels, inquiries barrel and `components/**`, header-auth-client, recurring-controls move, account `bookings/[id]/edit/**`, marketing services page, sitemap, marketing layout) · S3 (admin `clients/[clientId]/_components/**`) · S4 (`pricing/**`, booking-service-shared, schedule-capabilities, use-booking-scheduler, two booking tests, `test-stubs/seed-fixture.ts`) · S5 (booking tests minus S4's two and S2's moved/owned tests) · S6 (admin/accounts/pets/notifications/app/components tests minus the exclusions) · S7 (error/empty-state, star-rating, `components/form/**`, card-shimmer, stat-ticker, page-shell, plural, pagination, inquiry-list*, admin `inquiries/**`, service-images, review-form*, reviews-list, marketing `page.tsx`, five account pages) · S8 (`supabase/migrations/**`) · S9 (sequential tail). Cross-checks: S6's `src/app/\*\*/*.test._`excludes S2's account-edit tests and S7's`review-form.test.tsx`; S6's `components/\*\*/_.test.tsx`excludes S7's`components/form/**`; S5 excludes S4's two tests and S2's `quantity-forms.test.tsx`/`return-to.test.ts`; `admin/inquiries/**`(S7) contains no test file; S3 versus S1:`clients/[clientId]/\_components/**`and`clients/[clientId]/book/**` are disjoint.

**Wave 6 gate:** `npm run typecheck` · `npm run lint` (boundary rules and widened class checks active) · `npm run format:check` · `npm run test:unit` · `npm run test:integration` · `npm run build` with a route-table and bundle-size diff against the wave-3 build · adversarial review per diff with one instruction: **structure-only slices must show zero behavior change** — changed predicates, changed rendered output or changed route staticness are defects. Then, if the wave-4 measurement allows, run W6-S9 alone and re-run typecheck and unit tests.

---

## Wave 7 — Docs conformance, CI, build, manual QA, owner hand-off

The only wave in which builders own `docs/**`, `src/content/**` and `.github/**`. No source behavior changes except two enumerated code edits (the `isPetAware` wire and the resources-notes registry move) and the stale-comment sweep.

### Orchestrator-only changes applied before wave 7

- `vercel.json`: `maxDuration` for the two cron routes if W2-S9 reported it; the schedule stays daily.
- Any `package.json`/`eslint.config.mjs` items reported in wave 6.

### Slices

**W7-S1 · DESIGN.md reconciled with the code; DEV_NOTES triaged** — X3, X4 (notes inbox), O2, O4, O5, O6 (doc halves)

- owns: `docs/DESIGN.md`, `docs/DEV_NOTES.md`, `docs/superpowers/PRICING-HANDOFF.md`, `src/lib/README.md`, the `use-edit-booking` hook wherever W6-S2 left it
- reads: every wave's reported DESIGN line list, W6-S4's `isPetAware`, W6-S8's `supabase migration list --linked` output
- verify: `node scripts/check-doc-links.mjs` · `npm run typecheck` · `npx vitest run src/features/booking`
- commits: `docs: describe the pricing model rather than its rates` · `docs: reconcile the design doc with the shipped code` · `refactor(booking): use the shared pet-aware predicate in the edit hook` · `docs: triage the dev notes inbox` · `docs: retire the pricing handoff`
- notes: DECISIONS 12 — rewrite the pricing section as **model, not numbers** (the DB is truth). Correct the ~20 contradictions: pricing dispatch model, Kiche and recurring percentages, travel model, computation order, the Realtime claim (now true for the two published tables; `bookings` is not published), `discount_cents` "Cal-adjustable" (replaced by manual modifiers), `form_key` live, the pet-aware list (all four paid services), the owed formula, `client_debits.resolution`, the admin side-panel / no-show / `router.refresh()` paragraph, the route table, the onboarding and vet-form lines, the middleware paragraph (now `onboardingRedirect`), the availability editor lines, the payments-flag lines. O2: remove the claims that no-show / grant-refund / settle-debt are live. O5: admin writes are service-role-only. O4: document `RECURRING_UI_ENABLED`. O6: dark-mode tokens latent by decision; `telephone`/`sameAs`/socials deliberately empty. Triage `docs/DEV_NOTES.md` to empty: bugs → this plan's handoff log or the owner list, scope → a spec pointer, owner questions → DESIGN.md open questions. Retire `PRICING-HANDOFF.md` once W6-S8 confirmed prod state.

**W7-S2 · Archive shipped plans and specs; delete stray root notes** — X4 (archive half), D1 (doc assets)

- owns: `docs/superpowers/plans/**`, `docs/superpowers/specs/**`, `TEMP.md`, `PROMPTS.md`, `docs/wordmark-explorations.html`, `docs/wordmark-explorations-v2.html`, `docs/images/architecture.*`
- verify: `node scripts/check-doc-links.mjs` · `git status` shows no stray root notes
- commits: `docs: archive shipped plans and superseded specs` · `chore: delete stray root notes and unused doc assets`
- notes: `git mv` the shipped plans into `plans/archive/` and the superseded specs into `specs/archive/` with a one-line pointer to the successor where one exists; this plan stays in `plans/` until its Definition of Done ships. Delete `TEMP.md` and `PROMPTS.md` (DECISIONS 12). `SYNC.md` is W7-S4's (fold, then delete). Mechanical; no prose edits.

**W7-S3 · Core docs: paths, footers, kit claims, rules, README, context** — X4 (structure half), D16 (append-only rule), D6 (barrel rule), U3/U7 (doc corrections)

- owns: `docs/WORKFLOW.md`, `docs/ENGINEERING.md`, `docs/FRONTEND.md`, `docs/COMPONENT_SYSTEM.md`, `docs/CODE_STYLE.md`, `docs/CONTENT.md`, `docs/ROLES.md`, `docs/ROUTING.md`, `docs/superpowers/HANDOFF.md`, `docs/adr/**`, `docs/reference/**`, `specs/README.md`, `README.md`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`
- reads: the reports queued by W2-S7, W5-S5, W6-S2, W6-S8
- verify: `node scripts/check-doc-links.mjs` · every doc carries a current `_Last reviewed_` footer
- commits: `docs: point the spec and plan paths at their real locations` · `docs: retire the handoff document` · `docs: record the append-only migration rule and the barrel rule` · `docs: correct the component kit claims` · `docs: refresh the review footers and add the context doc to the nav` · `docs: replace the readme stub`
- notes: point `WORKFLOW.md` and `specs/README.md` at the real spec location (`docs/superpowers/specs/*-design.md`); retire `HANDOFF.md` (DECISIONS 12); add the WORKFLOW gate caveat (unit versus integration) and stop overclaiming `check-doc-links` (X1); write "migrations are append-only once pushed" (D16); two sentences in ENGINEERING #1 on the barrel/entry-point rule (D6); drop "table" from the FRONTEND kit list and leave the table-to-cards line (U3); narrow the `/showcase` claim and add the `Select` registry row (U7, DECISIONS); add `CONTEXT.md` to the AGENTS nav table with a footer; re-audit and re-stamp the nine core docs past their 60-day footer; one-paragraph `README.md`. Do not write into `DESIGN.md` (W7-S1) or `docs/content/**` (W7-S4).

**W7-S4 · Copy ledger and content registry** — X4 (content half), U8 (Resources notes), D1 (ledger note), O6 (Rover), F2 (registry shape)

- owns: `docs/content/**`, `src/content/**`, `SYNC.md`, `src/app/(site)/(marketing)/resources/page.tsx`
- reads: every slice's copy change this session
- verify: `node scripts/check-doc-links.mjs` · `npm run typecheck` · `npm run build`
- commits: `docs: refresh the copy ledger paths` · `docs: record this session's copy changes` · `content: move the resources notes into the registry` · `docs: fold the unsynced source text into the content docs`
- notes: `sed` the 58 pre-`(site)` paths in `copy-ledger.md`. Record every copy change: the declined-onboarding wording (W1-S1), the rate-limit refusal (W1-S5), "Anonymous" fallback (W1-S5), the login-state strings (W1-S11), the four availability strings (W3-S3), the service-area and address-hint strings (W3-S8), the discount labels (W4-S9), the skip-link and ticker strings (W5-S4), the removed `services.notice.*` key (orchestrator, wave 2), the disabled notification templates (W3-S1, pending sign-off). Move the three Resources notes in Cal's voice into `src/content` and read them from the page. Fold `SYNC.md`'s unsynced text into `docs/content/cal-source.md` plus the ledger — **never onto the site** — then delete `SYNC.md`. Add the references registry entry as pending content.

**W7-S5 · Continuous integration** — X2

- owns: `.github/**`
- reads: `package.json` (`engines`, `test:unit`)
- verify: a green run on a real push to `main` (or `act` locally first)
- commits: `ci: run format, lint, typecheck and unit tests on push`
- notes: DECISIONS 11 — one workflow on push: `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`; Node pinned to `engines`; `~/.npm` cached; no secrets. Leave the Supabase CLI integration job as a `workflow_dispatch`-only stanza so the shape is recorded. If `test:unit` is missing, stop and escalate.

**W7-S6 · Production build and route-shape verification** — X1 (build gate), D7 (confirmation), the performance floor

- owns: nothing — read-only; findings are reported and fixed by the orchestrator or a follow-up slice
- verify: `npm run build` clean · route table shows `○` for `/`, `/about`, `/contact`, `/gallery`, `/resources`, `/services`, `/reviews` · no dynamic API in the root layout · no route SDK init at module scope · Lighthouse mobile incognito on `/` and `/services` · bundle report (Stripe/Resend absent from the marketing graph after W6-S2) · zero hydration warnings · client bundle grep for `service_role` and `sb_secret`
- commits: none

**W7-S7 · Manual browser QA of the booking and admin flows** — verification of B1, B2, B5, B6, B8, B12, B16, B17, B19, F1, F3, F4, F5

- owns: nothing — read-only
- verify: against a local build with seeded data, both payments modes. **Client:** sign up → onboarding without an emergency step → book a meet & greet with zero forms (reaches pending) → approve as admin → exactly one confirmation email → book a paid service (owner form asks for emergency and vet contact) → out-of-area ZIP refused on address save → edit a house-sit (walk add-on and total survive) → cancel a booking that already has a partial refund (status changes, refund math right). **Admin:** a next-month pending booking shows in the badge, dashboard and hub; month arrows navigate; multi-day availability paint with mouse and keyboard; a conflicting stay produces a visible message; save a house-sitting rate; apply Friends & Family and the client sees the line; open a client with a legacy form row. **Accessibility:** keyboard-only booking flow; skip link; no horizontal scroll at 320px (the species picker). Screenshots or a written pass/fail per step; every failure becomes a fix slice before sign-off.
- commits: none

**W7-S8 · Owner-gated hand-off list** — O1 (sign-off), O6 (residual), every owner-gated tail

- owns: `docs/superpowers/OWNER-GATED.md`
- verify: `node scripts/check-doc-links.mjs`
- commits: `docs: add the owner decision queue`
- notes: assemble the list in the "Owner-gated at end of session" section below into one checklist with, per item, the exact question, the code already in place waiting for it, and what unblocks on an answer.

**W7-S9 · Stale code comments sweep** — X4 (code-comment half)

- owns: the source files the orchestrator lists from the wave 1–6 review reports, **excluding** W7-S1's and W7-S4's files
- verify: `npm run lint` · `npm run typecheck` · `git diff --stat` shows comment-only changes
- commits: `docs: correct stale code comments`
- notes: comments only, no code. Most were fixed by the slice that owned the file; this sweeps what the reviews reported as missed.

### Wave 7 ownership check

Pairwise-disjoint: S1 (`DESIGN.md`, `DEV_NOTES.md`, `PRICING-HANDOFF.md`, `src/lib/README.md`, the edit hook) · S2 (`plans/**`, `specs/**` under superpowers, `TEMP.md`, `PROMPTS.md`, wordmark and architecture assets) · S3 (the eight core docs, `HANDOFF.md`, `adr/**`, `reference/**`, `specs/README.md`, `README.md`, `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`) · S4 (`docs/content/**`, `src/content/**`, `SYNC.md`, resources page) · S5 (`.github/**`) · S8 (`OWNER-GATED.md`) · S9 (orchestrator-listed source files minus S1/S4). S6 and S7 write nothing.

**Wave 7 gate (final):** `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test:unit` · `npm run test:integration` · `npm run build` · `node scripts/check-doc-links.mjs` · CI green on `main` · W7-S6 and W7-S7 findings all closed · adversarial review of the docs diffs for claims that are true of the code as it now stands (they encode decisions, so review them like code). Then deploy and confirm.

---

## Between-wave gate checklist (orchestrator, in order)

1. Diff the changed-file list against the wave's ownership map **before** review starts; any file outside its slice's globs is a defect to resolve first.
2. `npm run typecheck` — green (exception: the wave-3 tail, whose per-directory inventory is wave 4's input).
3. `npm run lint` · `npm run format:check` — green.
4. `npm run test:unit` — green.
5. `supabase db reset` + `npm run test:integration` — whenever a migrations slice landed (waves 1, 2, 4, 6) and at waves 0, 3, 5, 7.
6. `npm run build` — waves 2, 3, 4, 5, 6, 7 (route table and bundle size recorded).
7. **Adversarial review, one fresh-context reviewer per slice diff**, read-only tools, diff plus criteria only, "correctness gaps, not style"; the reviewer also diffs every new string literal against the approved copy list. Budget weighted to auth, payments, permissions, migrations and large diffs: W1-S2, W1-S5, W1-S6, W1-S7, W2-S8, W2-S11, W3-S1, W3-S3, W3-S8, W4-\* (behavior drift), W5-S1, W5-S8, W6-S2 (structure only).
8. Fixes by the original slice owner; **one** re-review; three stuck iterations on the same error → stop, re-slice, reassign.
9. Apply the next wave's orchestrator-only changes, re-run 2–4, record the wave summary in the handoff log, then launch.

## Definition of Done (session)

- Every register item is closed by a landed commit, or listed under "Owner-gated at end of session" with the code in place waiting for the answer, or recorded as a deliberate deferral in the coverage table below.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration` and `npm run build` all green on `main`; CI green on the last push; `node scripts/check-doc-links.mjs` passes.
- The `next build` route table shows every public marketing route static.
- The manual QA sheet (W7-S7) is complete with no open failures; the booking happy path and the cancel-with-partial-refund path pass in both payments modes.
- Every commit on `main` is a subject-only Conventional Commit; no doc-touching commit lacks a same-commit doc update; every doc carries a current footer.
- Per slice (repo constitution): tests green → types/lint/format clean → independent review clean → manual verify where the slice has a UI surface → conventional commit on `main`.

## Owner-gated at end of session

From DECISIONS.md plus the tails surfaced by the plan; each ships inert or unchanged until Alex answers.

1. **Gallery photos** — final set from Cal; `gallery-sync` re-run (W2-S12 reported width/height emission).
2. **References content** — names, consent flags, contacts, pet photo keys into `src/content/references.ts`; 6 of 8 references are still un-consented. W5-S2 renders nothing until it lands.
3. **Cal's alert email address, Resend from-address and DNS** (SPF, DKIM, DMARC on a sending subdomain) — W3-S1's alerts ship unreachable with `ADMIN_NOTIFICATION_EMAIL` unset.
4. **Notification template sign-off** — the "received" email and the three admin alerts, drafted in the system register, ship disabled.
5. **Stripe live keys and webhook secret in Vercel** — `NEXT_PUBLIC_PAYMENTS_ENABLED` stays off until an end-to-end `stripe listen` + `stripe trigger` pass.
6. **Vercel plan confirmation** — Hobby assumed (daily crons, 0–24 h reminder lead variance); hourly reminders need Pro.
7. **Pricing rates, stacking order and minimum floor** — W6-S4's tests encode the seed; a confirmation lets DESIGN.md state the model with confidence.
8. **Receipt unit labels** — if no existing label fits a non-dog/cat house-sit line, W6-S4 escalates rather than writing copy.
9. **`off_leash` / `vetted_2nd_dog` manual discounts** become reachable in W5-S1 — confirm or hide.
10. **Legacy `form_key` rows** go invisible to Cal after W2-S4 — confirm, or schedule a data migration.
11. **Stored reviewer `author_name` rows containing an email** — W1-S5 stops new ones; existing rows need a cleanup.
12. **Content Security Policy** — none exists; the JSON-LD escape is the only XSS mitigation (W0-S8).
13. **`/admin/availability` concurrency alignment** — overlap detection fixed in W2-S1; the concurrency class is deliberately not carried yet.
14. **Lightbox color exception** and the two borderline chrome sentences ("Exact total is confirmed…", "More coming soon").
15. **`stripe_events` ledger table** — W5-S8 documents the convergence contract; building it is a separate decision.
16. **Single gallery alt text, empty `telephone`/`sameAs`/socials, the discarded `returnTo` last hop, latent dark mode** — documented as deliberate in W7-S1; each is a one-line call to change.
17. **`noUncheckedIndexedAccess`** — if W6-S9 hit its stop rule, the recorded count and a follow-up.

## Coverage table

Every register item and where it lands. "Split" items are deliberate contract/adoption or SQL/code halves; each half is named.

| Item | Slices                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1   | W1-S1                                                                                                                                                                                            |
| B2   | W1-S1                                                                                                                                                                                            |
| B3   | W0-S8 (escape) · W1-S5 (writes) · W1-S6 (SQL)                                                                                                                                                    |
| B4   | W0-S9 (P0 zod, birthdate) · W1-S7 (`PET_COLUMNS`) · W6-S4 (P1 species widening, needs `others`)                                                                                                  |
| B5   | W0-S12 (guard extraction) · W1-S8 (walk add-on) · W2-S8 (edit buffer) · W5-S7 (reschedule — deferred: `getBookingTimes` lacks concurrency and coordinates)                                       |
| B6   | W1-S9                                                                                                                                                                                            |
| B7   | W1-S7                                                                                                                                                                                            |
| B8   | W0-S10 (contract) · W1-S2 (money paths) · W1-S9 (two role reads)                                                                                                                                 |
| B9   | W1-S5 (inquiries) · W1-S7 (accounts) · W1-S8 (shared core) · W2-S1 (availability/overnight) · W2-S4 (clients/on-behalf) · W2-S6 (settings)                                                       |
| B10  | W1-S2 (repository) · W1-S3 (account pages) · W1-S4 (proxy, layout, services-repo) · W1-S5 (reviews-repo) · W1-S8 (create-core) · W1-S9 (series-cron) · W2-S4 (client detail) · W3-S4 (book page) |
| B11  | W1-S6 (functions, storage) · W1-S7 (code) · W1-S8 (pet-ownership guard) · W2-S11 (grants)                                                                                                        |
| B12  | W1-S1 (onboarding) · W1-S10 (pet form)                                                                                                                                                           |
| B13  | W1-S1 (not owner-gated per VERIFY)                                                                                                                                                               |
| B14  | W2-S5 (client render, hub calendar) · W5-S1 (admin render, carry-through, config validation)                                                                                                     |
| B15  | W0-S8 (image path) · W2-S12 (casts)                                                                                                                                                              |
| B16  | W2-S3                                                                                                                                                                                            |
| B17  | W2-S1                                                                                                                                                                                            |
| B18  | W1-S10 (photo) · W2-S4 (rest)                                                                                                                                                                    |
| B19  | W2-S6                                                                                                                                                                                            |
| D1   | W2-S1 · W2-S7 · W2-S10 · W2-S12 · W3-S7 · W3-S9 · W6-S7 (post-move sweep) · W7-S2 (doc assets) · orchestrator (css tokens, design tokens, content key)                                           |
| D2   | W0-S2 (contract) · W2-S3 · W2-S5 · W2-S10 · W4-S1/S2/S5/S6 (adoption)                                                                                                                            |
| D3   | W0-S3 (contract) · W1-S3 · W1-S7 · W2-S4 · W2-S10 · W3-S4                                                                                                                                        |
| D4   | W0-S4 (contract) · W2-S1 · W2-S6 · W2-S8 · W2-S9                                                                                                                                                 |
| D5   | W3-S4 · W3-S5 · W6-S1                                                                                                                                                                            |
| D6   | W1-S4 (redirect rule) · W6-S2 · orchestrator (eslint rules) · W7-S3 (rule text)                                                                                                                  |
| D7   | W2-S12                                                                                                                                                                                           |
| D8   | W2-S3                                                                                                                                                                                            |
| D9   | W1-S6 (SQL) · W2-S8 (repository bounds) · W2-S10 (hooks)                                                                                                                                         |
| D10  | W2-S4 (core) · W3-S3 (drag hooks) · W3-S6 (repository split, timeline, gates) · W6-S3 (component split)                                                                                          |
| D11  | W3-S10 (generate, wire) · W4-S1…S8 (fan-out) · W6-S9 (strict index access, optional)                                                                                                             |
| D12  | W0-S7 (double) · W6-S4 (seed fixture) · W6-S5 · W6-S6                                                                                                                                            |
| D13  | W0-S11 (pill, phone) · W3-S1 (email shell, reply-to) · W4-\* (adoption, `ErrorState` defaults, `useAppForm`, `card-shimmer`) · W5-S8 (Stripe, env) · W6-S7 (rest)                                |
| D14  | W0-S5 (contract) · W2-S9                                                                                                                                                                         |
| D15  | W6-S4 (deviation: `others` is wired, not deleted — see risks)                                                                                                                                    |
| D16  | W2-S11 (columns, index, pgTAP) · W6-S8 (seed convergence) · W7-S3 (append-only rule)                                                                                                             |
| F1   | W3-S3                                                                                                                                                                                            |
| F2   | W5-S2 (content owner-gated)                                                                                                                                                                      |
| F3   | W4-S9 (SQL) · W5-S1                                                                                                                                                                              |
| F4   | W0-S6 (flag) · W3-S1 (email) · W3-S2 (gates) · W3-S3 (block-off confirm line)                                                                                                                    |
| F5   | W3-S8                                                                                                                                                                                            |
| F6   | W3-S8                                                                                                                                                                                            |
| U1   | W1-S1 (onboarding landmark) · W3-S4 (book, edit shells) · W5-S3 (404, error, app shell) · W6-S1 (admin shells)                                                                                   |
| U2   | W1-S11                                                                                                                                                                                           |
| U3   | W2-S7 · W7-S3 (doc)                                                                                                                                                                              |
| U4   | W2-S2 · W3-S3 (keyboard model)                                                                                                                                                                   |
| U5   | W5-S4                                                                                                                                                                                            |
| U6   | W5-S4                                                                                                                                                                                            |
| U7   | W5-S5 · orchestrator (`CLASS_CHECKS`) · W7-S3 (doc)                                                                                                                                              |
| U8   | W1-S10 (species label) · W2-S6 (settings, services) · W5-S6 (rest) · W7-S4 (Resources notes)                                                                                                     |
| X1   | orchestrator (scripts, config, deps) · W0-S1 (suite split) · W0-S8 (sitemap) · W7-S3 (WORKFLOW caveat) · W7-S6 (build)                                                                           |
| X2   | W7-S5                                                                                                                                                                                            |
| X3   | W7-S1 · W6-S4 (`isPetAware`)                                                                                                                                                                     |
| X4   | W7-S1 (DEV_NOTES) · W7-S2 · W7-S3 · W7-S4 · W7-S9 · W6-S7 (code comments in owned files)                                                                                                         |
| O1   | W3-S1 (disabled) · W4-S1/S4 (call sites) · W7-S8 (sign-off)                                                                                                                                      |
| O2   | W1-S2 (cores hardened, no UI) · W7-S1 (claims removed)                                                                                                                                           |
| O3   | W3-S9                                                                                                                                                                                            |
| O4   | W1-S9 (kept behind the flag) · W6-S4 (documented in code) · W7-S1 (documented in DESIGN)                                                                                                         |
| O5   | W2-S11 · W7-S1                                                                                                                                                                                   |
| O6   | W5-S2 (consent tail) · orchestrator (Rover TODO) · W7-S1 · W7-S4                                                                                                                                 |

**Deliberate deferrals within the session:** B5's reschedule half (wave 5, repository widening first); B4's P1 species widening (wave 6, with the `others` producer); B14's carry-through (wave 5, with F3); `noUncheckedIndexedAccess` (wave 6 tail, optional). **Not built this session, by design:** the `stripe_events` ledger; the concurrency class on `AdminBusyRangeView`; the eraser-track keyboard path; hourly reminders.

## Risks

1. **`booking-service-shared.ts` is touched in waves 1, 3, 5 and 6** (W1-S8, W3-S6, W5-S1, W6-S4) by four concerns. One owner per wave keeps it collision-free; each later slice reads the earlier diff first.
2. **The wave-3 tail leaves `typecheck` red until wave 4 closes it.** Mitigations: the tail runs only after the rest of wave 3 is green; the gate records a per-directory inventory; W3-S10 is one revertible commit; any error not traceable to `database.types.ts` fails the gate.
3. **Migration/code ordering across waves.** W2-S11's `pets` grant lists exactly the columns `runUpdatePet` writes after W1-S7; W2-S11 must re-read that function, and the wave-2 gate includes a manual pet-edit and photo-upload check. W1-S6's realtime publication precedes W2-S10's poll back-off.
4. **B4-P1 contradicts the register's D15 default.** The register proposed deleting `others`; VERIFY shows deletion leaves non-dog/cat house-sits at a `$0` base with a wrong "Cat-only home" discount. The plan wires `others` (W6-S4) and flags the rate implication to the owner; if the owner prefers deletion, the species widening reverts with it.
5. **W3-S3 is a genuine redesign inside a shared session** and owns the whole scheduler subtree for a wave. If its diff exceeds ~500 lines the orchestrator splits it into a structural slice (drag-hook extraction, which is already its first two commits) and a UX slice.
6. **Same-wave contracts by name.** W3-S4 imports `listClientForms` from the accounts barrel that W3-S5 lands in the same wave; W6-S7's dead-code commit sequences after W6-S2. Both are pinned by name in the briefs and caught by the wave gate; the fallback is to move the dependent slice one wave later.
7. **New-copy pressure.** Several fixes naturally want a sentence (conflict messages, settings errors, admin alerts). Every case is routed to a shipped string or to "ship disabled"; each slice carries a copy constraint, and the reviewer diffs new string literals against the approved list.
8. **Unverified severities.** VERIFY refuted or narrowed 9 of the 22 items it examined; most D, F, U5–U8, X2–X4 and O items were never adversarially checked. Each such slice confirms the defect exists before fixing and reports back if it does not.
9. **Ownership drift under time pressure.** One builder editing an unowned file silently breaks a same-wave slice with no branch to isolate it. Mitigations: explicit globs per slice, the mandatory "touched outside ownership" report field, and the gate's changed-files-versus-ownership diff before review.
10. **Manual QA is the only gate that catches "correct but wrong".** If the schedule slips, W7-S7 moves earlier (a smoke pass after wave 2 is already in the gate) rather than being cut.

## Handoff log

### NOTE — session close (2026-09-03)

All eight waves landed and passed the between-wave gate (typecheck, lint, format, `next build`, unit, integration). Final state: 189 unit files / 1875 tests and 13 integration files / 177 tests green; `next build` green with every public route static; react-day-picker no longer ships on marketing pages.

- **Wave 0** — shared contracts: `DbClient` alias over the generated database types, settings schema, client-pets repository, phone schema, cron auth, payments-enabled flag, drive-buffer guard, booking status pill, Denver time and money formatters.
- **Wave 1** — booking core: client-safe barrels per ADR-0002, repository split, edit/create cores sharing the re-quote, drive buffer applied on reschedule, booking-received email on create.
- **Wave 2** — admin: bounded queries on generated types, availability conflicts surfaced instead of reverted, per-night services no longer require a duration, admin client barrel keeping server-only modules out of the browser bundle.
- **Wave 3** — notifications, payments switch, multi-day availability paint (mouse and keyboard), shared loaders, cursor ring.
- **Wave 4** — manual discounts generalised from the Kiche one-off (Friends & Family, Complimentary) and persisted through edits; references section scaffold; net-paid / amount-owed projections; webhook verification through the gateway.
- **Wave 5** — accessibility and design-system adoption (control variants, tokens, error-state defaults, section header and eyebrow), out-of-area address refusal, onboarding status fix, static marketing layout.
- **Wave 6** — structure and boundaries, test fidelity (argument-recording Supabase double, integration cleanup and per-suite fixed hours), off-token radius/elevation lint, `noUncheckedIndexedAccess` enabled with real guards.
- **Wave 7** — docs reconciled with the code, shipped plans and specs archived, CI on push, production build and route-shape verification, browser QA (client and admin flows, keyboard-only booking, 320px), owner decision queue in `OWNER-GATED.md`, QA fixes (bookings-hub month label and stale day panel, zero-amount payment pill on hub and client detail, availability-grid keyboard navigation), demo seed with real quote inputs.

Browser re-verification after the QA fixes passed on the local stack: month navigation moves the caption, the `?month=` parameter and the rows together and hides the stale day panel; `$0` bookings show no payment pill on either surface; the availability grid is fully keyboard-navigable (arrows, Home/End to the week's first live day, month edge forward, no focus loss stepping into a past month, Shift+Arrow extend). The `/book` scheduler is unchanged.

Non-blocking residuals, logged for a later pass:

- Login: the browser driver cannot deliver a native Enter keypress, so "Enter submits the sign-in form" is pinned by a jsdom test and by a real mouse submit, not by a live keystroke. A human pressing Enter on `/login` closes it.
- Availability grid: a Shift+Arrow extend off the month edge into a fully past month can still drop focus (pre-existing behaviour; plain arrows and Home/End are guarded).
- Two demo-seed helpers still write bookings inside business hours; integration suites claim off-hours slots (02:00, 06:00, 23:00 UTC and the hours listed in each suite) to stay clear of them.

History: the session's 111 working commits were regrouped into 45 logical commits on `main` (soft reset to `b417ba0` + regroup; tree byte-identical). Nothing has been pushed. Owner-gated items are listed in `docs/superpowers/OWNER-GATED.md`.

---

_Last reviewed: 2026-09-03_
