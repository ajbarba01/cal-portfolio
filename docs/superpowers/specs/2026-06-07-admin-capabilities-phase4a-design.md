# Phase 4a — Admin Capabilities

> Spec for the admin-capabilities cycle (umbrella roadmap:
> `~/.claude/plans/ok-sure-lets-try-splendid-plum.md`, Phase 4). Phases 0, 1,
> Shell-Unification, 2, and 3 are DONE on local `main` (unpushed). This spec owns
> the **what + why**; the implementation plan (next, via `writing-plans`) owns the
> how.

## Reframe of Phase 4

The umbrella framed Phase 4 as **input humanization** (cents→$, minutes→time
picker, lat/lng→address, services `pricing_config` jsonb→typed fields). The
maintainer has reprioritized: Phase 4 is now first about **net-new admin
capabilities** — surfaces Cal needs to run the business that don't exist yet.
Input humanization is split out to its own later pass (**Phase 4b**, see
Deferred), and the time/date pickers move with it because this calendar only
reads/navigates bookings — it does not create them.

This spec is therefore **Phase 4a — Admin Capabilities**.

## Goal

Give Cal the in-app admin surfaces to run the business without ever touching the
Supabase dashboard (the DESIGN.md "full in-app admin" promise). Four capabilities:

1. **Clients** — an index of all clients with search, and a per-client detail page
   that surfaces everything Cal needs (account, pets, forms, bookings, balance)
   plus a small, justified set of admin mutations.
2. **Booking calendar** — rework the thin approvals-only `/admin/bookings` into a
   navigable month + day-agenda calendar of what is booked.
3. **Dashboard** — replace the bare `/admin`→availability redirect with a real
   glance-view landing page.
4. **Inquiries** — a public `/contact` form (guest or signed-in) feeding an admin
   inquiries queue with mark-resolved and native email/SMS reply handoff.

## Surfaces in scope

- **New:** `/contact` (marketing), `/admin/clients`, `/admin/clients/[clientId]`,
  `/admin/inquiries`.
- **Reworked:** `/admin/bookings` (approvals-only list → booking calendar),
  `/admin` (redirect → dashboard page).
- **Nav:** add **Contact** to the marketing top-tab bar; admin sidebar becomes
  `Dashboard · Availability · Bookings · Clients · Services · Settings · Reviews ·
Inquiries`. Drop the "optional" marker on `/admin/clients` in DESIGN.md.

## Constraints honored (not restated — see the docs)

- New admin reads/writes follow the existing identity-gated pattern:
  `assertActorIsAdmin` + service-role client (see `features/admin/admin-busy.ts`).
  Reuse, don't reinvent.
- Inline booking actions on the client page **reuse existing cores** (cancel /
  approve / decline / no-show in `features/admin/approval-actions` +
  `features/booking/actions`) — no new state-machine logic.
- Column-guard security holds: `kiche_allowed` and `client_debits.settled_at` are
  already admin/system-set only; the new mutations write them through admin
  actions, never widening client RLS.
- Two-layer tokens; components reference semantic roles only; whitespace from
  `space.*`; type from `typeScale`. No hardcoded color. Internal nav = `<Link>`
  only. Shared shell primitives (`PageContainer`/`PageHeader`) + the component kit.
- Feedback taxonomy: toast (aria-live) for transient success, inline field errors,
  confirm dialog for destructive actions, friendly empty/error states (no raw
  `Failed to load X: {message}` / UUID dumps).
- A11y floor (semantic HTML, AA contrast, visible focus, keyboard nav incl.
  focus-trap + Esc on dialogs). **Mobile parity is a per-surface acceptance
  criterion** — every table/calendar/form states its phone-width pattern.
- Copy stays `[[ ]]`-placeholdered (Colorado-only rules, DESIGN.md). TS strict,
  no `any`. Core logic pure + tested. Commit subject-line only. Same-commit doc
  rule for DESIGN.md / FRONTEND.md. Do **not** push (`main` auto-deploys to prod;
  Alex batches the push).

## Design decisions (locked in brainstorm)

### A. Clients — index + detail

**Index (`/admin/clients`).** A table (shared kit) of all `profiles` where
`role='client'`: columns name, email, phone, pets count, bookings count,
outstanding balance, onboarding state. A text search box filters the loaded list
by name/email/phone. Each row links to detail. Friendly empty state.

