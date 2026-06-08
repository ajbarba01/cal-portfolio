# Meet & Greet Onboarding Gate — Design

_Status: approved for planning · 2026-06-08_

## Problem

Onboarding today is a single boolean `profiles.onboarding_complete`, flipped to
`true` the moment a new client finishes the profile + emergency form
(`runOnboarding`). The middleware gate confines un-onboarded users to
`/onboarding`; the book page and admin clients views read the same flag.

Cal wants a required **in-person meet-and-greet** between "client finished the
intro forms" and "client may book paid services." The meet-and-greet is a free
service the client schedules like any other, Cal attends in person, and only
then does Cal manually approve the client for full booking.

This breaks the binary into stages and introduces a **client-level approval**
that is distinct from the existing **per-booking approval**.

## Scope

**In:** the onboarding state model, the meet-and-greet service, the booking
gate that restricts a mid-onboarding client to only the meet-and-greet, the
stateful `/onboarding` wizard, and the admin approve/decline control.

**Out (separate spec):** admin-created bookings on behalf of a client. It shares
only a "create a booking as client X" primitive and will be specced after this.

## Decisions (resolved with Cal/Alex)

- **Failed meet-and-greet:** explicit `declined` state, reversible.
- **Meet-and-greet booking:** auto-confirms in range; only the existing
  distance/horizon gate can force per-booking manual review. Cal approves the
  **client** once (after the visit), not the booking too.
- **Approve timing:** Cal may approve any time. A UX confirm warns when
  approving before the meet-and-greet's scheduled `starts_at` has passed.
- **Admin override:** Cal may set `onboarding_status` to **any** value at **any**
  time, overriding whatever was set before (approve a declined client, revoke an
  approved one, reset to `meet_greet_pending`). No server-side transition
  restriction — this is Cal's judgment call.
- **Admin manual booking:** separate spec, this feature first.

## State model

New column `profiles.onboarding_status`, a closed enum (Postgres enum or
`text` + `CHECK`), replacing `onboarding_complete`:

| Value                | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| `info_pending`       | Intro forms not done (default for new signups)    |
| `meet_greet_pending` | Forms done; must book + attend the meet-and-greet |
| `approved`           | Cal met them in person; full booking unlocked     |
| `declined`           | Cal declined to take the client on (reversible)   |

`onboarding_complete` is **dropped** — single source of truth (AGENTS.md rule).
"Onboarded / may book paid services" is defined everywhere as
`onboarding_status = 'approved'`.

**Migration:**

- Add `onboarding_status`; backfill `onboarding_complete = true → 'approved'`,
  `false → 'info_pending'`. Existing onboarded clients become `approved` and
  **never get re-gated** through a meet-and-greet.
- Default for the column / `handle_new_user` trigger: `info_pending`.
- Drop `onboarding_complete` after all readers migrate (same commit set).
- Keep the existing column-grant guard: `onboarding_status` is
  system/admin-set, **never client-writable** (a client must not self-approve).

**Transitions:**

- `info_pending → meet_greet_pending`: `runOnboarding` finish (forms saved).
  `runOnboarding` no longer flips a final gate; it advances to
  `meet_greet_pending`.
- Any → any: **admin action only**, service-role + admin-guard. No restriction
  on source/target (Cal override).

## Meet-and-greet service

Modeled as a real `services` row so it reuses the whole Scheduler / calendar /
availability-window / distance-gate machinery (the client "schedules it like
another service").

- Seed row: slug `meet-greet`, `pricing_type = 'meet_greet'` (new enum value),
  `active = true`, `requires_approval = false`, `concurrency = 'exclusive'`
  (short in-person visit; blocks overlap with other short services, may overlap
  a house-sit — same class as check-ins), `max_pets` null, `form_key` null.
- New `pricing_type = 'meet_greet'` threads through the closed enum, the
  `pricing_config` Zod registry (a trivial/empty config schema), the `quote()`
  dispatch, and `parseQuantities`.
- `meetGreetQuote()` returns `finalCents = 0` with an empty/zero breakdown.
  No prepay, no travel cost line. Distance is still **computed** so the distance
  approval gate (manual review / refuse-beyond-cutoff) still applies.
- Quantities: meet-and-greet takes no priced quantities; `parseQuantities`
  accepts an empty/minimal object for this type.

## The gate (security-critical)

A `meet_greet_pending` client may book **only** the meet-and-greet, and is
blocked from every paid service. Defense-in-depth across three layers; the
server core is authoritative.

### 1. `createBookingCore` — authoritative

Load the caller's `onboarding_status` (service-role read, like the existing
debt/profile loads). Apply before quoting/insert:

