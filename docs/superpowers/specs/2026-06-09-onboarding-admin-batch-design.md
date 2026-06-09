# Onboarding + Admin Patch Batch — Design

_Status: approved for planning · 2026-06-09_

A batch of six related fixes/requests across the onboarding flow and the admin
clients views. They cluster into three work areas plus two cross-cutting
concerns. Builds directly on the meet-and-greet onboarding gate
([2026-06-08 design](2026-06-08-meet-greet-onboarding-design.md)).

## Scope

**In:** the onboarding step-1 form submission + errors, the account sidebar
locked state during onboarding, live-refresh of the post-booking onboarding
card, embedding the meet-and-greet scheduler into onboarding step 2 (and
removing it from the public services list), and the admin onboarding-status
dropdown.

**Out:** retrofitting the auth pages (sign-in/up) to inline per-field errors
(separate task); replacing emoji on surfaces this batch does not touch (e.g.
other empty states); admin manual booking (its own future spec).

---

## Cluster 1 — Onboarding form submission + errors (#1, #2)

### Problem

1. **NEXT_REDIRECT bug.** [`completeOnboarding`](../../../src/features/accounts/onboarding-action.ts)
   calls Next's `redirect()`, which signals navigation by **throwing** a
   `NEXT_REDIRECT` control-flow error. [`info-step.tsx`](<../../../src/app/(account)/onboarding/_components/info-step.tsx>)
   invokes it inside a `try/catch`, so the catch swallows that throw and renders
   it as an on-screen error string. The profile write succeeds on the first
   click (so a later click "works"), but the user sees a spurious error and a
   delayed transition.
2. **Bad errors.** `runOnboarding` uses `.parse()` and throws a single generic
   `Error`. The zod schemas ([`profile-schema.ts`](../../../src/features/accounts/profile-schema.ts),
   [`emergency-schema.ts`](../../../src/features/forms/emergency-schema.ts))
   already carry good per-field messages, but none of them reach the user.

### Decision

Both are fixed by the same change: convert the step-1 form to a **React form
action driven by `useActionState`**, the idiomatic Next pattern.

- The action signature becomes `(prevState, formData) => OnboardingFormState`.
  It reads fields from `formData`, runs `safeParse`, and:
  - on validation failure → returns `{ ok: false, fieldErrors }` (zod
    `flatten().fieldErrors`, keyed by field name),
  - on success → calls `redirect()`. Because the action is bound via
    `useActionState`/`<form action>`, React treats the `NEXT_REDIRECT` throw as
    a navigation, not an error. **No client `try/catch` → bug gone.**
- `InfoStep` renders **inline per-field errors** beneath each input via the
  existing [`form-field.tsx`](../../../src/components/ui/form-field.tsx)
  primitive, with `aria-invalid` and `aria-describedby` wiring. Pending state
  comes from `useActionState`'s `isPending` (or `useFormStatus`).
- `returnTo` rides along as a hidden input.

### Boundaries

- **`runOnboarding` (pure core) is unchanged** — it keeps throwing on invalid
  input; the action wrapper is what switches to `safeParse` + structured return.
  Existing [`onboarding-action.test.ts`](../../../src/features/accounts/onboarding-action.test.ts)
  stays green.
- New test: the action wrapper returns `fieldErrors` for each invalid field and
  does not throw a user-visible error.

Error style for onboarding is **inline per-field** (confirmed). The auth pages
keep their single bottom banner for now; aligning them is a separate task.

---

## Cluster 2 — Onboarding wizard UX (#3, #4, #5)

### #3 — Sidebar locked during onboarding

**Problem.** `/onboarding` lives in the `(account)` route group, so
[`(account)/layout.tsx`](<../../../src/app/(account)/layout.tsx>) renders the
account sidebar (Profile/Pets/Forms/Bookings) via
[`app-sidebar.tsx`](../../../src/components/layout/app-sidebar.tsx). Middleware
([`proxy.ts`](../../../src/lib/supabase/proxy.ts)) confines non-`approved` users
to `/onboarding`, so every one of those tabs just bounces back.

**Fix (mockup layout B).** Thread `onboarding_status` from the account layout →
`AppShell` → `AppSidebar`.

- When `status !== "approved"`: prepend an **active** "Onboarding" item (href
  `/onboarding`) so the sidebar has a clear "you are here", and render the four
  account tabs as **disabled non-link elements**: muted color, a lucide `Lock`
  glyph, `aria-disabled="true"`, a "Available after onboarding" tooltip/title,
  and no navigation or hover-active styling.
- When `status === "approved"`: normal nav, **no "Onboarding" item**.

`accountNav` stays the static source of the four real tabs; the "Onboarding"
entry and the locked treatment are applied in the sidebar based on the passed
status (not added to `nav-config`). The disabled items are plain elements, not
`<Link>`s, so they are unreachable by keyboard activation as well as click.