- **Search is client-side** over the loaded list. Rationale: Cal's client count is
  small; a client-side filter is zero-round-trip and simplest. _Risk noted below if
  the list ever grows large._

**Detail (`/admin/clients/[clientId]`).** A sectioned page, read-all plus
in-section mutations:

- **Account** — full_name, email, phone, address/zip, avatar, created_at,
  onboarding_complete, kiche_allowed. Mutation: **toggle Kiche eligibility**
  (`profiles.kiche_allowed`). DESIGN.md: the Kiche discount is "Cal-applied, never
  automatic" — this flag is its gate, and no UI exists for it yet.
- **Pets** — name/species/breed/notes + photo (private bucket, short-lived signed
  URL, same as admin-busy). Read-only.
- **Forms** — the client's `form_responses` (emergency + any service forms),
  rendered readable. Read-only.
- **Bookings** — the client's bookings (status, dates Denver wall-time, total,
  amount owed). Mutation: **inline booking actions** (cancel / approve / decline /
  no-show) reusing existing cores; confirm dialog on destructive, toast on success.
- **Balance** — outstanding `client_debits` (sum of unsettled `amount_cents`, with
  reason + booking link). Mutation: **settle a debit** (`client_debits.settled_at`).
  DESIGN.md: "Cal marks settled offline"; unsettled balance blocks rebooking; no UI
  exists for it today.

Dropped this pass (maintainer): editing client contact info / re-geocoding — that
edits client-owned PII and is lower value.

### B. Booking calendar (`/admin/bookings`)

Replace the current page — which loads **pending-only** bookings and renders raw
`client_id` UUIDs — with a navigable calendar.

- **Month view** of booking density; selecting a day opens a **day-agenda** list of
  that day's bookings showing **client name** (not UUID), service, status, total,
  and the moderation actions (the same reused cores).
- **Status filter** + **client search**. Pending-approval bookings remain reachable
  and visually flagged here (the page still covers the approvals job it does today).
- Sub-decision (resolve in plan): reuse the Scheduler `MonthGrid` vs a lighter
  read-only month component. Default: **lighter read-only month component** — the
  Scheduler's editing affordances (window create/resize) are availability concerns,
  not booking-browsing; a read-only month avoids coupling. Availability page keeps
  the Scheduler.

### C. Dashboard (`/admin`)

Replace the redirect with a landing page of glance-cards, each linking to its
surface:

- Today's bookings (count + quick list).
- Pending-approval count → `/admin/bookings` filtered.
- Pending-review count → `/admin/reviews`.
- Clients with an outstanding balance → `/admin/clients`.
- New inquiries count → `/admin/inquiries`.
- Next upcoming booking(s).

Composes existing data plus the new client/debit/inquiry reads. No new domain
logic beyond aggregation.

### D. Inquiries — `/contact` + `/admin/inquiries`

**Reply mechanism (decided): in-site capture + status + draft; native handoff for
the actual send.** Cal hits an Email or Text button that opens a `mailto:` / `sms:`
deep link prefilled with subject + a short partial body; Cal writes the real reply
in their own mail/SMS client and sends from their own address. Rationale: zero new
infra/cost (hosting-only budget); the client's reply threads naturally back into
Cal's inbox (app-sent mail would orphan replies); matches Cal's manual-control
ethos; `sms:` is the only zero-cost SMS path (Twilio deferred). In-site we still
log the inquiry, its status, and the generated draft for tracking/audit.

**Data — new `inquiries` table:** `id · client_id` (nullable → guest) `· name ·
email · phone` (nullable) `· subject` (nullable) `· message · status`
('new' | 'resolved') `· replied_at` (nullable; stamped when Cal hits a reply
button — a timestamp, **not** a formal state) `· resolved_at` (nullable) `·
created_at`. RLS: **anon insert** (guest submit), **admin read/update**; client may
read their own (optional, low priority). Status is a closed enum (DESIGN.md
"devs add types" rule). Lifecycle: **new → resolved** (two states).

**`/contact` (marketing, public).** shadcn form (name, email, phone optional,
subject optional, message). Signed-in users get name/email prefilled from their
profile. **Spam guard: hidden honeypot field + a simple per-IP/timestamp
rate-limit** (zero cost, no third party, no friction). Toast on submit. Copy stays
`[[ ]]`-placeholdered, Colorado-only.