- `approved` → may book any active service (today's behavior).
- `meet_greet_pending` → may book **only** the `meet-greet` service. Any other
  slug returns a new result `{ kind: "onboarding_incomplete" }`. Additionally
  block a second meet-and-greet while one is already non-terminal
  (one-at-a-time).
- `info_pending` / `declined` → may book nothing → `onboarding_incomplete`.

This runs under the service role and cannot be bypassed by a crafted client
payload — same trust boundary as the existing column-grant guard and the
server-recomputed money/status fields. `createBooking` (action) surfaces the new
result kind; the `book` client maps it to a "finish onboarding" message /
redirect to `/onboarding`.

### 2. `/book/[serviceSlug]` page — UX

Extend `AuthState` from `guest | needs-onboarding | ready` to
`guest | needs-info | needs-meet-greet | ready`:

- `approved` → `ready`.
- `meet_greet_pending` on the `meet-greet` page → `ready` (may book it).
- `meet_greet_pending` on any other service page → `needs-meet-greet`: a
  "finish your meet & greet first" panel linking to `/onboarding`.
- `info_pending` → `needs-info`, linking to `/onboarding`.

This is presentation only; layer 1 is the real guard.

### 3. Middleware — unchanged in spirit

Still confines non-`approved` users out of `/account/*` to `/onboarding`
(swap the `onboarding_complete` read for `onboarding_status = 'approved'`).
`/book` stays public-view; the per-service gating is the book page + core.

The **per-booking** approval (`pending_approval → confirmed`, distance/horizon
driven) and the **client** approval (`onboarding_status`) stay separate concepts
with separate UI; no shared "approve" control.

## `/onboarding` — stateful wizard

Server component reads `onboarding_status` and renders the matching step:

- `info_pending` → existing profile + emergency form. Submit → advances to
  `meet_greet_pending` (via `runOnboarding`).
- `meet_greet_pending`, **no** non-terminal meet-and-greet booking → "Schedule
  your meet & greet" step: a prominent link to `/book/meet-greet?returnTo=/onboarding`
  (reuses the existing book page + Scheduler + the deferred-auth returnTo guard;
  no embedded second scheduler).
- `meet_greet_pending`, **has** a meet-and-greet booking → status card:
  "Booked for {date}. Cal will confirm you after the visit."
- `approved` → middleware bounces to `/account` (never rendered).
- `declined` → polite "reach out to Cal" copy. Marketing copy is a `[[ ]]`
  placeholder — Cal owns the voice.

## Admin — approve / decline

This is **woven into the existing admin clients views**, not a new route. Both
already surface onboarding as a binary "Onboarded Yes/No"; that binary becomes
the 4-state status plus the approve/decline controls.

**Clients index** (`clients-index-client.tsx` + `ListClientsRow` /
`listClientsCore`): the existing "Onboarded" column (`onboardingComplete`
boolean) becomes an `onboarding_status` badge with 4 states. The row field is
renamed `onboardingComplete → onboardingStatus`; `listClientsCore` selects
`onboarding_status`. (Optional, low-priority: a status filter in
`client-search.ts` — defer unless Cal wants it.)

**Client detail** (`client-detail-client.tsx` + `ClientDetailView` /
`getClientDetailCore`): the Account section's "Onboarded: Yes/No" row becomes
the status, and an **Onboarding** control block is added (its own `SECTION`
right after Account, or inline in Account):

- Shows current `onboarding_status` and the client's meet-and-greet booking
  (date + booking status) when present.
- **Approve** → set `approved`. **Decline** → set `declined`. Because Cal may
  override at any time, the block always offers the transitions that differ from
  the current status (an `approved` client shows "Revoke → declined"; a
  `declined` client shows "Approve" + "Reset → meet_greet_pending").
- **Pre-visit confirm (UX guard):** if Approve is clicked while the
  meet-and-greet booking's `starts_at` is still in the future, show a confirm
  dialog: "Meet & greet is scheduled for {date} and hasn't happened yet.
  Approve anyway?" Past/completed visit or no booking → no extra confirm.

Reuses the component's existing plumbing verbatim: the `useConfirm` hook (already
imported), the `run<T>()` transition+`router.refresh()` helper, and the toast —
the same pattern as the Kiche toggle and per-booking approve/decline. No new
client-side patterns introduced.

New core action `setOnboardingStatusCore(deps, clientId, status)` in
`clients-actions.ts`, mirroring `setKicheAllowedCore`: admin-guard, service-role
write, `revalidatePath`. Validates `status` against the enum and `clientId`
against `role = 'client'`. No source/target transition restriction.

## Data flow

```
signup                              → info_pending
forms submit (runOnboarding)        → meet_greet_pending
book meet-greet (core gate allows   → meet-and-greet booking auto-confirms
  only this service)
Cal attends in person
Cal clicks Approve (admin action)   → approved  (full booking unlocked)
   or Decline                       → declined  (reversible)
Cal may later override either way   → any status, any time
```

## Testing (pure cores stay tested — Constitution)

- `meetGreetQuote()` → `finalCents = 0`.
- Gate matrix: each `onboarding_status` × (meet-greet | paid service) →
  allow / `onboarding_incomplete`; one-meet-and-greet-at-a-time.
- `runOnboarding` advances to `meet_greet_pending`, not `approved`.
- `setOnboardingStatusCore`: admin-guard rejection for non-admins; sets each
  target status including `approved → declined` revoke and `declined → approved`.
- Migration backfill: `true → approved`, `false → info_pending`.

## Risks / open items

- **Far client dead-end:** the distance gate's `refuse` applies to the
  meet-and-greet too, so a client beyond the hard cutoff cannot book even the
  free visit and their onboarding dead-ends. Acceptable for now (Cal won't drive
  far unpaid); the future admin manual-booking spec can override.
- **No open availability windows** → meet-and-greet unbookable → onboarding
  stuck. Same constraint as all booking today; Cal must keep windows open.
- **`pricing_type` is a DB enum** — adding `meet_greet` is a migration plus the
  code-side enum/registry/dispatch updates, all in one commit set.
- **Revoking an `approved` client** mid-relationship locks them out of new
  bookings (existing confirmed bookings are untouched — status lives on the
  booking rows, not the gate). This is intended (Cal override); no automatic
  cancellation cascade.

## Same-commit doc updates

DESIGN.md: update the `profiles` row description (`onboarding_status` replaces
`onboarding_complete`), add the meet-and-greet service + `meet_greet`
pricing_type to the Pricing model / service table, note the onboarding gate in
the booking-flow and route sections, and add `/admin/clients` onboarding
control. Route map `/onboarding` note updated to "stateful onboarding wizard."

---

_Last reviewed: 2026-06-08_
