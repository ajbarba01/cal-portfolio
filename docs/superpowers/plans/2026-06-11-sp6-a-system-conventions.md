# SP6 Plan A — System conventions + shared fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the systemic layer of the cohesion sweep — the overflow root-cause fix, width system, select width, attention token, button/form conventions, visible loading, returnTo generalization, the unified `<BookingFlow>` rebuild (U1/U2/U6/U24), the required-forms booking gate (U26), the onboarding double-submit bug (U25), and reviews auto-publish — so Plan B can apply conventions per surface.

**Architecture:** Schema-free. Conventions live in primitives + FRONTEND.md; `<BookingFlow>` (`src/features/booking/_components/booking-flow.tsx`) is the single place booking-UX fixes land (public + admin create/edit + account edit all wrap it). The forms gate extends `computeBookingArtifacts` (pure, repo-injected — TDD). Every task: typecheck + lint gate; commit per task; subject-line-only Conventional Commits, no plan/phase IDs in subjects.

**Tech Stack:** Next.js App Router (RSC), TypeScript strict, Tailwind semantic tokens, Base UI, lucide-react, vitest.

**Spec:** [`2026-06-11-sp6-cohesion-design.md`](../specs/2026-06-11-sp6-cohesion-design.md). **Visual contracts (signed off, see [mockups/sp6/NOTES.md](../mockups/sp6/NOTES.md)):** `system-preview.html` (Tasks 3–7), `booking-flow-preview.html` (Tasks 9–10).

**Standing rules:** tokens are law (semantic Tailwind only); lucide over emoji; AA contrast + visible focus + keyboard nav; mobile parity; `frontend-design` skill before UI tasks; escalation via `## Handoff log` below.

---

## File map

- **Overflow fix:** TBD by Task 1 root cause — suspect shared layout (`src/components/layout/page-shell.tsx` / `page-container.tsx` / `globals.css`).
- **Width system:** `src/components/layout/page-container.tsx` (add `narrow`), `src/components/layout/site-footer.tsx` (container), `docs/FRONTEND.md` (conventions section).
- **Primitives:** `src/components/ui/select.tsx` (anchor width), new `src/components/ui/textarea.tsx`, `src/app/globals.css` (`--attention`).
- **Loading:** new `src/app/(marketing)/loading.tsx`, `src/app/(account)/loading.tsx`, `src/app/(admin)/loading.tsx`; `src/components/site-header.tsx` (Suspense split); reuse `src/components/ui/skeleton.tsx`.
- **Auth redirect:** `src/app/(auth)/login/page.tsx` + signup + the existing `returnTo` guard helper (grep `returnTo` in `(auth)`).
- **BookingFlow:** `src/features/booking/_components/booking-flow.tsx` + its three client wrappers; `src/features/booking/booking-service-shared.ts` (forms gate); `scripts/db-seed/` (scenario extension).
- **Reviews policy:** `src/features/reviews/` submit action + admin reviews surface (verify unpublish exists).

---

## Task 1: Mobile horizontal overflow — root cause + fix (U14, U22)

**Files:** investigation first; fix lands where the root cause is (suspect `page-shell.tsx` / `page-container.tsx` / a `min-w` in card rows).

- [x] **Step 1 (systematic-debugging):** Reproduce on real device emulation — `npm run dev` is usually on :3000 (maintainer's; don't kill it — use `next dev -p 3001` if needed). Chrome DevTools device toolbar at 390×844 on `/services`, `/book/walk`, `/reviews`, `/contact`, `/` (CTA band). Confirm horizontal scrollbar / right-edge clipping. If it does NOT reproduce outside headless capture, log that in the Handoff log and close U14/U22 as capture artifacts (skip to Step 4).
- [x] **Step 2:** Locate the shared cause. In DevTools, `document.querySelectorAll('*')` widest-element sweep (or toggle `outline: 1px solid red` via `* { outline … }`) on one affected page; identify the element wider than the viewport and the rule responsible (candidates: a fixed width, `min-w-*`, unpadded `w-full` + margin, grid `auto-cols` overflow). Verify the SAME rule explains the other affected pages before fixing.
- [x] **Step 3:** Fix at the root (one change, not five per-page patches). Add `min-w-0` / `max-w-full` / corrected padding at the shared layout level as the diagnosis dictates.
- [x] **Step 4:** Verify all five surfaces at 390 + 768 + 1024: no horizontal scroll, no clipped content. Record root cause in the Handoff log (non-blocking note).
- [x] **Step 5:** `npm run typecheck` + `npm run lint`, commit: `fix: stop mobile horizontal overflow on public pages`

