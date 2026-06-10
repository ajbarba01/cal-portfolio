# Booking-Mutation Spine — Design

_Status: approved for planning · 2026-06-09_

The first of four sub-projects toward letting **Cal manage bookings on behalf of
clients** (create / edit / payment admin) and letting **clients edit and
reschedule their own bookings without cancel + rebook**. This sub-project builds
only the **shared mutation spine** — an actor-aware, policy-parameterized core
plus a new `editBookingCore`. **No UI ships here.**

The four-project decomposition:

- **P1 (this spec) — Spine.** Actor/policy context + `editBookingCore`. Refactor,
  no UI. Foundation for the rest.
- **P2 — Client self-service** edit/reschedule UI (consumes P1).
- **P3 — Admin create-on-behalf + edit** UI (consumes P1).
- **P4 — Admin payment admin** (price adjust + record offline payment).

P2–P4 get their own spec → plan → build cycles.

## Scope

**In:** a new `editBookingCore` (in-place edit of an existing booking); a
`MutationPolicy` object threaded through the existing
[`computeBookingArtifacts`](../../../src/features/booking/booking-service.ts)
pipeline so each gate can be enforced (client) or downgraded to a warning
(admin); the series **EXDATE skip-set** fix (a `booking_series.skipped_starts`
column + cron change) that makes occurrence edits safe and retro-fixes a latent
duplicate bug in today's reschedule; repository additions for the edit path;
pure unit tests for all of the above.

**Out:** any client or admin UI; a client picker; payment writes / "mark paid"
(P4); notifications on edit (a P2/P3 action-layer concern); whole-series edits;
service-swap (that remains a cancel + rebook); multi-provider concerns.

---

## Background — what already exists

- [`createBookingCore`](../../../src/features/booking/booking-service.ts) already
  takes `userId` explicitly and runs under the service role with an injected
  repo (DI). [`computeBookingArtifacts`](../../../src/features/booking/booking-service.ts)
  is the single shared quote + gate pipeline (debt gate, onboarding/meet-greet
  gate, distance, time-horizon, window-fit, hours-of-day / lead-time guards).
- [`rescheduleBookingCore`](../../../src/features/booking/booking-service.ts)
  already moves a booking in place, **preserving duration / status / price**, and
  re-validates the new slot. It is consumed by the onboarding meet-greet flow.
- The [booking state machine](../../../src/features/booking/state-machine.ts) is a
  pure total function; the [series-roll cron](../../../src/features/booking/series-cron.ts)
  materializes / promotes occurrences via the pure predicate
  `nextOccurrencesToMaterialize`.
- Money: `final_cents` is the booking total; `payment_status` is a **derived
  projection** whose **sole writer is the Stripe webhook**. Prepay is
  full-amount-or-nothing, so `paidCents` is either `0` or `final_cents`.

These are the seams P1 extends. The work is mostly **parameterization + one new
core**, not new infrastructure.

---

## Decisions (locked 2026-06-09)

### D1 — Editable dimensions

In-place edit may change: **start time, assigned pets, quantities / add-ons,
details (comments)**. **Service-swap is not editable** — changing the service
(and therefore pricing type, concurrency, form) is a cancel + rebook.

### D2 — Money: lock price once paid

- **Unpaid booking** (`paidCents === 0`): all four dimensions editable.
  Pet/quantity changes **re-quote** and overwrite `final_cents` /
  `quote_inputs` / `quote_breakdown`.
- **Paid booking** (`paidCents > 0`): only **non-price-affecting** edits — a time
  move (price-preserving by the pricing model: price depends on quantities ×
  config + travel + discounts, never on the calendar date; holiday is an explicit
  quantity, not derived from the moved date) and comments. A price-affecting patch
  on a paid booking is rejected (`price_locked`); Cal settles such changes off the
  books or via cancel + rebook.
- **The edit path never touches Stripe.** No charge, no refund. This preserves the
  single-writer rule and keeps edits side-effect-free.

### D3 — Re-derive approval per edit

Every edit recomputes `requires_approval` from the new shape and runs the state
machine. A `confirmed` booking whose new shape would require review drops to
`pending_approval` (keeping "confirmed = Cal-vetted" true). Admin may
`forceStatus` to confirm without re-pending (D5).

### D4 — Client scope = full parity, gated

A client may edit **all four dimensions** on their **own unpaid** booking. Client
edits are subject to the full gate set: outside the cancellation cutoff (below),
lead-time / hours / horizon / window-fit on the new slot, the debt gate, and
re-derived approval.