### #3b — Active-nav highlight on nested detail routes

**Problem.** The sidebar uses `isActiveNav` (exact match), so on a nested route
like `/admin/clients/{id}` the **Clients** tab loses its active highlight. (Folded
into this batch because it lives in the same sidebar file as #3.)

**Fix.** Switch the sidebar to prefix-aware section matching
([`isActiveSection`](../../../src/components/layout/is-active-nav.ts), already
present) so a tab stays active for routes nested under it. Guard the overlap
where `/account` is a prefix of `/account/pets`/`/forms`/`/bookings` with
**longest-match-wins**: only the most specific matching item highlights, so
visiting `/account/pets` highlights Pets, not Profile. Applies to both the
account and admin sidebars.

### #4 — "Awaiting confirmation" text doesn't clear after approval

**Problem.** The booked-state card on `/onboarding` is server-rendered. After
Cal approves in admin, the client's open tab never re-fetches; the page's own
`redirect('/account')` (fired when status is `approved`) only runs on a fresh
request. Confirmed: a manual reload clears it — it is a live-update gap, not a
deeper bug.

**Fix (poll).** Mount a small client component (`RefreshOnInterval`) on the
booked-state card that calls `router.refresh()` on an interval (~15s). When Cal
approves, the next refresh re-runs the server component, hits the existing
`approved → /account` redirect, and the user is moved on automatically. No
Supabase realtime, no new server action — the redirect already exists. The
interval is cleared on unmount.

### #5 — Meet-and-greet: embed in onboarding, remove from services, modularize

**Problem.** The meet-and-greet is a real `active = true` service, so
[`listActiveServices`](../../../src/features/booking/services-repo.ts) lists it
on `/services`, and onboarding step 2 links **out** to `/book/meet-greet`. Cal
wants the meet-and-greet off the public services page and its scheduling to live
**inside** onboarding step 2.

**Coupling note.** The compound [`<Scheduler>`](../../../src/features/booking/_components/scheduler/)
is already decoupled and presentational. The weight lives in
[`service-booking-client.tsx`](<../../../src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx>) —
pets, quantities, pricing/quote, recurring, the deferred-auth gate — none of
which a free meet-and-greet needs. So a slim dedicated component is cleaner than
reusing that wrapper.

**Fix.**

- **De-list.** `listActiveServices` excludes `pricing_type === "meet_greet"` so
  the meet-and-greet never appears on `/services`. (Documented in the repo's
  doc comment; this is the only public listing consumer.)
- **`MeetGreetScheduler` (new client component).** Reuses `<Scheduler>` in
  `week-slots` mode (same day + time UI as walks/check-ins), `useAvailability`,
  `useBusyRanges`, and `createBooking` with `serviceSlug: "meet-greet"`, empty
  quantities, no pets. No quote panel (it is free), no recurring, no pet
  assignment.
- **Step 2, two states (mockup layout B).** A client component owns a
  `view | reschedule` toggle:
  - **Pick** (no active meet-and-greet booking) → one unified card: short
    "free, ~30-min, what happens next" intro + the `MeetGreetScheduler`.
  - **Booked** (active booking exists) → the scheduler is **collapsed** to a
    compact status card (confirmed date + "Awaiting Cal's confirmation"). A
    **View / reschedule** button re-opens the scheduler inline, pre-set to the
    booked time. This replaces today's link-out to `/account/bookings`.
  - Step 2 is widened from the narrow "read" width to the booking width so the
    calendar has room.
- **Modularize.** Extract the shared server step "load booking-rule settings +
  initial public busy ranges" (currently inline in
  [`/book/[serviceSlug]/page.tsx`](<../../../src/app/(marketing)/book/[serviceSlug]/page.tsx>))
  into a reusable helper, so the onboarding page and the book page both use it
  rather than duplicating the query.
- **Retire `/book/meet-greet`.** The route redirects to `/onboarding`
  (scheduling now lives there). The `createBookingCore` gate
  (`meet_greet_pending` may book only the meet-and-greet, one at a time) is
  **kept** — it is the authoritative guard. The `needs-meet-greet` gate panel on
  other service pages still links to `/onboarding`.

---

## Cluster 3 — Admin onboarding status dropdown (#6)

**Problem.** [`client-detail-client.tsx`](<../../../src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx>)
has four separate conditional button clusters (one per status) for changing
onboarding status — a maze. `setOnboardingStatusCore` already accepts any enum
value, so this is a UI swap.

**Fix.** Replace the button clusters with a single shadcn `Select`
([`select.tsx`](../../../src/components/ui/select.tsx)) offering three settable
options:

| Option   | Enum value           | Dot color |
| -------- | -------------------- | --------- |
| Pending  | `meet_greet_pending` | amber     |
| Approved | `approved`           | green     |
| Declined | `declined`           | red/clay  |