## Task 2: Width system — PageContainer `narrow` + footer alignment (U16)

**Files:** Modify `src/components/layout/page-container.tsx`, `src/components/layout/site-footer.tsx`, `docs/FRONTEND.md`.

- [x] **Step 1:** Add the `narrow` width to `PageContainer`:

```tsx
const widths = {
  read: "max-w-[65ch]",
  narrow: "max-w-xl", // forms / booking flow (~36rem)
  app: "max-w-6xl",
} as const;
```

- [x] **Step 2:** `site-footer.tsx`: wrap content in the same inner container as the header — `mx-auto w-full max-w-6xl px-5 sm:px-8` (today the footer div has no `max-w`, so footer content misaligns with the boxed header). Leave link content for Plan B Task 2.
- [x] **Step 3:** Document the width scale in `docs/FRONTEND.md` (read 65ch · narrow 36rem · app 6xl; header+footer share the 6xl container; bands full-bleed bg + inner container; 50–75 CPL target) — same commit.
- [x] **Step 4:** Visual check (1440 + 390): footer edges align with header edges on marketing + account + admin.
- [x] **Step 5:** Typecheck + lint, commit: `feat: add narrow page width and align footer container`

## Task 3: Select popup matches trigger width (U17)

**Files:** Modify `src/components/ui/select.tsx`.

- [x] **Step 1:** In `SelectContent`, add the Base UI anchor-width var to the Popup classes: `min-w-[var(--anchor-width)]` (keep `min-w-[8rem]` as the floor: `min-w-[max(8rem,var(--anchor-width))]`).
- [x] **Step 2:** Verify on the widest consumers: admin bookings hub status filter, settings TimePicker trio, booking-flow selects — popup never narrower than its trigger; keyboard nav + focus ring unchanged.
- [x] **Step 3:** Typecheck + lint, commit: `fix: match select popup width to its trigger`

## Task 4: `--attention` → slate (U31)

**Files:** Modify `src/app/globals.css`.

- [x] **Step 1:** Repoint the token (stays theme-independent, white foreground):

```css
/* Attention badge — slate (#3c5566, blue-deep family), white text ≈7.9:1 AA.
   Slate = "do something" (routine); red stays reserved for danger/owing.
   Gold (#8a6a1b) rejected by maintainer 2026-06-11. Theme-independent. */
--attention: #3c5566;
```

- [x] **Step 2:** Verify badges on seeded `admin-demo`: sidebar + mobile drawer, light + dark theme, AA holds, renders nothing at 0 (behavior untouched — token-only change).
- [x] **Step 3:** Commit: `feat: repoint attention badge token to slate`

## Task 5: Textarea primitive + form-on-card recipe + button hierarchy (U15)

**Files:** Create `src/components/ui/textarea.tsx`; modify `docs/FRONTEND.md`; modify the submit buttons in `src/app/(auth)/login/page.tsx` + `src/app/(auth)/signup/page.tsx` (+ their form components) and `src/app/(marketing)/contact/_components/contact-form.tsx`.

- [x] **Step 1:** Create `Textarea` mirroring `src/components/ui/input.tsx` styling exactly (same border/bg/focus classes, `data-slot="textarea"`, `min-h` + `resize-y`). Replace the hand-rolled `<textarea>` in `contact-form.tsx` with it.
- [x] **Step 2:** Button hierarchy (system-preview contract): switch the login/signup/contact submit buttons from the near-black default to `variant="brand"`. Grep for other form submits using the default variant in `(auth)`/`(marketing)`/`(account)` and switch any found — the rule: **brand = THE action of a surface (one per view); outline = secondary; ghost = tertiary; destructive behind `useConfirm`; near-black `primary` only for neutral chrome.**
- [x] **Step 3:** Document the button rule + form-on-card recipe (`bg-card` + border + `rounded-2xl` card; inputs `bg-background` + `border-input` + clay focus ring) in `docs/FRONTEND.md` — same commit.
- [x] **Step 4:** Visual check login/signup/contact; typecheck + lint, commit: `feat: unify form action buttons and add textarea primitive`

## Task 6: Visible loading — zone skeletons + header Suspense (P3-lite)

