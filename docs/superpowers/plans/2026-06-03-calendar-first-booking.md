# Calendar-First Booking Refactor — Implementation Plan (Phases 19–23)

> **For agentic workers:** continues the systems-first style of `2026-06-03-booking-rules-v2.md` (Phases 14–18, all done). Standalone. Steps use checkbox (`- [ ]`) syntax; mark `- [x]` with a commit SHA on the phase header when a phase lands. **Authority:** DESIGN.md is the spec; this turns the calendar-first refactor into ordered, independently verifiable milestones.

**Goal:** Make a **calendar the primary UX** for both customer booking and Cal's admin availability/management, on **one generalizable calendar component**. Bookings assign **real pets** from the profile (`dogs`→`pets` + species). The book flow is **guarded** (sign-in + onboarding) at the action with a `returnTo` round-trip. The calendar reflects **true availability** via a service-role busy source (today the hook only sees the viewer's own bookings). Lands as a **wireframe**: full UX/behavior, minimal token-only styling deferred to a later overhaul.

**Architecture (unchanged):** `app/` routing only · `features/<domain>/` pure core + services + adapters · `lib/` business-agnostic infra. Pure domain math/state, IO at edges, `now` injected; vendors behind typed interfaces. RLS deny-by-default + column guard. Overlap math half-open `[)` to match the GiST exclusion constraint.

### Cross-cutting conventions (every phase)

- TS strict, no `any`; Zod-parse all DB/form/env data at the edge. Times UTC, rendered `America/Denver` via the shared `availability.ts` helpers (no duplicated `Intl`).
- Pure core = no IO/clock inside; pass `now` in. Eligibility math stays in `availability.ts` / new `calendar-model.ts`; date-fns is layout-only inside grid components.
- Busy ranges shown for a service filter by that service's **concurrency class** (cross-class overlaps are legal); submit (`23P01 → slot_taken`) is the real arbiter.
- Each phase ends green: `npm run typecheck` + `npm run lint` + `npm test` (+ pgTAP where a migration/RLS lands) before a subject-line-only Conventional Commit. Same-commit doc rule.
- Styling: semantic design tokens only, no hardcoded colors, accessibility floor kept; no visual polish (wireframe).

### Order (dependencies)