**Cancellation-cutoff edit gate (client only).** A client may not self-edit or
reschedule once `now` is inside `cancellation_full_refund_hours` (~48 h) of the
booking's **current** start — otherwise rescheduling would be a way to dodge the
late-cancel fee. Admin overrides this (D5).

### D5 — Admin = full override, warn-don't-block

When Cal acts on behalf, she bypasses **all policy gates**: debt-block,
onboarding/meet-greet, distance hard-cutoff, availability-window-fit,
hours-of-day + lead-time, the cancellation-cutoff gate, and the time-horizon
refuse. She may also `forceStatus` (e.g. force-confirm). The **only** hard stop is
the Postgres same-class **no-overlap exclusion constraint** (physical
double-booking), surfaced as `slot_taken`.

Overrides are **warn-don't-block**: when an admin skip suppresses a gate that
would otherwise have blocked, the core appends a human string to a returned
`warnings: string[]` (e.g. `"client owes $40.00"`, `"outside any availability
window"`, `"client is 62 mi away (beyond 50 mi cutoff)"`). The admin UI (P3)
renders these; the core never blocks on them.

### D6 — Series edits: EXDATE skip-set + detach

The series-roll cron refills any **future** cadence slot not currently occupied by
a series-linked booking start. Its dedup key is effectively
`(series_id, starts_at)`. Therefore **changing `starts_at` or nulling `series_id`
erases a slot's claim and the cron re-creates a duplicate** at the original
cadence time. This bug exists today for a plain reschedule of a future series
occurrence (it keeps `series_id` and only moves the time); it has not surfaced
only because no UI invokes it yet. A cancel is safe because the cancelled row
keeps both `series_id` and its original `starts_at`, so its slot stays claimed.

**Fix (RFC 5545 EXDATE pattern):**

- Add `booking_series.skipped_starts timestamptz[] NOT NULL DEFAULT '{}'`.
- **Any** edit of a series occurrence (time **or** pets/quantities) **detaches**
  it: set `series_id → null` on the row and push its **pre-edit `starts_at`** into
  the parent series' `skipped_starts`. The detached row becomes a standalone,
  independently editable booking.
- The pure `nextOccurrencesToMaterialize` unions `skipped_starts` into its
  exclusion set, so the vacated slot is never refilled.

This rests on an invariant we can guarantee: **a row with `series_id` set always
sits on an exact cadence slot** — the cron only materializes on-cadence and any
edit detaches — so the pre-detach `starts_at` is unambiguously the slot to skip.
The same change retro-fixes the latent reschedule duplicate.

---

## Architecture

### Approach (chosen)

**Shared policy object + distinct intent cores.** Keep focused, independently
testable cores — `createBookingCore`, the new `editBookingCore`,
`rescheduleBookingCore`, `cancelBookingCore` — and thread one `MutationPolicy`
through the shared `computeBookingArtifacts`. This fits the codebase's existing
"pure cores + DI repo + thin `"use server"` actions" structure with minimal
churn, and every gate decision stays unit-testable.

Rejected: a single `mutateBooking(actor, intent, payload)` mega-function (branchy,
hard to test); a composable gate-middleware list (over-engineered for ~6 gates —
YAGNI).

### `MutationPolicy`

```ts
interface MutationPolicy {
  skipDebtGate: boolean;
  skipOnboardingGate: boolean;
  skipDistanceRefuse: boolean;
  skipWindowFit: boolean;
  skipHoursLeadGuards: boolean;
  skipCancellationCutoff: boolean;
  skipHorizonRefuse: boolean;
  forceStatus?: BookingStatusDb; // admin force-confirm, etc.
}
```

- `CLIENT_POLICY` — every skip `false`; the cancellation-cutoff gate is enforced.
- `ADMIN_POLICY` — every skip `true`; `forceStatus` optional.

`computeBookingArtifacts` is refactored so its current **hard** `blocked_debt` /
`onboarding_incomplete` (and distance/horizon refuse, window-fit, guard) outcomes
become **policy-driven**: a blocked gate returns the block result under a
client policy, or is downgraded to a `warnings` entry under an admin policy.

**Security seam:** the actor → policy mapping lives **only** in the action layer
([`actions.ts`](../../../src/features/booking/actions.ts)), derived from the
verified session role (`profiles.role`), never from the request payload. A client
can never submit `ADMIN_POLICY`. This mirrors the existing admin-cancel bypass.

### `editBookingCore`

```ts
editBookingCore(deps, {
  bookingId: string;
  actorUserId: string;       // verified session id (ownership check unless admin policy)
  policy: MutationPolicy;
  patch: {                   // every field optional; only provided fields change
    startsAt?: Date;
    petIds?: string[];
    quantities?: Record<string, unknown>;
    comments?: string;
  };
}): Promise<EditBookingResult>
```