**Files:** Create `src/app/(marketing)/loading.tsx`, `src/app/(account)/loading.tsx`, `src/app/(admin)/loading.tsx`; modify `src/components/site-header.tsx` and the shells that render it.

- [x] **Step 1 (the load-bearing bit):** `SiteHeader` is async (auth+role queries) inside zone layouts — per the Next.js docs, runtime data in the layout blocks `loading.tsx` fallbacks. Split it: header chrome (wordmark, tab row) renders statically; the auth cluster + admin wordmark tint become a child async component wrapped in `<Suspense fallback={<Skeleton className="h-5 w-16" />}>`. Keep one header render path — only the auth-dependent fragment suspends.
- [x] **Step 2:** Zone `loading.tsx` ×3 using the existing `Skeleton` primitive, matching each zone's shell (marketing: header-height bar + title + text rows; account/admin: sidebar rail + content rows — see system-preview panel 4). Lightweight, token-colored, no spinners.
- [x] **Step 3:** Verify with DevTools "Slow 3G" + hard navigations: skeleton paints immediately on nav to a dynamic page; no layout shift when content swaps in (CLS stays 0 — match real dimensions).
- [x] **Step 4:** Typecheck + lint + `npm run build` (Suspense splits can surface server-only leaks — SP3a/5a precedent), commit: `feat: add zone loading skeletons and non-blocking header auth`

## Task 7: Generalize returnTo redirect-back (U4)

**Files:** Modify login/signup pages + the place "Sign in" links are emitted (`site-header.tsx`, drawer in `site-nav.tsx`); reuse the existing open-redirect guard (grep `returnTo` under `src/app/(auth)`).

- [x] **Step 1 (test-first):** The guard is pure — extend its unit test (or create one beside it) covering: relative path allowed (`/reviews` → `/reviews`), absolute URL rejected (`https://evil.com` → default), protocol-relative rejected (`//evil.com` → default), empty → default. Run: FAIL if behavior missing.
- [x] **Step 2:** Generalize: login/signup read `returnTo` for ANY guard-passing path (today only `/book/` paths round-trip). Header/drawer "Sign in" links append `returnTo=<current pathname>` (client components already have `usePathname`). Post-auth redirect goes through the guard.
- [x] **Step 3:** Run tests — PASS. Manual: sign in from /reviews → back on /reviews; from /book/walk → /book/walk (unchanged); crafted `?returnTo=https://evil.com` → default landing.
- [x] **Step 4:** Typecheck + lint, commit: `feat: return to origin page after sign-in from anywhere`

## Task 8: Reviews auto-publish + admin unpublish

**Files:** `src/features/reviews/` (submit action / insert path); admin reviews surface (verify unpublish/remove action exists — shipped in SP5a polish).

- [x] **Step 1 (test-first):** Locate the review-create core/action test; add/adjust the case: a newly submitted review is created **published** (whatever the column is — `published: true` / `status: 'published'`; read the schema first). Run: FAIL.
- [x] **Step 2:** Flip the insert default; update the client submit feedback copy ("Thanks — your review is live") and remove any "appears after approval" copy. Run: PASS.
- [x] **Step 3:** Verify admin can still unpublish/remove (existing moderation surface — if no unpublish action exists, STOP and escalate via the Handoff log; do not improvise one).
- [x] **Step 4:** Typecheck + lint + reviews tests, commit: `feat: publish reviews immediately with admin unpublish`

## Task 9: BookingFlow rebuild — layout per contract (U14-stepper, U23-rhythm)

**Files:** Modify `src/features/booking/_components/booking-flow.tsx` (+ the three wrappers only if their props must thread new bits: `service-booking-client.tsx`, `admin-create-booking-client.tsx`, `edit-booking-client.tsx`).

**Visual contract:** `booking-flow-preview.html` — stacked single column (`PageContainer narrow` / max-w ~36rem), step **cards** (numbered clay disc + Fraunces heading), summary card inline after the steps with live quote, brand CTA. **No sticky side receipt. Calendar visuals unchanged** (maintainer-approved as-is) — do not restyle day cells.