19 → 20 → 21 (uses 20's pets + booking_pets) → 22 (uses 19's calendar-model + 21's busy path) → 23 (uses 22's calendar + 21's admin busy).

---

## Phase 19 — Pure calendar foundations — [x] `56acf26`

**Goal:** Shared Denver helpers + pure month/range/slot derivation, fully unit-tested. No UI change.
**Files:** `src/features/booking/availability.ts`, `src/features/booking/calendar-model.ts` (new), `src/features/booking/calendar-model.test.ts` (new).

- [x] **Export Denver helpers.** Make `denverMinutesSinceMidnight` exported; add pure `denverDayKey(date): string` ("YYYY-MM-DD" in America/Denver). Extend `availability.test.ts` for `denverDayKey` (DST boundary correctness).
- [x] **`markSlotsBusy(slots, busy)`** → `{ slot, busy }[]`, half-open `[)` overlap (touching boundaries allowed). Exposes `overlapsHalfOpen`.
- [x] **`deriveBookableDays({ days, windows, busyResident, rules, now })`** → `DayAvailability[]` with state `available|busy|out-of-window|past|too-far` (house_sitting full-day classification; `days` are Denver-midnight instants).
- [x] **`validateStayRange({ checkIn, checkOut, windows, busyResident, rules, now })`** → `{ ok: true; nights; range } | { ok: false; reason }`. nights = whole-day diff (≥1); builds the stay range at check-in/out time-of-day = `bookingOpenMinute`; reuses `fitsWindow` + lead/max-advance; rejects resident-busy overlap.
- [x] **Tests** (TDD, `now` injected): markSlotsBusy `[)`; bookable-days each state incl. empty windows → all out-of-window + precedence; stay-range whole + checkout-before-checkin + straddling-busy + partial-outside-window + lead/max-advance on check-in. 54 new assertions; full suite 402 green.
- [x] **Gate + commit** `feat: pure calendar-model derivation (bookable days, stay range, busy marking)`.

**Verification:** `npm test` green; `npm run typecheck` + `npm run lint` clean.

---

## Phase 20 — Pets generalization (dogs→pets + species + photos) — [x] `c9fcc50`

**Goal:** Real assignable pet records with species + photo upload; app stays green (booking still posts counts).
**Files:** `supabase/migrations/20260603130000_pets_generalization.sql`, `src/features/accounts/account-actions.ts`, `src/features/accounts/_components/pet-form.tsx` (new shared), `app/(account)/account/pets/**` (moved from `dogs`), `src/features/booking/_components/pet-avatar.tsx` (new), account nav links.

- [x] **Migration.** `pet_species` enum; `alter table dogs rename to pets`; add `species pet_species not null default 'dog'`; rename the 5 RLS policies to `pets:` names; `booking_pets` join table (`booking_id`→bookings cascade, `pet_id`→pets restrict, PK both) + RLS; private `pet-photos` storage bucket + owner-keyed object policies.
- [x] **Actions.** `from("dogs")`→`from("pets")`; `petSchema`+`species`; `createPet`/`updatePet`/`deletePet` (createPet returns the inserted row); add `uploadPetPhoto` (session client, RLS; uploads object then writes `pets.photo_url` path).
- [x] **Route + UI.** Moved `account/dogs`→`account/pets`; refresh-based `pets-client.tsx`; shared `PetForm` in `features/accounts/_components`; species radio + photo upload; `pet-avatar.tsx` (photo via signed URL else initials + species icon, tokens only). Page resolves photo paths to signed URLs via service role. Updated all account nav links + DESIGN.md.
- [x] **RLS** verified via the existing account-actions integration suite (user2 sees 0 of user1's pets; species persisted). 403 tests green; migration applied via `db reset`.
- [x] **Gate + commit** `feat: generalize dogs to pets with species and photo upload`. Docs: DESIGN.md data model + routes.

**Verification:** local stack migration applies; existing dogs backfilled `species='dog'`; pgTAP green; `/account/pets` add/edit/delete + photo works; typecheck/lint/test green.

---

## Phase 21 — Busy data path + pet-assignment wiring — [x]

**Goal:** True availability via service-role busy sources (public identity-free + photos, admin enriched); bookings persist real pets. (Hooks moved to Phase 22, where the calendar consumes them — keeps this phase backend-only and green.)
**Files:** `src/features/booking/booking-repository.ts`, `src/features/booking/busy-ranges.ts` (new), `src/features/admin/admin-busy.ts` (new), `src/features/booking/booking-service.ts`, `booking-service.test.ts`, `busy-ranges.test.ts` (new).

- [x] **Repo methods.** `getActiveBusyRanges(now, concurrency)` → identity-free `BusyRange[]` (pet species + photo path, NO name/id); `getActiveBusyRangesEnriched(now)` → joined `bookings→profiles→booking_pets→pets` with name/status; `getPetsByIds(userId, petIds)` (client-filtered); `insertBookingPets(bookingIds, petIds)`. Zod-parse at edge.
- [x] **Public source.** `getPublicBusyRanges` action + DI core in `busy-ranges.ts`; service role; pet photos via short-lived `createSignedUrl`; `PublicBusyRange` type carries no identity (compile-time guarantee).
- [x] **Admin source.** `getAdminBusyRanges` action + core in `admin-busy.ts`, guarded by `assertActorIsAdmin`; adds client name + status.
- [x] **Pet-count derivation.** Added optional `petIds` to `createBookingInputSchema`; pet-aware services derive server-trusted `dogs`/`cats` from `getPetsByIds` (override client counts; reject unowned ids); `insertBookingPets` per occurrence after insert. Backward compatible — count-only submits still work. (Skipped snapshotting petIds into `quote_inputs` — booking_pets is the source of truth; avoids polluting the series re-quote path.)
- [x] **Tests.** `busy-ranges.test.ts` no-identity-leak regression + concurrency passthrough + photo signing; `booking-service.test.ts` pet-assignment (walk derives dog count overriding client; house-sitting derives dogs+cats; unowned ids rejected). 409 tests green.
- [x] **Hooks deferred to Phase 22.**
- [x] **Gate + commit** `feat: service-role busy ranges and real pet assignment on bookings`. Docs: DESIGN.md booking privacy.

---

## Phase 22 — Calendar component + customer flow — [x] `099ae43`

**Goal:** Calendar-first per-service booking; service chooser; deferred-auth gate.
**Files:** `components/ui/calendar.tsx` (new), `src/features/booking/_components/booking-calendar.tsx` + `week-grid.tsx` + `month-grid.tsx` (new), `app/(marketing)/book/page.tsx`, `app/(marketing)/book/[serviceSlug]/**` (new), delete `book-client.tsx`; `package.json` (+ `react-day-picker`, `date-fns`).

- [x] **Deps + primitive.** `react-day-picker@9` + `date-fns` added; hand-authored `components/ui/calendar.tsx` (rdp v9 wrapper, tokens + lucide chevron, no shadcn CLI). Added DST-correct `denverMidnight(dayKey)` (inverse of `denverDayKey`) + tests — the bridge from calendar days to Denver-midnight instants.
- [x] **BookingCalendar.** Mode-discriminated presentational component (`week-slots` | `month-range`) + `week-grid.tsx` / `month-grid.tsx` / shared `busy-pets.tsx`. week-slots groups `markSlotsBusy(deriveOpenSlots)` by Denver day; month-range wraps the primitive + `deriveBookableDays`/`validateStayRange`. Busy blocks show pet thumbnails, no name. New `use-busy-ranges.ts` (mount + realtime ping + interval + manual `refresh()`); `use-availability.ts` no longer queries `bookings`.
- [x] **Chooser + per-service route.** `/book` → service cards → `/book/[serviceSlug]`. `[serviceSlug]/page.tsx` loads service + settings + initial public busy + `authState` (+ pets when ready). Decomposed into `service-booking-client.tsx` (mode by `pricing_type`), `pet-assignment.tsx` (real pets by species + inline `PetForm` add), relocated `quote-panel.tsx`/`recurring-controls.tsx`/`quantity-forms.tsx` (dropped dog/cat count inputs — derived from assignment). Always sends `petIds` for pet-aware services.
- [x] **Deferred-auth gate.** Book action: `guest`→`/login?returnTo=…`, `needs-onboarding`→`/onboarding?returnTo=…`, `ready`→`createBooking`. Pure `return-to.ts` (`buildReturnTo`/`safeReturnTo`, open-redirect guard) + tests; rehydrated from query on the page; honored by `/login` + `completeOnboarding`. createBooking keeps its `redirect("/login")` backstop.
- [x] **Delete** old `book-client.tsx`.
- [x] **Gate + commit** `feat: calendar-first per-service booking flow with deferred-auth gate`. Docs: DESIGN.md routes + gate; FRONTEND.md calendar primitive + wireframe note. 418 tests green; typecheck + lint clean.

**Verification:** manual — `/book` cards → walk week grid + house-sitting month range; assign pets + inline add; logged-out Book → login → onboarding → returns to selection → books; typecheck/lint/test green.

---

## Phase 23 — Admin calendar + booking management — [x] `73f75f3`

**Goal:** Cal manages availability AND bookings on the shared calendar.
**Files:** `app/(admin)/admin/availability/page.tsx`, `_components/availability-client.tsx` (rebuild), `_components/busy-side-panel.tsx` (new), `src/features/booking/_components/manage-windows-grid.tsx` (new), `booking-calendar.tsx` (third union arm).

- [x] **Manage-windows calendar.** `BookingCalendar mode="manage-windows"` (new `manage-windows-grid.tsx`, presentational; caller owns server data + wires cores). Wireframe interaction: pick a day → inline Denver wall-time inputs → `createWindow`; per-window Resize → `trimWindow`; Block out → `deleteWindow` (confirm UX kept). Days with a window/booking are marked on the rdp month grid.
- [x] **Booking overlay + actions.** Enriched busy from `getAdminBusyRanges` (server-loaded); each day lists its bookings; selecting one opens `busy-side-panel.tsx` (client name + pet photos + status-gated actions: cancel `cancelBooking`; approve/decline `approveBooking`/`declineBooking` when `pending_approval`; `markNoShow` when `confirmed`). All reuse existing actions/cores.
- [x] **Refresh.** `page.tsx` server-loads windows (`listWindowsCore`) + enriched busy (`getAdminBusyRanges`) in parallel; client dispatches via `useTransition` and `router.refresh()` on success (no more `window.location.reload()`).
- [x] **Gate + commit** `feat: admin availability and booking management on shared calendar`. 418 tests green (UI wiring; cores already covered Phases 19–21), typecheck + lint clean. Docs: DESIGN.md admin route + notes.

**Verification:** manual — drag-create window; select a booking → cancel/approve/no-show; block-out on delete still cancels overlapping bookings; typecheck/lint/test green.
