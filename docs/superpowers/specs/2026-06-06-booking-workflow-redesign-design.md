# Booking Workflow Redesign (design)

> Supersedes the **booking** portions of
> `2026-06-06-design-overhaul-phase3-account-booking-design.md` (§A Scheduler, §B
> booking layout, §F receipt). The account/auth portions of that spec (§C, §D,
> profile/pets/forms/bookings/onboarding/login/signup) are **unaffected** and
> still to be built. Owns the **what + why**; the plan owns the how.

## Why this exists

Phase 3 was scoped as a Layer-3 (classNames-only) restyle of the booking surfaces.
Reviewing the built result, Cal/Alex wants a deeper rework of the booking
**interaction**, not just its paint. This is a deliberate, authorized departure
from the "Scheduler Layers 1–2 are off-limits" contract: **we now modify the pure
selection model + hook (Layers 1–2), updating their tests via TDD.** Everything
else in the project's constitution still holds (token law, a11y floor, mobile
parity, `<Link>`-only nav, TS strict, subject-line commits, no push).

## Goals (the nine feedback points, resolved)

1. **Spacing/alignment audit (#1).** No ad-hoc spacing — center the month in its
   container, fix house-sitting details alignment, and give the booking column one
   consistent vertical rhythm from the `space.*` scale.
2. **Live receipt (#2).** The quote receipt **auto-recomputes** (debounced) on every
   change to day/time/pets/quantities. **Remove the "Get quote" button.** `previewQuote`
   is a public server preview needing no auth, so guests see live pricing too; only
   **Book** hits the deferred-auth gate (gate logic unchanged).
3. **Month → day → time flow (#3).** For the **hourly** services (walk / check-in /
   training): pick a day on the month calendar, then a **single-day timeline** opens
   (stacked below the month) to pick the start time. **House-sitting is unchanged** —
   it stays the month **range** picker (check-in → check-out nights), having no
   time-of-day. The month is the day-picker for hourly; the range-picker for
   house-sitting.
4. **Professional inputs (#4).** Replace native `<input type=number>` spinners with a
   kit **`NumberStepper`** (− / value+unit / +, comfortably tall ~44–46px targets).
   Sanitized: no leading zeros, clamp to `min`/`max`, snap to `step`, empty → `min`
   on blur. Used by the booking quantity fields (and reusable by admin later).
5. **Month styling (#5).** Single panel (no second white box) — the **legend** and the
   **"N nights · Clear dates"** summary sit on the page, not in a card. Days stay
   **slightly gapped**; **each selected day carries its own individual thick clay
   (`--brand`) outline — NO run-merge** (the simplest reading; avoids cross-gap seam
   artifacts). Status fill (green available / gray unavailable) stays per-cell and
   shows through. A **clay dot** marks days where the client already has a booking
   (each recurring occurrence included) → makes a recurring series visible across the
   month. **Starting a new range drag clears the previous selection first** (a Layer-2
   behavior change for the house-sitting range path).
6. **Duration-accurate time selection (#6).** On the single-day timeline, the
   selectable unit is a block whose **height = the service's real duration** (e.g. a
   1.25h walk = a 1.25h-tall block), placed at any valid start inside Cal's open
   window (shaded), draggable, or set by **typing a start time**. The user cannot
   over/under-select — the block length is the service duration. This replaces the
   old "paint any block" week-grid interaction for booking.
7. **Layout (#7).** Desktop: left column stacks the steps (month → day timeline →
   pets → details); right **rail holds the live receipt, sticky and vertically
   centered** to the viewport (falls back to top-aligned scroll if the receipt +
   Book exceeds viewport height, so nothing clips). Mobile: the receipt collapses to
   a **pinned bottom bar** (total + Book, safe-area aware).
8. **Pet selection (#8).** Replace the small chips with bigger, responsive **cards**
   (avatar + name + breed + a clear check indicator); selected = clay
   (`border-brand` + `bg-brand/10` + `text-brand-strong`); ≥44px targets.
9. **Aesthetic (#9).** Target the cleaner "mockup-B" reading throughout (calendar
   density, details layout, pet cards); keep the **side-notch receipt** ticket.

## Architecture impact (Scheduler Layers 1–2 — the real work)

The current Scheduler has two booking modes: `month-range` (house-sitting) and
`week-slots` (a 7-day intraday grid, single-cell fixed-interval pick). This redesign
**replaces the hourly `week-slots` grid with a month-day-pick + single-day duration
timeline**, and changes the range path's drag semantics.

- **Layer 2 — selection model (`schedule-selection.ts`, `use-schedule-selection.ts`):**
  - Add a **duration-aware single-day time selection**: the hourly selection becomes
    "a day + a start minute," with the booked end derived as `start + serviceDuration`.
    The model validates the block fits inside an open window and doesn't overlap busy.
  - The day-pick (month) selects exactly one day for hourly (single-day mode), then
    the time selection scopes to that day.
  - **Range drag-reset:** starting a new range drag clears the prior `selectedDays`
    before extending (house-sitting), so a mis-pick is replaced, not grown.
  - The merged-run **selection** outline is no longer used (per #5 individual
    outlines); the pure run utilities (`grid-runs.ts`) may remain for fill grouping if
    still useful, but the selection-outline path is simplified. Any model/behavior
    change is **covered by updated/added unit tests (TDD)** — the pure functions keep
    full coverage; no IO enters Layer 2.
- **Layer 3 — components:**
  - **New** `DayTimeline` part (single-day vertical timeline; shaded open windows;
    duration-height selection block; drag + type-a-start-time). Replaces `WeekGrid`
    for the booking (hourly) context. `WeekGrid` remains for admin until Phase 4 (or
    is retired there).
  - `MonthGrid` gains the **day-pick (single)** role for hourly and the
    your-booking **dot** marker; selection rendered as **individual** clay outlines.
  - `Legend` / selection summary move **out of the panel** onto the page.
- **Layer 1 — data/server:** the existing `previewQuote` / `createBooking` /
  availability sources are reused. Live quote = debounced `previewQuote` calls from
  the client on selection change (no server change). No DB/schema change. The
  deferred-auth gate + `returnTo` round-trip + `createBooking` backstop are
  **unchanged**.

> **Note on a service's duration:** taken from `service.defaultDurationMin` (already
> threaded into the booking client). The day timeline's slot granularity (e.g. 15-min
> start increments) is a presentation constant; start times snap to it.

## New/changed units

- `src/components/ui/number-stepper.tsx` (**new**) — controlled `{ value, onChange, min?, max?, step?, unit?, ariaLabel }`; sanitized + clamped; ~44px tall; accessible (buttons + a text input that reflects/sanitizes). Pure-ish; logic (clamp/sanitize/step) extracted to a tested helper `src/lib/number-input.ts`.
- `src/lib/number-input.ts` + test (**new**) — `clampToStep(raw, {min,max,step})` etc., TDD.
- Scheduler: new `DayTimeline` Layer-3 part + a duration-aware selection in Layer 2 (with tests); `MonthGrid`/`Legend` adjustments; individual selection outline.
- `service-booking-client.tsx` — recompose to stacked steps + sticky-centered receipt rail + mobile bottom bar; live (debounced) quote; remove Get-quote button; wire the new hourly flow vs. house-sitting range.
- `pet-assignment.tsx` — card selection.
- `quantity-forms.tsx` — use `NumberStepper`.
- `quote-panel.tsx` — keep the receipt (already shipped); ensure it's the live rail content.

## Mobile parity (per surface, build gate)

- Hourly: month then day-timeline stack full-width; the timeline scrolls within its
  own container (no page h-scroll); duration block draggable by touch; start-time
  input usable; receipt → pinned bottom bar (total + Book, safe-area).
- House-sitting: month range full-width; legend/summary on page; bottom bar.
- Pet cards wrap to full width ≥44px; NumberStepper ± are ≥44px touch targets.

## Out of scope / unchanged

- Account + auth surfaces (separate, already-queued tasks).
- Pricing math, booking state machine, RLS, DB schema, the deferred-auth gate logic,
  `returnTo` handling, `createBooking` backstop.
- Admin Scheduler surfaces (Phase 4) — `DayPanel`/`WeekActions`/admin `WeekGrid` keep
  their current behavior; this redesign touches the **booking** context. Where the
  hourly booking stops using `WeekGrid`, that admin component is left intact.

## Verification

- TDD for all Layer-2 model changes + the number-input helper; existing pure
  scheduler tests updated to match new selection semantics, kept green.
- `npm run lint && npm run typecheck && npm run build && npm test` green (page count
  unchanged; the `payments.test.ts` flake is environmental — verify in isolation).
- Live ≤390px + keyboard-a11y walk of `/book/[serviceSlug]` for an hourly service
  AND house-sitting: day-pick → duration block (drag + type), live receipt updates,
  sticky-centered rail on desktop, pinned bottom bar on mobile, individual clay
  outlines, your-booking dots, Clear-dates, no page h-scroll, light + dark, visible
  focus + keyboard operability of the timeline and stepper.

## Docs to update (same-commit rule)

- **FRONTEND.md:** the Scheduler now has a **booking day-timeline** (duration-height
  selection) distinct from the admin week-grid; selection = **individual clay
  outline** (no merge) with the **your-booking dot**; the live-receipt sticky-centered
  rail + mobile bottom-bar booking layout; the new `NumberStepper` kit component.
- **DESIGN.md:** the booking flow description (month→day→time for hourly; range for
  house-sitting; live quote; gate unchanged).

---

_Last reviewed: 2026-06-06_
