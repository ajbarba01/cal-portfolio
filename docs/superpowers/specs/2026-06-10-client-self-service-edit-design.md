# Client Self-Service Edit — Design

_Status: approved for planning · 2026-06-10_

The second of four sub-projects in the booking-mutation overhaul. It builds the
**client-facing UI** that lets a signed-in client edit and reschedule their own
booking **without cancel + rebook**. It is UI + wiring on top of the already-built,
tested mutation spine — no new booking core logic.

The four-project decomposition (see
[booking-mutation-spine-design](2026-06-09-booking-mutation-spine-design.md)):

- **P1 — Spine.** Actor/policy context + `editBookingCore`. Done, verified.
- **This spec — Client self-service** edit/reschedule UI (consumes P1).
- **Admin create-on-behalf + edit** UI (consumes P1).
- **Admin payment admin** (price adjust + record offline payment).

## What P1 already provides (do not rebuild)

- Server action [`editBooking({ bookingId, patch })`](../../../src/features/booking/actions.ts)
  — resolves the actor's policy from the verified session role
  (`profiles.role`), never from the payload; clients get `CLIENT_POLICY`. Patch =
  `{ startsAt?, endsAt?, petIds?, quantities?, comments? }` (dates cross as
  `Date`).
- [`editBookingCore`](../../../src/features/booking/booking-service.ts) — merges
  the patch over the current shape, re-quotes via the shared
  `computeBookingArtifacts`, re-derives approval, validates the slot, detaches a
  series occurrence (D6), persists in place. Returns a discriminated
  `EditBookingResult` (`success{warnings}` | `not_found` | `forbidden` |
  `invalid_status` | `price_locked` | `blocked_debt` | `onboarding_incomplete` |
  `refuse` | `unavailable` | `slot_taken` | `validation_error` | `error`).
- Repository methods (`getBookingForEdit`, `updateBookingEdited`,
  `swapBookingPets`, `appendSeriesSkip`) and the `booking_series.skipped_starts`
  column. **No schema or repo additions in this sub-project.**

## Scope

**In:** an account route to edit one booking; a pure client-editability
predicate; a focused `EditBookingClient` orchestrator reusing the booking-flow
leaf components; a read-only `previewEdit` server action; a delta-aware quote
panel; the Edit affordance + locked-state treatment in the bookings table;
mapping `EditBookingResult` to UI; extraction of shared leaf components into
`features/booking`; pure unit tests.

**Out:** notifications on edit (folds into the upcoming notification system —
the action layer stays the seam); whole-series ("edit all future") editing;
service-swap (cancel + rebook); editing **paid** bookings (fully locked in this
UI — see D-Paid); reschedule-core unification / meet-greet migration and making
`editBookingCore` onboarding-aware (deferred to a later sub-project); all admin
surfaces; payment admin.

---

## Decisions (locked 2026-06-10 grill)

These honor and extend the P1 locked decisions D1–D6.

- **Q1 — One unified Edit surface.** A single **Edit** action opens one surface
  carrying time, pets, details, and comments with a live re-quote. "Reschedule"
  is just changing the time and leaving the rest. (Not two separate
  reschedule / edit flows.)
- **Q2 — Dedicated route.** The surface is its own page,
  `/account/bookings/[id]/edit`, reusing the book-flow's single-column layout
  (automatically mobile-correct, deep-linkable, refresh-safe). Not a modal or
  bottom sheet.
- **Q3 — Live preview, then confirm.** The quote updates live as the client
  edits, showing the new total and a signed delta vs. the prior `final_cents`;
  **Save** commits exactly what's shown. This requires a new read-only
  `previewEdit` action that reports the would-be outcome up front. The edit path
  never touches Stripe (D2); copy reads "no payment taken — settle the difference
  later."
- **Q4 — Show the lock + reason inline.** When a row is not client-editable, the
  Edit control is replaced by a `🔒` + one-line reason + a "contact Cal" link,
  inline in the row (touch-safe, no hover tooltips). History/terminal rows show
  no control. A silent missing button is rejected.
