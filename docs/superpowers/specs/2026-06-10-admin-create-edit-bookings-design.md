# Admin Create-on-Behalf + Edit Bookings — Design

_Status: approved for planning · 2026-06-10_

The third of four sub-projects in the booking-mutation overhaul. It builds the
**admin-facing UI** that lets Cal (admin) **create a booking on behalf of a
client** and **edit any client's booking**, acting as the admin actor: every
policy gate is bypassed with **warn-don't-block**, and Cal can optionally
force-confirm. It is UI + a thin admin **create** action on top of the
already-built, tested mutation spine; admin **edit** is already wired at the
action layer.

The four-project decomposition (see
[booking-mutation-spine-design](2026-06-09-booking-mutation-spine-design.md)):

- **P1 — Spine.** Actor/policy context + `editBookingCore`. Done, verified.
- **Client self-service** edit/reschedule UI. Done, verified
  ([client-self-service-edit-design](2026-06-10-client-self-service-edit-design.md)).
- **This spec — Admin create-on-behalf + edit** UI (consumes P1).
- **Admin payment admin** (price adjust + record offline payment).

## What P1/P2 already provide (do not rebuild)

- `MutationPolicy` with `ADMIN_POLICY` (every gate skipped → `warnings[]`,
  optional `forceStatus`) and `CLIENT_POLICY`
  ([mutation-policy.ts](../../../src/features/booking/mutation-policy.ts)). The
  actor→policy mapping lives **only** in the action layer, from the verified
  `profiles.role`; a client can never submit `ADMIN_POLICY`.
- `computeBookingArtifacts` is policy-aware: debt, onboarding, distance-refuse,
  and horizon-refuse gates already warn-don't-block under an admin policy and
  return human-readable `warnings: string[]`.
