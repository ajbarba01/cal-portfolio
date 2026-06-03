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

## Phase 19 — Pure calendar foundations — [x]

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

## Phase 20 — Pets generalization (dogs→pets + species + photos) — [ ]

**Goal:** Real assignable pet records with species + photo upload; app stays green (booking still posts counts).
**Files:** `supabase/migrations/<ts>_pets_generalization.sql` (new), `src/features/accounts/account-actions.ts`, `app/(account)/account/pets/**` (moved from `dogs`), `src/features/booking/_components/pet-avatar.tsx` (new), every `/account/dogs` link.

- [ ] **Migration.** `pet_species` enum; `alter table dogs rename to pets`; add `species pet_species not null default 'dog'`; recreate the 5 RLS policies under `pets:` names; `booking_pets` join table (`booking_id`→bookings cascade, `pet_id`→pets restrict, PK both) + RLS; private `pet-photos` storage bucket + write policy keyed on `auth.uid()`.
- [ ] **Actions.** `from("dogs")`→`from("pets")`; `dogSchema`+`species`; `createDog/updateDog/deleteDog`→`createPet/updatePet/deletePet`; add `uploadPetPhoto` (session client, RLS; writes object then updates `pets.photo_url` with the path).
- [ ] **Route + UI.** Move `account/dogs`→`account/pets`; `dogs-client.tsx`→`pets-client.tsx`; extract shared `PetForm`; species selector + photo upload field; `pet-avatar.tsx` (photo via signed URL else initials + species icon, tokens only). Update every `/account/dogs` link in the same commit.
- [ ] **pgTAP** for `pets`/`booking_pets` RLS + bucket policy.
- [ ] **Gate + commit** `feat: generalize dogs to pets with species and photo upload`. Docs: DESIGN.md data model + routes.

**Verification:** local stack migration applies; existing dogs backfilled `species='dog'`; pgTAP green; `/account/pets` add/edit/delete + photo works; typecheck/lint/test green.

---

## Phase 21 — Busy data path + pet-assignment wiring — [ ]

**Goal:** True availability via service-role busy sources (public opaque + photos, admin enriched); bookings persist real pets.
**Files:** `src/features/booking/booking-repository.ts`, `src/features/booking/busy-ranges.ts` (new), `src/features/admin/admin-busy.ts` (new), `src/features/booking/use-busy-ranges.ts` (new), `src/features/booking/booking-service.ts`, `actions.ts` schema.

- [ ] **Repo methods.** `getActiveBusyRanges(now, concurrency)` → identity-free `TimeRange[]` (+ pet thumbnails: species + photo path, NO name/id); `getActiveBusyRangesEnriched(now)` → joined `bookings→profiles→booking_pets→pets` with name/status; `getPetsByIds(userId, petIds)`; `insertBookingPets(bookingIds, petIds)`. Zod-parse at edge.
- [ ] **Public source.** `getPublicBusyRanges` action + DI core in `busy-ranges.ts`; service role; pet photos via short-lived `createSignedUrl`; result type carries no identity (compile-time).
- [ ] **Admin source.** `getAdminBusyRanges` action + core in `admin-busy.ts`, guarded by `assertActorIsAdmin`; adds client name + status for the action menu.
- [ ] **Hook.** `use-busy-ranges.ts`: realtime ping → refetch via action; interval fallback; manual `refresh()`. Refactor `use-availability.ts` to stop querying `bookings` directly (remove limitation comment).
- [ ] **Pet-count derivation.** Add optional `petIds: string[]` to `createBookingInputSchema`; for pet-aware services derive server-trusted `dogs`/`cats` counts from `getPetsByIds` (override client counts); validate (house_sitting ≥1 pet, walk ≥1 dog); snapshot `petIds` into `quote_inputs`; after `insertBookings` call `insertBookingPets` per occurrence.
- [ ] **Tests.** Count-derivation via mock repo; `getPublicBusyRangesCore` no-identity-leak regression; concurrency-class filtering.
- [ ] **Gate + commit** `feat: service-role busy ranges and real pet assignment on bookings`. Docs: DESIGN.md booking-creation + privacy; ENGINEERING.md two-trust busy pattern.