- `info_pending` ("Profile pending" — client has not submitted forms) renders as
  a **read-only label**, not the dropdown; admin cannot meaningfully force it.
- **Status is shown with a colored dot + label, no emoji.**
- **Pre-visit approve confirm is kept:** selecting "Approved" while the
  meet-and-greet booking's `starts_at` is still in the future shows the existing
  confirm dialog ("…hasn't happened yet. Approve anyway?"). Past/no booking → no
  extra confirm.
- **List view is inline-editable** (confirmed). The Onboarding column in
  [`clients-index-client.tsx`](<../../../src/app/(admin)/admin/clients/_components/clients-index-client.tsx>)
  (both the desktop table and the mobile cards) becomes the same `Select` per
  row; `info_pending` rows stay a static badge. To support the pre-visit confirm
  from the list, add `meetGreetUpcoming: boolean` (and the booking date if
  needed) to `ClientListRow`, derived in `listClientsCore` from the client's
  non-terminal meet-and-greet booking.

Reuses the component's existing plumbing: `useConfirm`, the `run<T>()`
transition + `router.refresh()` helper, the toast, and the `setOnboardingStatus`
action — the same pattern as the Kiche toggle. No new client-side patterns.

---

## Cross-cutting

### No emojis

Replace emoji with lucide icons on every surface this batch touches:

| Surface                       | Was | Becomes (lucide)          |
| ----------------------------- | --- | ------------------------- |
| Step 2 intro card             | 🐾  | `PawPrint`                |
| Booked-state card (confirmed) | ✓   | `CalendarCheck` / `Check` |
| Booked-state card (awaiting)  | ⏳  | `Clock`                   |
| Locked sidebar tabs           | —   | `Lock`                    |
| Admin status                  | —   | colored dot (token-based) |

Emoji on surfaces outside this batch (e.g. other empty states) are left alone.

### Tokens are law

All new/changed UI references semantic Trail tokens and the Fraunces/Public Sans
type tokens; no hardcoded colors (status dots use semantic status tokens). Meets
the accessibility floor: semantic elements, contrast, visible focus, keyboard
nav, and proper `aria-disabled`/`aria-invalid`/`aria-describedby`.

---

## Data flow (unchanged gate, new surfaces)

```
signup                          → info_pending
step-1 form submit (action)     → meet_greet_pending   [#1/#2: no NEXT_REDIRECT, inline errors]
step-2 MeetGreetScheduler       → meet-and-greet booking (auto-confirms in range)   [#5: embedded]
   booked card polls status     → on 'approved', router.refresh → server redirect   [#4]
Cal sets status via dropdown    → approved | declined | meet_greet_pending           [#6]
approved                        → sidebar unlocks, /onboarding bounces to /account   [#3]
```

## Testing (Constitution: pure cores stay tested)

- **#1/#2:** action wrapper returns `fieldErrors` per invalid field; success path
  redirects without surfacing an error. `runOnboarding` core tests unchanged.
- **#5:** `listActiveServices` excludes `meet_greet`; `MeetGreetScheduler`
  produces a valid `createBooking` input (meet-greet slug, no pets, empty
  quantities); the shared rules+busy loader returns the same shape for both
  callers. Gate matrix from the prior spec stays green.
- **#6:** `ClientListRow.meetGreetUpcoming` derivation; status `Select` writes
  through `setOnboardingStatus`; `info_pending` is non-settable.
- **#3:** sidebar renders locked items (non-link, `aria-disabled`) when not
  approved and normal links when approved.
- **#3b:** `isActiveSection` highlights a tab on its nested routes;
  longest-match-wins so `/account/pets` highlights Pets only, not Profile.

## Same-commit doc updates

- **DESIGN.md:** note that the meet-and-greet is not a publicly listed service
  and is scheduled only within onboarding; `/book/meet-greet` retired (redirects
  to `/onboarding`); `/onboarding` step 2 embeds the scheduler; admin onboarding
  status is a dropdown.
- **DEV_NOTES.md:** the six items already moved to the "In progress" section
  (done as the first step of this batch); move them to done/remove when shipped.

## Risks / open items

- **Polling cost (#4):** a 15s `router.refresh()` re-runs the onboarding RSC
  while the booked card is mounted. Acceptable — it only runs on that one card,
  for the short window between booking and approval. Stops on unmount.
- **Retiring `/book/meet-greet`:** any external deep link (e.g. an old email)
  now redirects to `/onboarding`, which is the correct destination for a
  mid-onboarding client. No data loss.
- **List inline-edit misclick (#6):** mitigated by the confirm dialog on the
  highest-stakes transition (pre-visit approve); other transitions are
  reversible by Cal at any time (per the prior spec's override model).

---

_Last reviewed: 2026-06-09_