Pipeline:

1. **Load** the booking's full edit shape (current service, times, status,
   series_id, quote inputs, comments) + payments. `not_found`; `forbidden` when
   the policy enforces ownership and `client_id !== actorUserId`.
2. **Status guard** — only `pending_approval | confirmed` are editable;
   terminal/completed → `invalid_status`.
3. **Paid-lock (D2)** — if `paidCents > 0` and the patch touches a price-affecting
   field → `price_locked`.
4. **Merge + re-quote (D2)** — merge the patch over the current shape; for an
   unpaid price-affecting change, rerun `computeBookingArtifacts` (same pipeline as
   create → no drift) to produce new `quote_inputs` / `quote_breakdown` /
   `final_cents` and the per-gate outcome under `policy`.
5. **Re-derive approval (D3)** — recompute `requires_approval`; run the state
   machine to the resulting status (honoring `policy.forceStatus`).
6. **Slot validation** — if `startsAt` changed, apply lead-time / hours / horizon /
   window-fit subject to policy skips; emit warnings for admin-skipped gates.
7. **Series detach (D6)** — if `series_id` was set, null it on the row and append
   the pre-edit `starts_at` to the parent series' `skipped_starts`.
8. **Persist** — UPDATE the row (times / status / quote / final_cents / comments)
   and swap `booking_pets` (delete + reinsert) under the service role. Catch
   Postgres `23P01` → `slot_taken`. Return `success { warnings }`.

`rescheduleBookingCore` is retained as the **time-only, price-preserving** special
case for the onboarding meet-greet consumer. Implementation choice deferred to the
plan: **prefer** reimplementing it as `editBookingCore` with a `startsAt`-only
patch (so the series-skip fix lives in exactly one place), provided the onboarding
consumer's result handling stays compatible.

### Result model

Discriminated union, no throwing across the boundary (mirrors the existing cores):

```
EditBookingResult =
  | { kind: "success"; warnings: string[] }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "slot_taken" }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string }
```

---

## Data / schema

- **New column:** `booking_series.skipped_starts timestamptz[] NOT NULL DEFAULT
'{}'` (migration). Update the row schema + `BookingSeriesRow` / repo reads.
- **No change** to `bookings` (times / status / quote / final_cents / comments are
  existing columns), `booking_pets` (swap = delete + reinsert), or `payments`
  (read-only in P1).
- **Repository additions** (interface + Supabase impl):
  - `getBookingForEdit(id)` — full edit shape + payments + series_id.
  - `updateBookingEdited(id, fields)` — times / status / quote / final_cents /
    comments in one UPDATE; propagates `23P01`.
  - `swapBookingPets(bookingId, petIds)` — delete then reinsert join rows.
  - `appendSeriesSkip(seriesId, start)` — push onto `skipped_starts`.

The **same-commit doc rule** applies: the schema/route facts land in
[DESIGN.md](../../DESIGN.md) (data model + booking state machine notes) in the
implementing commits.

---

## Testing

Pure, DI-driven unit tests (no Next.js, no live Supabase):

- `editBookingCore`: paid-lock rejection; unpaid re-quote correctness; approval
  re-derivation flip (`confirmed → pending_approval`); each gate under
  `CLIENT_POLICY` (blocks) vs `ADMIN_POLICY` (warns, with the expected `warnings`
  entry); ownership `forbidden`; `invalid_status`; series detach writes the skip +
  nulls `series_id`; `23P01 → slot_taken`.
- `nextOccurrencesToMaterialize`: a regression test reproducing the duplicate
  (moved future occurrence) that fails before the skip-set and passes after;
  `skipped_starts` excluded from materialization.
- `rescheduleBookingCore`: existing tests stay green (its public contract is
  unchanged whether or not it delegates internally).

---

## Risks / notes

- **Refactor blast radius.** Threading `MutationPolicy` through
  `computeBookingArtifacts` touches `createBookingCore`'s call site. Mitigation:
  `createBookingCore` passes `CLIENT_POLICY` (its current behavior is the
  client-policy behavior), so create semantics are unchanged and covered by
  existing tests.
- **`booking_pets` swap atomicity.** Delete-then-reinsert should run so a failure
  can't leave a booking petless; the plan specifies the ordering / transaction
  approach against Supabase's capabilities.
- **`skipped_starts` growth.** A `timestamptz[]` is fine for the expected handful
  of exceptions per series; normalizing to a child table is a later option with no
  behavior change.

---

_Last reviewed: 2026-06-09_