**Verification:** unit tests green incl. leak regression; a second user's booking shows busy to others; typecheck/lint green.

---

## Phase 22 — Calendar component + customer flow — [ ]

**Goal:** Calendar-first per-service booking; service chooser; deferred-auth gate.
**Files:** `components/ui/calendar.tsx` (new), `src/features/booking/_components/booking-calendar.tsx` + `week-grid.tsx` + `month-grid.tsx` (new), `app/(marketing)/book/page.tsx`, `app/(marketing)/book/[serviceSlug]/**` (new), delete `book-client.tsx`; `package.json` (+ `react-day-picker`, `date-fns`).

- [ ] **Deps + primitive.** Add `react-day-picker@9` + `date-fns`; hand-author `components/ui/calendar.tsx` (rdp wrapper, tokens only).
- [ ] **BookingCalendar.** Mode-discriminated presentational component: `week-slots` (feeds `deriveOpenSlots` + `markSlotsBusy`), `month-range` (wraps calendar primitive + `deriveBookableDays`/`validateStayRange`). Busy blocks show pet thumbnails (no name).
- [ ] **Chooser + per-service route.** `/book` → service cards → `/book/[serviceSlug]`. New `[serviceSlug]/page.tsx` server loads service + settings + initial public busy + `authState`. Decompose into `service-booking-client.tsx` (mode by `pricing_type`), `pet-assignment.tsx` (real pets filtered by species + inline add via shared `PetForm` dialog), relocated `quote-panel.tsx`/`recurring-controls.tsx`/`quantity-forms.tsx`.
- [ ] **Deferred-auth gate.** Book action: `guest`→`/login?returnTo=…`, `needs-onboarding`→`/onboarding?returnTo=…`, `ready`→`createBooking`. `returnTo` encodes selection, validated same-origin under `/book/`; rehydrate on return; honored by `/login` + `/onboarding`.
- [ ] **Delete** old `book-client.tsx`.
- [ ] **Gate + commit** `feat: calendar-first per-service booking flow with deferred-auth gate`. Docs: DESIGN.md routes + gate; FRONTEND.md calendar primitive + wireframe note.

**Verification:** manual — `/book` cards → walk week grid + house-sitting month range; assign pets + inline add; logged-out Book → login → onboarding → returns to selection → books; typecheck/lint/test green.

---

## Phase 23 — Admin calendar + booking management — [ ]

**Goal:** Cal manages availability AND bookings on the shared calendar.
**Files:** `app/(admin)/admin/availability/page.tsx`, `_components/availability-client.tsx` (rebuild), `busy-side-panel.tsx` (new).

- [ ] **Manage-windows calendar.** Replace datetime-local form with `BookingCalendar mode="manage-windows"`: drag-create → `createWindow`; resize → `trimWindow`; delete → `deleteWindow` (block-out preserved; keep confirm UX).
- [ ] **Booking overlay + actions.** Enriched busy from `getAdminBusyRanges`; select a booking → `busy-side-panel.tsx` (client + pet photos + actions: cancel `cancelBooking`; approve/decline `approveBookingCore`/`declineBookingCore` when pending; mark no-show via state-machine transition). Reuse existing cores.
- [ ] **Refresh.** Page server-loads windows + enriched busy; `router.refresh()` after mutations (replace `window.location.reload()`).
- [ ] **Gate + commit** `feat: admin availability and booking management on shared calendar`. Docs: DESIGN.md admin.

**Verification:** manual — drag-create window; select a booking → cancel/approve/no-show; block-out on delete still cancels overlapping bookings; typecheck/lint/test green.