- [x] **Step 1 (frontend-design first):** Restructure the flow markup into step cards + inline summary per the contract. The `NumberStepper` and any row content get `min-w-0`/`max-w-full` so the column never overflows at 390 (Task 1's fix should already cover the substrate; verify here).
- [x] **Step 2:** Summary card: service, date, duration/nights, pets, server-derived total (existing quote artifacts — no client math), CTA, and the U6 policy line **rendered from settings** (prepay availability + cancellation/refund pct via the existing settings read — exact copy pattern: "Free cancellation until {window}; later cancellations keep {pct}%". If a needed value has no settings field, escalate, don't hardcode).
- [x] **Step 3:** Verify all three consumers render correctly (public create, admin create-on-behalf, account edit) — desktop + 390 + 768. The characterization test (`service-booking-client.characterization.test.tsx`) still passes.
- [x] **Step 4:** Typecheck + lint + `npx vitest run src/features/booking`, commit: `feat: rebuild booking flow as stacked step cards with inline summary`

## Task 10: BookingFlow behavior bucket — U1 success, U2 lead-time, U24 overnight zod

**Files:** `booking-flow.tsx` + the create/edit submit paths in the wrappers; `src/features/booking/booking-service-shared.ts` only if U2 needs a flag surfaced.

- [x] **Step 1 — U1 (test-first where logic):** On `createBooking` success, render the terminal success panel per the contract (check-disc, summary line, approval copy variant when `requires_approval`, "View my bookings" → `/account/bookings`, "Book another" resets the flow). No more silent return. Admin create keeps its existing redirect behavior — the panel is for the public/account paths.
- [x] **Step 2 — U2:** Lead-time-blocked days render as **unavailable** in the calendar data (grey, not selectable) instead of surfacing a post-selection error; one quiet note under the calendar ("Days before {date} need more notice — contact Cal if you need something sooner" linking `/contact`). The core already returns `unavailable` correctly — this is UI mapping; trace where the lead-time guard result reaches the client and merge it into the day-state computation.
- [x] **Step 3 — U24 (systematic-debugging, test-first):** Reproduce the reschedule-overnight zod failure (`nights` undefined) — seed `busy-week`, edit an overnight booking. Root cause: the edit path's input assembly drops `nights` for overnight services. Write the failing test at the input-assembly/core level, fix, PASS. Do not band-aid with a default value in the schema.
- [x] **Step 4:** Verify the three flows again (create walk, create overnight, reschedule overnight; lead-time day grey; success panel both copy variants). Typecheck + lint + booking suite, commit: `fix: booking success state, lead-time availability, and overnight reschedule`

## Task 11: Required-forms booking gate (U26)

**Files:** `src/features/booking/booking-service-shared.ts` (+ repository), the booking-flow gate messaging, `scripts/db-seed/scenarios.ts`.

- [x] **Step 1 (discovery, ~15 min):** Define "required forms complete". `Grep -i "form" supabase/migrations` + read the forms feature under `src/features/accounts` (FormCard). Establish: which table holds form definitions/submissions, what marks a form required, what marks a submission complete. Write the definition into this plan's Handoff log before coding. If the data model can't express "required" without schema change, STOP — escalate (SP6 is schema-free).
- [x] **Step 2 (test-first):** Extend the `computeBookingArtifacts` test suite (pattern: existing onboarding/debt gate tests in `booking-service.test.ts`, repo faked): incomplete required forms → gate refuses with a distinct reason (e.g. `forms_incomplete`); complete → passes. Run: FAIL.
- [x] **Step 3:** Add the repo read + gate to the shared artifacts computation (join the existing `Promise.all` — don't add a serial await; A15 precedent). Run: PASS.
- [x] **Step 4:** UI: gate surfaces as **unavailability-style messaging** in BookingFlow — calm card "Finish your forms before booking" + link to `/account/forms` — never a thrown error. Admin create-on-behalf: confirm intended behavior — default **admin bypasses the gate** (Cal can book for anyone); escalate if the spec reading differs.
- [x] **Step 5:** Seed: extend a scenario (e.g. `payment-states` or `busy-week`) with one client having incomplete required forms; document in the seed registry.
- [x] **Step 6:** Typecheck + lint + booking suite, commit: `feat: gate booking on required form completion`

## Task 12: Onboarding double-submit (U25)

**Files:** `src/app/(onboarding)/onboarding/_components/info-step.tsx` (+ the action it calls).

- [x] **Step 1 (systematic-debugging):** Reproduce: fresh seeded user (`fresh` scenario), complete the info step — confirm it takes two attempts. **Known lead:** [`2026-06-09-onboarding-admin-batch-design.md`](../specs/2026-06-09-onboarding-admin-batch-design.md) §"Bad errors" documents this exact symptom — `runOnboarding` uses `.parse()` and throws a single generic `Error` (spurious error on first click, delayed transition); per-field zod messages never reach the user. Verify that diagnosis still holds before fixing.
- [x] **Step 2:** Root cause in the Handoff log, then fix at the cause. Add a regression test if the cause is in testable logic (action/core level); if purely a client wiring bug, the manual repro is the verify.
- [x] **Step 3:** Verify: one attempt completes the step; error states (invalid input) show visible inline feedback (feedback rule — nothing silent).
- [x] **Step 4:** Typecheck + lint, commit: `fix: onboarding info step completes on first submit`

---

## Final gates + close-out

- [ ] `npm run typecheck` · `npm run lint` (0 errors) · `npx vitest run` (no new failures vs the 7 known shared-DB ones) · `npm run build`.
- [ ] Manual `verify`: the five U14 pages at 390; login→returnTo round-trip; booking create/edit happy paths; skeletons on slow nav.
- [ ] Fresh-session `/code-review`; address findings (receiving-code-review discipline).
- [ ] Prune from the register: U1, U2, U4, U14, U15 (primitive half), U16 (container half), U17, U22 (if confirmed U14 instance), U24, U25, U26, U31 + the reviews-auto-publish decision note. U6 prunes here if the policy line shipped; leave surface-application findings (U5/U7/U8/…) for Plan B.
- [ ] HANDOFF session-log line (same commit).

## Handoff log

(escalations + non-blocking notes per WORKFLOW.md)

### Task 1 — 390px = capture artifacts; real overflow at 768 fixed in header (2026-06-11)

**390px (U14/U22):** clean under CDP device emulation (scrollWidth = clientWidth = 390 on all 5 pages) — closed as headless-screenshot capture artifacts, not layout bugs.
**Method correction:** the first verification matrix was invalid — the script ignored `Page.navigate` errorText and measured Chrome's error page; rerun with a navigation guard (assert `location.href` is on `localhost:3000` before measuring).
**Real bug found at 768 (all public pages):** site-header desktop layout switched on at `md`, but wordmark (142px) + tab row (556px) + auth cluster (32px, signed out) + grid gaps (32px) = 762px against ~689px available inside container padding → ~73px horizontal overflow (worse signed-in).
**Fix:** moved header desktop-nav breakpoint `md:` → `lg:` in `src/components/site-header.tsx` — burger persists 768–1023. Gap-tightening alone couldn't close 73px+ without severe crowding; header restyle deferred to SP6 Plan B.
**Verification:** 5 pages × 390/768/800/834/1024 — scrollWidth = clientWidth, overflow = false on all 25. `npm run typecheck` + `npm run lint` — 0 errors (3 pre-existing scheduler warnings unchanged).
**Maintainer-reported follow-up (same day):** below `lg` the burger floated near header center. Root cause: with the tabs wrapper `display:none` it stops being a grid item, so the right cluster auto-placed into the centered `auto` column of `grid-cols-[1fr_auto_1fr]`; fix = `col-start-3` on the right cluster. Flaw predated Task 1 (existed below 768 with the old `md:` classes); the `md:`→`lg:` move only widened the visible band to 768–1023.
**Re-verify:** `/` at 390/600/768/1000/1024/1440 — cluster right edge == container content edge exactly at all six; scrollWidth == clientWidth everywhere.

### Task 6 — header split + navBadges deferral + loading skeletons (2026-06-12)

**Header split shape:** `SiteHeader` is now a SYNC component rendering the tab-row chrome + a `<Suspense>` boundary. `HeaderAuth` is the async server component that does auth+role queries and renders the wordmark, desktop auth cluster, and mobile drawer.

**Wordmark decision:** Wordmark moved INTO the async child (`HeaderAuth`). The admin clay tint (`text-brand-strong`, different `href`) requires knowing `isAdmin` — rendering a tint-neutral wordmark statically would cause a flash-swap for admins on every page load. One render path, no visual pop; the tradeoff is the wordmark shows as a skeleton (~12w × ~h-12 ears + ~24w × ~h-5 text) during the auth Suspense window, which is brief.

**Grid safety:** Tab row pinned to `col-start-2` explicitly (was implicit before), so DOM ordering of Suspense children vs. tab row never affects placement.

**navBadges finding:** Admin layout was `await`ing `getAttentionCounts()` before rendering PageShell — this blocked the admin `loading.tsx`. Fixed by changing `attentionPromise = getAttentionCounts().then(...)` (not awaited) and threading it as `navBadgesPromise: Promise<NavBadges>` through both `PageShell→SiteHeader→HeaderAuth` (header mobile drawer) and `AppShell→SidebarWithBadges` (desktop sidebar). Both resolve inside Suspense boundaries. The prop name changed from `navBadges: NavBadges` to `navBadgesPromise: Promise<NavBadges>` on `PageShell`, `SiteHeader`, and `AppShell`. `AppSidebar` and `SiteNavMobile` still accept the resolved `NavBadges` type — the promise is awaited one layer above.

**loading.tsx files:** Three created. Marketing: single `max-w-[65ch]` column with title + prose rows + card block. Account + Admin: both mirror `AppShell` layout (sidebar rail on md+, content area with title + cards). Admin sidebar rail has 8 skeleton rows (matches adminNav items), account has 5 (matches accountNav items).

**Verification gates:** `npm run typecheck` 0 errors · `npm run lint` 0 errors (3 pre-existing scheduler warnings) · `npm run build` clean (32/32 static pages + 35 dynamic routes, no bundle leaks).

### Task 5 — shared account-component submits deferred to Plan B (2026-06-12)

Sweep found two primary submits still on the default Button variant: `src/features/accounts/_components/form-card.tsx` and `src/features/accounts/_components/pet-form.tsx`. Both are account-zone primaries but are shared with the admin client-detail surface (SP5a), so per the task scope note they were left untouched. Plan B's surface sweep should switch them to `brand` per the hierarchy rule. Also noted: `src/app/(onboarding)/onboarding/_components/info-step.tsx` has a default-variant primary submit — `(onboarding)` is outside this task's zone list; include it in the Plan B sweep.

### Task 10 — U24 root cause: diffBookingPatch seeded quantities with current.nights (2026-06-12)

**U24 root cause:** `diffBookingPatch` was computing both the "before" and "after" quantities using `current.nights` — so for a pure date reschedule the diff always matched (nights appeared unchanged), leaving `nights` absent from `patch.quantities`. `buildEditQuoteInput` then merged that empty patch over `booking.quote_inputs`, and legacy/seeded rows store no `nights` field, producing `quantities.nights = undefined` → Zod failure. Two-part fix: (1) `diffBookingPatch` now derives initial nights from the stored ISO timestamps (`initialNightsFromIso`) so a date change that alters night count produces a diff; (2) `buildEditQuoteInput` recomputes `nights` from the merged `startsAt`/`endsAt` unconditionally so even a same-count reschedule (where the diff legitimately omits quantities) always populates `nights`.

**U2:** lead-time blocking merged into day-state computation at both levels — `deriveBookableDays` (overnight/month-range) and `hourlyAvailableDayKeys` (hourly/week-slots) now accept lead-time args and mark blocked days `out-of-window`. Admin surfaces (availability painter, admin create) zero `minLeadTimeHours` to avoid blocking Cal's own calendar. `LeadTimeNote` guards on `minLeadTimeHours > 0`; renders null when lead time is 0.

**U1:** success snapshot captured at submit time (not derived from live state) to survive the post-success busy refresh. `resetFlow` clears scheduler + quote + success state; `submitDone` is now derived from `success !== null`. Admin create keeps its server-side redirect; success panel is public/account-create only.

### Task 11 — required-forms gate definition + implementation (2026-06-12)

**"Required forms complete" definition:**

- **Where:** `services.form_key text` (nullable) + `form_responses (client_id, form_key, data)`.
- **What marks a form required:** `services.form_key IS NOT NULL` — the service declares which form key clients must submit before booking it. Currently only the `emergency` form key exists (registered in `src/features/accounts/form-registry.ts`).
- **What marks a submission complete:** any row in `form_responses` matching `client_id = $userId AND form_key = $service.form_key`. The gate checks existence, not `data` content — a submitted (even empty) row satisfies the requirement. Data validity is enforced at form-submit time via `emergencySchema`.
- **Schema-free:** no new columns needed. `ServiceRow` gained `form_key: string | null` (added to the existing Supabase select projection). No migrations.
- **Gate result:** `forms_incomplete` — new variant in `ArtifactsResult`, `CreateBookingResult`, and `PreviewResult`.
- **Admin bypass:** `ADMIN_POLICY.skipFormsGate = true` — Cal can book on behalf of any client; gate produces a warning instead of blocking. `CLIENT_POLICY.skipFormsGate = false`.
- **UI:** calm `GatePanel` ("Finish your forms before booking" + `/account/forms` link) in `service-booking-client.tsx` receipt slot; fires only when `authState === "ready" && formsIncomplete`. Never a thrown error.
- **Seed:** `admin-demo` scenario sets `form_key = 'emergency'` on the walk service via `setServiceFormKey`. Dana (has the form) books normally; Sam, Lee, Devon, Paula (no form) will see the gate card on `/book/walk`.
- **New files:** `src/features/booking/forms-gate.test.ts` (4 pure unit tests, all green).
- **Modified stubs:** `booking-service.test.ts` `makeMockRepo`, `edit-booking.test.ts` `makeRepo`, `mutations/create-booking.mutation.test.ts` `makeRepo` — all updated with `form_key: null` on service stub + `hasFormResponse: vi.fn(async () => true)`.

### Task 8 — reviews auto-publish required a policy migration (2026-06-12)

**Deviation:** SP6 was declared schema-free, but the reviews RLS `WITH CHECK` pinned `status='pending'`, so the maintainer's auto-publish decision was unimplementable without a policy migration → shipped `20260612120000_reviews_auto_publish.sql` (insert policy + column default flipped to `published`; enum/tables untouched; applied locally via non-destructive `npx supabase db push --local`). **Prod push of this migration is maintainer-owned at next deploy.**
**Follow-up for Plan B (maintainer decision needed):** the admin dashboard's "reviews to moderate" attention row keys on `pending` and is now permanently 0 — reactive moderation currently has NO new-review awareness signal. Options: a recency-based "new reviews" row, or drop the row.
**Cosmetic:** admin reviews Pending filter is vestigial; seeder still seeds a `pending` review (service-role bypasses RLS — fine, app-unreachable state).

### Task 12 — onboarding double-submit was a stale router-cache replay, not the `.parse()` lead (2026-06-12)

**Lead correction:** the 2026-06-09 §"Bad errors" diagnosis (`.parse()` + generic throw) was already fixed in `6ea8a9c` (useActionState + `parseOnboardingForm` safeParse + inline `FormField` errors). The residual bug was the post-success redirect target.
**Repro (CDP, seeded `admin-demo`, noor@local.test info_pending):** ONE valid submit → DB writes all succeed (status → `meet_greet_pending`, emergency form_response inserted) → action `303` with `x-action-redirect=/account;push` → **no RSC refetch** — the router renders `/account` from its client cache, and that entry was poisoned at login time (`GET /account?_rsc → 307 → /onboarding` followed transparently by fetch, so the step-1 flight payload is stored under the `/account` key). User sees an empty step-1 form at URL `/account` → reads as a failed submit → tries again.
**Fix at cause:** success redirect now targets `/onboarding` itself (`onboardingSuccessPath` in `onboarding-form.ts`, returnTo preserved as query param) + `revalidatePath("/onboarding")` so the wizard re-renders fresh at `meet_greet_pending`. Never redirect onto a route middleware bounces for the user's new state.
**Verify:** one click → step 2 in ~0.7s (network trace: `x-action-redirect=/onboarding;push` + fresh payload); exactly one `emergency` form_response row; invalid input shows inline per-field zod errors (red borders + messages), still step 1. Regression tests: `onboardingSuccessPath` red→green in `onboarding-form.test.ts`.
**Non-blocking nit (Plan B candidate):** React 19 form-action reset clears typed values after a validation-error return — errors render correctly but the user must re-type valid fields. Fix would echo submitted values back through state as `defaultValue`s.

### Task 11 follow-up — seed cross-contamination fixed (2026-06-12)

Task 11's `setServiceFormKey` (sets `walk.form_key='emergency'` in `admin-demo`) persisted across subsequent seeds because `wipe()` treated `services` as migration-owned and never reset its config columns. Fixed by adding a baseline `update services set form_key = null` in the wipe phase (`scripts/db-seed/wipe.ts`), so every scenario seed starts from a clean services config. `admin-demo` remains the only scenario that sets `form_key`. Verified: `busy-week` seed → all null; `admin-demo` → walk='emergency'; reseed `busy-week` → all null (contamination gone). Zero `forms_incomplete` test failures.