**`/admin/inquiries` (admin).** List, new-first, with friendly empty state. Per
inquiry:

- **Mark resolved** (sets `status='resolved'` + `resolved_at`).
- **Email** button → `mailto:` with prefilled subject + short partial body
  (greeting + lead-in line). Body kept short to stay under `mailto:` URL-length
  limits.
- **Text** button → `sms:` with prefilled body (mobile-first; no subject); shown
  only when a phone is present.
- Hitting either reply button stamps `replied_at`.
- If `client_id` is present, link to that client's detail page.

## Data access / server actions (new; all admin-gated)

Implementation detail lives in the plan; these are the units the design needs:

- `listClients()` — clients + aggregates (pets#, bookings#, unsettled balance,
  onboarding).
- `getClientDetail(clientId)` — profile + pets (signed photo URLs) + form_responses
  - bookings + debits.
- `setKicheAllowed(clientId, boolean)`.
- `settleDebit(debitId)` — fills the documented "Cal settles offline" gap.
- A **date-range** enriched booking read for the calendar. The existing
  `getActiveBusyRangesEnriched` is active-only / now-forward; the calendar needs a
  month window including completed/cancelled. Extend the booking repository.
- Inquiries: `submitInquiry(input)` (anon-capable, honeypot + rate-limit),
  `listInquiries()`, `markInquiryResolved(id)`, `stampInquiryReplied(id)`.

## Pure logic to test (TDD)

- Outstanding-balance sum (Σ unsettled `amount_cents`) — pure, in `features/`.
- Client search/filter predicate (name/email/phone match).
- Inquiry **draft generation** (subject + partial-body builder; deterministic,
  string-only) — unit-tested incl. URL-encoding/length safety for `mailto:`.

## Risks / deferred (note; do not fix here)

- **Client search scaling.** Client-side filter assumes a small client list; if it
  grows, move to a server query (flagged, not built).
- **Spam guard depth.** Honeypot + rate-limit catches casual abuse, not a
  determined attacker; a free captcha (Turnstile) is the next step if needed.
- **`sms:` desktop support** is spotty; treat Text as a mobile-first affordance.
- **Phase 4b — input humanization (deferred):** settings (minutes→time picker,
  cents→$, lat/lng→address geocode, holiday-date chip picker, unit-suffixed
  controls), services `pricing_config` jsonb→typed fields, and the shared
  **time/date picker** components live in their own later spec→plan→build cycle.
- **Manual booking-on-behalf-of-client** (Cal books for a client who called/texted)
  is a real future need but large and depends on the deferred pickers — out of
  scope.
- **Carry-forward cross-phase items** (still open, not this spec): the live 390px +
  keyboard-a11y completion walk never executed across Shell/Phase 1/2/3; Phase-3
  blind-edited interactions still want a visual confirm (photo-crop pan/zoom,
  hourly snap-back, two-click range preview); Stripe prepay is a stub; the
  `pending_approval` clay tint may be revisited.

## Out of scope

Input humanization (Phase 4b), the deferred pickers, manual booking creation,
two-way in-site messaging / inbound email parsing, client-facing contact-info edit
by admin, multi-provider, SMS via Twilio.

## Verification

Per-task gates (cited in the plan):

- `npx vitest run` (~587 tests / 38 files baseline) — new pure logic adds tests.
- `npx tsc --noEmit` — strict, no `any`.
- `npx eslint "src/**/*.{ts,tsx}"` — incl. the repo bans (no setState-in-effect, no
  ref read/write during render).
- `npx next build`.
- Confirm the baseline is green before relying on it.

Visual / non-headless (maintainer's browser-refresh loop):

- Walk every new/reworked surface on desktop **and** a phone width; confirm light +
  dark; confirm keyboard nav + visible focus on tables, calendar, forms, dialogs.
- Confirm the reply handoff: Email opens a `mailto:` with the right subject/body;
  Text opens `sms:` on mobile; `replied_at` stamps.
- Confirm Kiche toggle and debit-settle reflect immediately and survive refresh.

## Docs to update (same-commit rule)

- **DESIGN.md** — route map: `/admin/clients` built (drop "optional"),
  `/admin/bookings` = booking calendar, `/admin` = dashboard, add `/contact`; data
  model: add the `inquiries` table + its RLS.
- **FRONTEND.md** — any new shared pattern introduced (admin table, read-only month
  calendar) recorded as system, not restated per page.