- **D-Paid — Paid bookings are fully locked in this UI.** If `paidCents > 0`, no
  edit is offered at all (same locked treatment as the cutoff). This simplifies
  the surface (no in-place "price fields locked" treatment needed) and means the
  client path never reaches the paid time-move case. The core's `price_locked`
  remains a server backstop; admin edit of paid bookings is a later sub-project.
- **Q5 — Meet-greet excluded; no core changes.** Meet-greet bookings are
  excluded from the client Edit UI (they keep onboarding's existing reschedule
  path — `MeetGreetScheduler` in reschedule mode). `rescheduleBookingCore` /
  `rescheduleBooking` are left untouched; `editBookingCore` is **not** made
  onboarding-aware here. The client edit path stays entirely on `editBooking`,
  never near the meet-greet gates.
- **Q6 — No notifications this sub-project.** Deferred to the upcoming
  notification system.
- **Q7 — Series occurrence note.** When the booking being edited has a
  `series_id`, the surface shows a one-line note: "This changes this visit only —
  your other recurring visits stay as they are." The D6 detach plumbing is
  unchanged. Whole-series editing stays out of scope.

---

## Architecture

### Approach (chosen)

**A separate, focused `EditBookingClient` that reuses extracted leaf
components** — not a generalized create+edit orchestrator.
[`ServiceBookingClient`](<../../../src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx>)
carries create-only concerns (deferred-auth gate, returnTo round-trip, recurring
controls); folding edit into it via mode flags yields a branchy mega-component.
The codebase already set the precedent the other way:
[`MeetGreetScheduler`](../../../src/features/accounts/_components/meet-greet-scheduler.tsx)
is a slim, separate orchestrator reusing the shared `<Scheduler>`. We follow
that — keep the leaf modules shared, write a focused edit orchestrator.

Rejected: generalizing `ServiceBookingClient` (tangled); a plain server-form post
with no live preview (contradicts Q3).

### 1 — Route and data loading (server)

New `src/app/(account)/account/bookings/[id]/edit/page.tsx` (server component):
authenticate; service-role read the booking scoped to
`client_id === user.id` (else redirect to `/account/bookings`); load service
detail, the client's pets, booking rule settings, and busy ranges (the same
inputs the book flow loads). If `clientCanEditBooking` is false, redirect back to
the list. Pass everything to `EditBookingClient`.

### 2 — Editability predicate (pure, tested)

```ts
clientCanEditBooking(booking, now, settings):
  | { editable: true }
  | { editable: false; reason: "paid" | "cutoff" | "status" | "meet_greet" | "terminal" }
```

One pure function in `features/booking`, used in **two** places — the bookings
table (which lock to render) and the route guard. Editable iff: upcoming;
`status ∈ { pending_approval, confirmed }`; `paidCents === 0`; `now` is outside
`cancellation_full_refund_hours` of `starts_at`; service slug ≠ `meet-greet`.
Each false case carries a reason that maps to inline copy.

### 3 — `EditBookingClient` (client orchestrator)