- `editBookingCore` / `editBooking` and `previewEditCore` / `previewEdit`
  **already support admin**: the action derives `ADMIN_POLICY` from the verified
  role, bypasses ownership, and threads the policy through guards + window-fit
  (warn-don't-block) and `forceStatus`. `previewEditCore` already returns
  `warnings[]`. Admin EDIT is therefore largely wired at the action layer.
- The only hard stop for admins is the Postgres same-class exclusion constraint
  (physical double-booking) → `slot_taken`.
- `EDITABLE_STATUSES` = `{pending_approval, confirmed}` for ALL actors (a core
  constraint, not a policy gate) — admins cannot edit terminal rows.
- `price_locked`: `editBookingCore` rejects a **price-affecting** patch
  (pets/quantities) once `paidCents > 0`, for ALL actors. Kept as-is (see D6).
- Pure, tested, actor-agnostic helpers reusable here: `buildEditQuoteInput`,
  `diffBookingPatch`, `quantityStateFromQuoteInputs`,
  `computeBookingQuoteCore(deps, input, policy)`.
- `EditBookingClient`
  ([edit-booking-client.tsx](<../../../src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx>))
  — the edit orchestrator: reuses `<Scheduler>`, `PetAssignment`, `QuantityForm`,
  `QuotePanel` (all in `src/features/booking/_components/`), debounced
  `previewEdit`, signed price delta, re-approval note, series-occurrence note.
- `ServiceBookingClient` + `RecurringControls` — the create orchestrator shape
  (service-fixed, recurring controls, deferred-auth/returnTo). Reference, not a
  consumer here.
- `listClients()` → `ClientListRow[]` and `getClientDetail`; the admin client
  surfaces ([/admin/clients](<../../../src/app/(admin)/admin/clients>),
  [/admin/clients/[clientId]](<../../../src/app/(admin)/admin/clients/[clientId]>))
  and the read-only month calendar
  ([/admin/bookings](<../../../src/app/(admin)/admin/bookings>)).

## Scope

**In:** a thin admin `createBookingForClient` action + an admin
`previewQuoteForClient` action; making `createBookingCore` policy-aware (the one
real backend gap); a new `AdminCreateBookingClient` orchestrator on a dedicated
admin route (with a service-pick step + recurring controls); extending
`EditBookingClient` with an `admin` prop bundle and a dedicated admin edit route
(loads any client's booking + that client's pets, no ownership/`clientCanEdit`
gate); surfacing `warnings[]` in the quote panel (new `--warning` semantic
token); a force-confirm control; admin entry affordances on the client-detail
page + an Edit link on the calendar; mapping results to UI; pure unit tests +
admin-path integration coverage.

**Out:** payment admin (price adjust, record offline payment, true paid-price
override) — P4; a global client picker (unnecessary: create launches from an
already-chosen client); whole-series ("edit all future") editing; service-swap;
notifications (the action layer stays the seam); reschedule-core unification /
making `editBookingCore` onboarding-self-aware (not needed — see D5).

---

## Decisions (locked 2026-06-10 grill)

- **Q1 — Client-centric entry points.** Create + edit launch from the
  **client-detail** page (`/admin/clients/[clientId]`). The client is already
  chosen, so create needs **no picker**. Edit sits on each booking row Cal
  already sees. The read-only calendar gains a per-booking **Edit** link. (Not a
  calendar-centric hub; no global client picker.)
- **Q2 — Admin edit = extend `EditBookingClient`.** One orchestrator, an
  optional `admin` prop bundle. Admin-edit is client-edit plus three additive
  things (render `warnings[]`, a force-confirm control, no client-gate copy), so
  a mode prop keeps the preview/save logic — which must stay byte-identical
  across actors — in one place. (Not a parallel `AdminEditBookingClient`; that
  would duplicate ~700 lines and risk drift on the exact logic that must match.)
- **Q3 — Admin create = new focused `AdminCreateBookingClient`.** Create carries
  genuinely different concerns (no seeded booking, a service must be picked,
  recurring), so it gets its own orchestrator on a dedicated route, reusing the
  shared leaf components + `<Scheduler>` + quote + `RecurringControls`. (Not a
  mode flag on the public `ServiceBookingClient` — that would bolt branches onto
  the revenue funnel with regression risk.) Requires the one backend change:
  make `createBookingCore` policy-aware.
- **Q4 — Recurring included.** Admin create supports weekly series (parity with
  the client flow); the spine + `RecurringControls` already handle it.
- **Q5 — Meet-greet: admin yes, client surface unchanged.** Admin can create
  **and** edit meet-greet bookings (the create service-pick offers M&G; edit
  works because `ADMIN_POLICY` skips the onboarding gate, so `editBooking`
  reaches no meet-greet gate). The **client-facing** M&G experience is untouched
  — onboarding's `MeetGreetScheduler` stays the only client M&G path. No
  reschedule-core unification, no onboarding-self-aware change is needed for the
  admin path.
- **Q6 — Force-confirm, default off.** A checkbox in the quote panel:
  "Confirm immediately — skip pending approval." Off = the state machine's
  re-derived status (e.g. `pending_approval`); On = `ADMIN_POLICY.forceStatus =
"confirmed"`. Default off so nothing auto-confirms behind Cal's back.
- **Q7 — Warn-don't-block, above Save, amber.** Override `warnings[]` render as
  a **caution block directly above the Save/Book CTA** (point-of-action), in a
  new **`--warning`** amber semantic token, live-updating from the preview.
  Never blocks submit. (Not a top banner; not the brand or destructive roles.)
- **D6 — Paid bookings: keep `price_locked` in P3.** Admin may edit **time +
  details** on a paid booking; **price-affecting** edits (pets/quantities) stay
  blocked by the core's `price_locked`, surfaced in the UI as locked controls +
  "manage price in Payments (coming)" copy. True paid-price override is P4. The
  edit path never touches Stripe.
- **Q8 — Routes nested under the client.** Edit:
  `/admin/clients/[clientId]/bookings/[bookingId]/edit`. Create:
  `/admin/clients/[clientId]/book`. The calendar Edit link targets the edit route
  (`BookingCalendarRow` carries `client_id`).

---

## Architecture

### 1 — `createBookingCore` made policy-aware (the one backend gap)

`createBookingCore` today hardcodes `CLIENT_POLICY` (it calls
`computeBookingArtifacts(deps, input, CLIENT_POLICY)`) and its **own** two
guard steps are unconditional hard stops, unlike `editBookingCore`:

- Step 6 `passesGuards` (hours-of-day / lead-time / max-advance) → `unavailable`.
- Step 7 `fitsWindow` (availability-window containment) → `unavailable`.

It also never applies `forceStatus`. Changes (mirroring `editBookingCore`):

- Add a `policy: MutationPolicy` parameter, **defaulting to `CLIENT_POLICY`** so
  every existing caller (`createBooking`, tests) is unchanged. Thread it into
  `computeBookingArtifacts`.
- Make step 6 / step 7 policy-aware: under `policy.skipHoursLeadGuards` /
  `policy.skipWindowFit`, push a human-readable warning instead of returning
  `unavailable`.
- When `policy.forceStatus` is set, use it for every occurrence's status instead
  of the state-machine-derived status.
- Add `warnings: string[]` to the `success` result (`CreateBookingResult`); it
  is `[]` under `CLIENT_POLICY`, so the client path is behaviourally identical.

No change to the recurring path beyond status: a forced status applies to all
occurrences; the series rule + skip-set plumbing is untouched.

### 2 — Admin actions (action layer; role-verified)

Two net-new `"use server"` actions, each verifying `profiles.role === "admin"`
via a service-role read (never trusting the payload), reusing the
`requireAdminDeps`-style guard already in
[actions.ts](../../../src/features/booking/actions.ts):

- **`createBookingForClient({ clientId, serviceSlug, startsAt, endsAt,
quantities, petIds?, recurringRule, forceConfirm })`** — verify admin; verify
  `clientId` is an existing client profile; build `policy = { ...ADMIN_POLICY,
forceStatus: forceConfirm ? "confirmed" : undefined }`; call `createBookingCore`
  with `userId = clientId` + that policy. Returns the policy-aware
  `CreateBookingResult` (with `warnings`). Sends no confirmation email and never
  touches Stripe (create-on-behalf takes no payment — P4 owns offline payment).
- **`previewQuoteForClient({ clientId, serviceSlug, startsAt, endsAt,
quantities, petIds?, recurringRule })`** — verify admin; call
  `computeBookingQuoteCore(deps, { ...input, userId: clientId }, ADMIN_POLICY)`.
  Returns `BookingQuotePreview` including `warnings` (computed against the
  **target** client's profile: their distance, debt, etc.). This is the admin
  twin of the public `previewQuote`.

**Edit force-confirm:** `editBooking` (and only the admin branch) gains an
optional `forceConfirm` input → `policy.forceStatus`. `previewEdit` does not need
it (the preview shows the derived status; the UI reflects the toggle locally).
A non-admin caller's `forceConfirm` is ignored (they get `CLIENT_POLICY`).

### 3 — `AdminCreateBookingClient` (new orchestrator)

Route `src/app/(admin)/admin/clients/[clientId]/book/page.tsx` (server): verify
admin; load the client (name, pets, lat/lng presence), services list, booking
rule settings, busy ranges. Renders a **service-pick step** (the client is fixed,
so no picker); choosing a service mounts the booking surface — a focused
orchestrator that mirrors `ServiceBookingClient`'s mode selection (week-slots vs
month-range), pet-aware species, hourly-duration derivation, availability/busy
hooks, `<Scheduler>` bridge, debounced live preview, and `RecurringControls`,
but: targets `previewQuoteForClient` / `createBookingForClient`; drops the
deferred-auth gate + returnTo; carries the admin identity header + warnings +
force-confirm. Service-pick may be its own URL segment or in-page state
(implementation choice deferred to the plan).

### 4 — `EditBookingClient` extended with an `admin` prop

New admin route
`src/app/(admin)/admin/clients/[clientId]/bookings/[bookingId]/edit/page.tsx`
(server): verify admin (no ownership check, no `clientCanEditBooking`); load the
booking by id (any client); guard only on `EDITABLE_STATUSES`; load **that
client's** pets (`booking.client_id`, not the session user). Pass an `admin` prop
bundle to `EditBookingClient`:

```ts
admin?: {
  clientName: string;        // identity header / chip
  paidLock: boolean;         // paidCents > 0 → disable price-affecting controls
  forceConfirm: boolean;     // controlled by the quote-panel checkbox
  onForceConfirmChange: (v: boolean) => void;
}
```

When `admin` is set: render the "Admin · editing on behalf / for {clientName}"
header; render `preview.warnings` above the CTA; render the force-confirm
control; pass `forceConfirm` to `editBooking`; when `paidLock`, disable the
`PetAssignment` + `QuantityForm` inputs and show the "price locked — Payments
(coming)" note (time + comments stay editable). When `admin` is undefined the
component behaves exactly as today (client mode). `previewEdit` / `editBooking`
calls are otherwise unchanged — the server derives the admin policy from the role.

### 5 — `QuotePanel` + the `--warning` token

- Add a `--warning` semantic role (amber/honey) to
  [globals.css](../../../src/app/globals.css) for light **and** dark, plus its
  paired `--warning-foreground`, wired through `@theme inline`; add `"warning"`
  to `SEMANTIC_COLORS` in
  [design-tokens.ts](../../../src/lib/design-tokens.ts). Same-commit doc note in
  [FRONTEND.md](../../FRONTEND.md). Components reference the token, never the hex.
- Extend `QuotePanel` with an optional `warnings?: string[]` (renders the amber
  caution block above the CTA when non-empty) and an optional slot for admin
  controls (the force-confirm checkbox), so both the create and edit surfaces
  reuse one receipt. Client previews pass no warnings → no visual change.

### 6 — Client-detail + calendar affordances

- **Client-detail** ([client-detail-client.tsx](<../../../src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx>)):
  each booking row gains an **Edit** affordance for `EDITABLE_STATUSES`; a paid
  editable row shows "Edit (time/details)" + a `🔒 price` indicator; terminal
  rows show "no longer editable". A **"+ New booking for {name}"** button links
  to the create route. (Existing approve/decline/cancel/no-show actions stay.)
- **Calendar** ([bookings-calendar-client.tsx](<../../../src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx>)):
  day-list rows for `EDITABLE_STATUSES` gain an **Edit** link → the edit route.

### 7 — Result handling

`createBookingForClient` / `editBooking` results map to UI: `success` → toast +
redirect (create → the client-detail page; edit → back to it) and surface the
returned `warnings` in the success toast/inline; `slot_taken` →
"that time was just taken, pick another"; `unavailable` / `refuse` /
`validation_error` are **not reachable** for an admin (gates warn-don't-block)
but get safe inline fallback copy; `price_locked` is prevented by the paid-lock
UI but maps to the locked-controls note if hit. The hard stop Cal can actually
see is `slot_taken`.

### 8 — Mobile parity (hard rule)

Both admin routes are single-column (`max-w-2xl`), reusing the already
mobile-correct book-flow layout; the service-pick grid is responsive; the
client-detail rows and calendar day-list wrap; the warnings block + force-confirm
stack cleanly with no hover-only affordances. Verified on the create surface, the
edit surface, the client-detail affordances, and the calendar link — a
first-class acceptance criterion, not an afterthought.

---

## Data / schema

**No schema changes, no migrations, no new repo methods anticipated** beyond a
profile-role/existence read for the target client (reuse the existing
`profiles.role` read pattern). All booking writes continue through the
service-role repo from the `"use server"` boundary. `previewQuoteForClient` is
read-only.

## Testing

Pure / DI-driven unit tests (no Next.js, no live Supabase) plus targeted
integration:

- `createBookingCore` policy-aware: `ADMIN_POLICY` turns the step-6 (hours/lead)
  and step-7 (window-fit) blocks into warnings; `forceStatus` overrides
  per-occurrence status; `CLIENT_POLICY` behaviour is unchanged (back-compat) and
  `warnings === []`.
- `createBookingForClient` / `previewQuoteForClient` actions: non-admin →
  forbidden; unknown `clientId` → rejected; admin happy path computes against the
  target client (warnings reflect the target's debt/distance).
- Integration (needs `npx supabase db reset` first; self-cleaning like
  `edit-booking.integration.test.ts`): admin create-on-behalf happy path +
  warn-don't-block + force-confirm; admin edit of another client's booking; paid
  booking → time/details edit allowed, price-affecting → `price_locked`.

Manual verification covers both routes, the live preview + warnings + delta, the
force-confirm path, the paid-lock, the client-detail/calendar affordances, and
mobile.

## Risks / notes

- **Create back-compat.** Adding a policy parameter to `createBookingCore`
  defaulted to `CLIENT_POLICY` keeps all existing callers + tests green; the
  guard-to-warning branches are reached only under an admin policy. A regression
  here hits the public funnel — covered by the back-compat unit assertions.
- **Preview/commit parity (create).** `previewQuoteForClient` and
  `createBookingForClient` must compute against the same target client + policy;
  both delegate to the shared `computeBookingArtifacts` pipeline, never a
  parallel path (mirrors the P2 drift-guard discipline).
- **Force-status validity.** `forceStatus = "confirmed"` is a valid
  `draft→submit` target; the core applies it directly (as `editBookingCore`
  already does). No other forced status is exposed in P3.
- **Paid/P4 boundary.** Keeping `price_locked` means an admin cannot change a
  paid booking's price in P3; the UI must make the boundary legible rather than
  appear broken. Revisited in P4.
- **`--warning` token reuse.** A genuine semantic role (not a one-off), so future
  warn states inherit it; light + dark + foreground defined together.

---

_Last reviewed: 2026-06-10_