Seeds state from the existing booking: `selectedStart` from `starts_at`; pets
from the current assignment; `QuantityState` reverse-mapped from `quote_inputs`
via a new pure helper `quantityStateFromQuoteInputs` (the inverse of
`quantitiesToRecord`); comments. Reuses `<Scheduler>` with `initialSlot`
pre-seed (the MeetGreetScheduler pattern), `PetAssignment`, and `QuantityForm`.
Runs a debounced live `previewEdit` (mirroring the create flow's debounce). No
recurring controls (edits never create a series). Renders the Q7 series note when
`series_id` is set. **Save** calls `editBooking` with the assembled patch.

The patch only includes changed dimensions; an unchanged field is omitted so the
core's merge keeps the stored value.

### 4 — `previewEdit` server action (net-new)

A read-only twin of `editBooking` in the action layer: authenticate, derive the
actor's policy from the verified role, run the **same** ownership check + merge +
re-quote as `editBookingCore` but **do not persist**. Returns:

- the new `BookingQuotePreview` (itemized, same shape the create preview uses),
- the prior `final_cents` (so the UI computes the signed delta),
- the would-be outcome: a `price_locked` flag, the re-derived approval status
  (so the UI can warn "drops to pending approval"), and any gate block.

This keeps "what you see equals what Save does" literally true. It reuses
`computeBookingArtifacts` under `CLIENT_POLICY`; no separate computation path is
introduced.

### 5 — Delta quote panel

Extend [`QuotePanel`](<../../../src/app/(marketing)/book/[serviceSlug]/_components/quote-panel.tsx>)
(after the move in §8) with optional delta props, or add a thin `EditQuotePanel`
sibling — implementation choice deferred to the plan. It shows the **new total**,
a **signed delta** vs. prior `final_cents` (`+$3.00` / `−$5.00`), the "drops to
pending approval" notice when the re-derived status differs, and the
"no payment taken — settle later" copy. Reuses the existing receipt presentation.

### 6 — Bookings-table affordance

[`/account/bookings/page.tsx`](<../../../src/app/(account)/account/bookings/page.tsx>)
upcoming rows gain an Edit cell driven by `clientCanEditBooking`: an Edit link
when editable; an inline `🔒 + reason + contact-Cal` treatment when locked;
nothing for history/terminal rows. A small client island renders the
locked-reason cell; the page stays a server component. The `meet-greet` exclusion
and paid lock both flow from the predicate, so the table needs no special-casing
beyond rendering each reason's copy.

### 7 — Result handling

Map `EditBookingResult` → UI: `success` → toast + redirect to `/account/bookings`
(refresh the list); `unavailable` / `slot_taken` / `validation_error` → inline
message on the surface (the selection may need changing); `price_locked` /
`forbidden` / `invalid_status` / `blocked_debt` / `onboarding_incomplete` are not
reachable from the gated UI but get safe fallback copy rather than a crash.

### 8 — Modularization (same-commit doc rule)

Move `PetAssignment`, `QuantityForm` (+ its state/helper exports), and
`QuotePanel` from `src/app/(marketing)/book/[serviceSlug]/_components/` to
`src/features/booking/_components/` so both the book route and the new account
route consume one copy. Update both import sites and the relevant
[DESIGN.md](../../DESIGN.md) layout notes in the same commit. `<Scheduler>` is
already shared.

### 9 — Mobile parity (hard rule)

The route is a single column reusing the book-flow's already-mobile-correct
layout; `<Scheduler>`, the pet grid, and the quote panel are already responsive.
Locked-row reasons wrap cleanly with no tooltips. Mobile parity is treated as a
first-class acceptance criterion, verified on the edit surface and the table,
not an afterthought.

---

## Data / schema

**No changes.** All reads use existing columns and P1's repo methods. No
migrations. `previewEdit` is read-only.

## Testing

Pure, DI-driven unit tests (no Next.js, no live Supabase):

- `clientCanEditBooking` — each reason branch (`paid`, `cutoff`, `status`,
  `meet_greet`, `terminal`) and the editable case, including the cutoff boundary.
- `quantityStateFromQuoteInputs` — round-trips with `quantitiesToRecord` across
  every pricing type.
- `previewEdit` is exercised through `editBookingCore`'s existing edit tests (it
  shares the merge + re-quote pipeline); add a focused test only if the
  action-layer delta/outcome assembly carries logic beyond the core.

No new integration tests — no new repo methods or schema. Manual verification
covers the route, the live preview, the delta, the locked rows, and mobile.

## Risks / notes

- **Component move blast radius.** Relocating the three leaf components touches
  the book route's imports. Mitigation: pure move (no behavior change) + the book
  flow's existing tests stay green; same-commit doc update.
- **Preview/commit drift.** `previewEdit` and `editBooking` must run the same
  merge + re-quote. Mitigation: both delegate to the shared pipeline
  (`computeBookingArtifacts` / the core's merge), never a parallel computation.
- **Reverse quantity mapping.** `quantityStateFromQuoteInputs` must invert
  `quantitiesToRecord` exactly or the seeded form drifts from the stored quote.
  Mitigation: round-trip unit tests across all pricing types.

---

_Last reviewed: 2026-06-10_
