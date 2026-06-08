# Design — Project Source of Truth

> Authority for **everything project-specific**: what we're building, the stack rationale, scope, pages, brand, pricing, data model, and routes. The other docs are a portable, project-agnostic engineering framework — project facts belong here.

---

## What this is

A site at `calbarba.com` for **Cal**'s unofficial dog-walking / house-sitting business. Two products in one:

- **Portfolio** — About, Services & Booking, Gallery, Reviews, Resources.
- **Self-serve scheduling** — clients see availability, book, manage an account, complete forms, and prepay; quotes adjust by distance.

Goal: Cal redirects clients to the site to save both sides time. Budget is slim — hosting only (domain already owned).

## Stack & rationale

| Layer       | Choice                                                | Why                                                                     |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Framework   | Next.js (App Router) + TypeScript (strict)            | SSR/SEO for the portfolio half; RSC default; maintainer knows it        |
| Styling     | Tailwind + shadcn/ui                                  | Token-driven, owned components, modular theming                         |
| Backend     | Supabase (Postgres + Auth + RLS + Realtime + Storage) | One platform: DB, auth, realtime availability, image storage; free tier |
| Hosting     | Vercel (free tier)                                    | Zero-config deploys                                                     |
| Payments    | Stripe                                                | Prepay at booking                                                       |
| Email       | Resend                                                | Confirmations / reminders                                               |
| SMS (later) | Twilio                                                | Deferred                                                                |
| Distance    | Haversine, no API                                     | Zero ongoing cost; Mapbox drive-time = optional later swap              |

Reference to **study, not fork**: Cal.com (open-source Calendly) for scheduling logic — availability, timezone math, recurring events. Runs ~$0/mo at MVP.

## MVP scope

**In:** availability + booking (Cal sets slots; clients see open/booked; book a service; recurring option; hour/lead-time rules); accounts + forms (profile, pets [name/species/breed/optional photo], emergency form, service-specific forms, first-time onboarding gate); Stripe prepay; haversine auto-quoting.
**Reframed:** sliding scale → an informational section on Services & Booking, not its own feature.
**Deferred:** SMS reminders (Twilio), Google Calendar sync (Cal wants manual control), Mapbox drive-time accuracy.

## Distance pricing (zero ongoing cost)

Distance feeds **two** things: an approval gate and a driving-time cost.

- Cal's **origin is a configurable setting** (Boulder / Springs / etc) — a row Cal edits.
- **Geocode each client once** at signup: ZIP → lat/lng from a free bundled US ZIP-centroid dataset (NBER / zipcodeR, offline) or one free geocode call. Store `lat`/`lng`. Geocoding is a **vendor adapter** in `features/pricing/`, swappable for a real geocoder later (ENGINEERING #4).
- **Pipeline:** pure `lib/haversine.ts` (miles, math only — ENGINEERING #2) → × `road_factor` → ÷ `avg_speed_mph` → **estimated one-way driving minutes**. All three constants Cal-tunable; the whole estimate is one module, swappable for Mapbox drive-time later. No per-booking API call, no recurring cost.
- **Approval gate (miles, not minutes).** The gate is **distance-based**, the way Cal reasons about it: straight-line haversine `miles` > `auto_approve_threshold_miles` (Cal: ~8 mi) → manual approval; > `hard_cutoff_miles` (Cal: ~50 mi) → refuse. A `gate_use_road_miles` flag (default off) switches the gate to `miles × road_factor` (real driving distance) if Cal ever wants that — no rewrite. **Gate uses miles; travel cost uses minutes** — two separate concerns sharing one distance input. Both thresholds are Cal-tunable values, not code.
- **Cost — driving time is billed.** Round-trip driving time × the service's hourly rate, added for hourly services (a check-in = `(on-site + round-trip drive) × $30/h`, per Cal's "including driving time"). House-sitting travel cost is an open Cal Q (flat trip fee vs none).

## Brand / visual direction

Cal's stated intent: **"simple and straightforward."** No brand assets yet (no logo, palette, or fonts). Concrete brand is **set** (Phase 0 of the design overhaul, 2026-06-04): palette **"Trail"** — warm sand/stone/cream neutrals (`--sand-*`) + a **clay/terracotta** accent split into `--brand` (bright fill) and `--brand-strong` (AA-safe text/links). Type: **Fraunces** (serif headings) + **Public Sans** (body), wired via `next/font` → `--font-heading` / `--font-sans`. Status colors (sage/blue/warm-gray) reconciled to the warm base. Tokens live in `src/app/globals.css`; the swap layer is the `--sand-*` / `--clay-*` primitives. Full rationale: `docs/superpowers/specs/2026-06-04-design-overhaul-phase0-tokens-design.md`. Anti-generic, accessibility, and token rules live in [FRONTEND.md](FRONTEND.md) — not restated here.

**Layout: desk + sheet (2026-06-05).** Every page renders as one centered `bg-card` sheet on a warm accent desk (`--canvas`, light = sand-200 / dark = sand-950) carrying a faint static texture (`--bg-texture`, painted on `html`) — depth felt, not seen. Inspired by the content-first, document-like study references below. The sheet has hairline side borders on wide viewports; on mobile it goes full-bleed. System details in [FRONTEND.md](FRONTEND.md) (Shell + brand tokens).

**Starting brief for that session:** warm, trustworthy, approachable-but-professional, with an outdoorsy hint (dog-walking / house-sitting). Photography-forward (Gallery, About). Not flashy. Mobile-first.

**Shell + component kit.** Marketing pages compose the shell system — `PageContainer` / `PageHeader` plus the shadcn/ui component kit — for consistent layout and spacing. The home and about pages share a photographic hero (`public/bg/`); the Gallery page renders real photography from `public/gallery/` in a masonry layout with a lightbox.

**Cal's design study references** (to **study, not fork**, in that session): `about.readthedocs.com`, `gwern.net`, `write.as`. Common thread — content-first, strongly typographic, low-chrome, document-like reading surfaces. Signals a restrained, text-forward aesthetic over a flashy marketing look; reconcile with the photography-forward Gallery/About when concrete type + palette are set.

## Route map

Next.js App Router, three route groups. Auth-session refresh **and** the auth + onboarding gate live in middleware (`src/proxy.ts` → `src/lib/supabase/proxy.ts`), which reads the canonical pathname and redirects un-onboarded users to /onboarding; group layouts keep only a thin auth backstop. `role` guards sit at the group layouts. Architecture rules in [ENGINEERING.md](ENGINEERING.md).

| Route                                 | Group     | Access                        | Notes                                                             |
| ------------------------------------- | --------- | ----------------------------- | ----------------------------------------------------------------- |
| `/`                                   | marketing | public                        | Home / landing                                                    |
| `/about`                              | marketing | public                        | Blurb + references                                                |
| `/services`                           | marketing | public                        | Services, rates, and booking chooser hub                          |
| `/gallery`                            | marketing | public                        | Photo grid (`next/image`)                                         |
| `/reviews`                            | marketing | public                        | Published reviews only                                            |
| `/resources`                          | marketing | public                        | Info + links                                                      |
| `/book`                               | marketing | public                        | Permanent compatibility redirect to `/services`                   |
| `/book/[serviceSlug]`                 | marketing | public view, **auth to book** | Calendar-first per-service booking; deferred-auth gate            |
| `/login`, `/signup`, `/auth/callback` | auth      | public                        | Supabase Auth                                                     |
| `/onboarding`                         | account   | client                        | First-time gate: profile + emergency form before booking          |
| `/account`                            | account   | client                        | Profile (name / email / phone / avatar / password)                |
| `/account/pets`                       | account   | client                        | Pets CRUD (species, photo)                                        |
| `/account/forms`                      | account   | client                        | Emergency + service-form status                                   |
| `/account/bookings`                   | account   | client                        | Upcoming, history, amount owed, pay / prepay                      |
| `/admin/availability`                 | admin     | admin                         | Calendar: create/resize/block-out windows + manage day's bookings |
| `/admin/bookings`                     | admin     | admin                         | Approve manual-approval requests                                  |
| `/admin/services`                     | admin     | admin                         | Edit services + rates                                             |
| `/admin/settings`                     | admin     | admin                         | Origin swap, distance threshold, booking hours, lead time         |
| `/admin/reviews`                      | admin     | admin                         | Moderate submissions                                              |
| `/admin/clients`                      | admin     | admin                         | (optional) Client list                                            |

Full in-app admin so Cal never touches the Supabase dashboard. `/admin/availability` uses the `<Scheduler>` family (ADMIN capabilities preset) to manage windows: pick a day to create a window (Denver wall-time inputs), resize or block-out existing windows (block-out cancels overlapping bookings, keeping the confirm step), and overlay that day's bookings (enriched busy: client name + pet photos). Selecting a booking opens a side panel to cancel, approve/decline a `pending_approval`, or mark a `confirmed` booking `no_show` — all via the existing booking/approval cores; mutations `router.refresh()` the server-loaded windows + busy.

**Booking flow + deferred-auth gate.** `/services` is the public chooser hub; each active service card opens `/book/[serviceSlug]`, where the `<Scheduler>` family (BOOKING capabilities preset) drives selection — **month-range** (check-in/out dates) for house-sitting, and a **month→day-timeline** flow (`week-slots` mode) for the hourly services: the month picks the day, then a duration-accurate single-day timeline picks/types the start time. A live receipt auto-updates as the selection changes (no "Get quote" button). Anyone may browse and pick; sign-in is deferred to the **Book action**. A guest who clicks Book is sent to `/login?returnTo=…`, a signed-in-but-un-onboarded user to `/onboarding?returnTo=…`; on success they land back on their exact selection. `returnTo` encodes the selection (slug in the path; resolved start/end ISO + assigned pet ids in the query) and is validated by a same-origin open-redirect guard (relative, must start `/book/`). `createBooking` keeps its own server-side `redirect("/login")` backstop. Pet-aware services (house-sitting, walk) assign **real pets** from the profile; dog/cat counts are derived server-side from the assignment, never typed in.

## Data model

Supabase Postgres. Auth via Supabase `auth.users` (username / password are **not** app columns). `client_id` = `auth.uid()`; Cal is `role='admin'`. Money stored as integer **cents**. RLS is deny-by-default. Core logic (distance, quote, availability-overlap, booking state) lives in `features/*` as **pure functions**, IO at the edges ([ENGINEERING.md](ENGINEERING.md) #5); vendors (Stripe, geocoding) sit behind adapters (#4).

**Tables** (column → purpose):

- **`profiles`** (1:1 `auth.users`) — `id` (=auth.uid) · `full_name` · `email` · `phone` · `avatar_url` (single now; gallery later) · `address`, `zip` · `lat`, `lng` (geocoded once at signup) · `kiche_allowed` (set at first booking → discount) · `onboarding_complete` (booking gate — single setter: flips true when the onboarding flow finishes; criteria = required profile fields + emergency form present) · `role` ('client' \| 'admin') · `created_at`.
- **`pets`** (was `dogs`) — `id` · `client_id`→profiles · `name` · `species` ('dog' \| 'cat') · `breed` · `photo_url` (optional; object path in the private `pet-photos` storage bucket, served via short-lived signed URLs) · `notes` (extra per-pet fields — vet / meds / feeding; structured fields planned, see Open questions + Forms) · `created_at`.
- **`booking_pets`** — join (`booking_id`→bookings, `pet_id`→pets, PK both). Which specific pets are on a booking. Written by the service role at booking creation; clients read their own. Pricing still derives counts from the assigned pets and snapshots them into `quote_inputs`.
- **`services`** — `id` · `slug` · `name` · `description` · `pricing_type` ('house_sitting' \| 'check_in' \| 'walk' \| 'training') · `pricing_config` (jsonb — Cal-editable rates/surcharges, validated by a per-type Zod schema) · `default_duration_min` · `max_pets` (capacity; training = 1) · `concurrency` ('exclusive' \| 'resident' — house-sitting = resident) · `form_key` (nullable → service-specific form) · `requires_approval` (force manual review) · `active` · `sort_order`. See **Pricing model** below.
- **`availability_windows`** — `id` · `starts_at` · `ends_at` · `note`. **Sole source of truth for when Cal is bookable** (#10); default world is **closed**, Cal adds open windows. A booking must fall inside an open window _and_ within `settings.booking_open_minute..close_minute` (hard hours-of-day guard, **start and end**) and respect `min_lead_time_hours`; advance beyond `auto_confirm_horizon_days` is **pending, not refused** (only `hard_max_advance_days` refuses — see Booking state machine / Recurrence). Block-out = delete/trim a window (confirm + cancel any booking inside). `/book/[serviceSlug]` reflects live state via **Supabase Realtime** (events over polling, ENGINEERING #12). Window recurrence deferred — one-off windows for MVP.
- **`overnight_nights`** — `night` (date PK, Denver calendar; night D = Cal sleeps D → D+1) · `note` · `created_at`. Explicit per-night overnight availability for house-sitting. Admin toggles nights on/off; un-toggling a night with an active resident booking is refused (conflict returned, nothing cancelled). Public-read; all writes via service role / admin actions.
- **`settings`** (single config row Cal edits) — `origin_label` · `origin_lat`, `origin_lng` (current base; swappable Boulder / Springs) · `road_factor` (~1.3), `avg_speed_mph` (miles → driving-minutes; **travel-cost only**) · `auto_approve_threshold_miles` (~8), `hard_cutoff_miles` (~50, refuse beyond), `gate_use_road_miles` (bool, default false — gate on `miles × road_factor` instead of straight-line) — **distance approval gate, see Distance pricing** · `booking_open_minute`, `booking_close_minute` (minutes-since-midnight, hard hours-of-day guard; 390 = 6:30am, 1320 = 10:00pm; bounds **both** booking start ≥ open and end ≤ close — see `availability_windows`) · `min_lead_time_hours` · `auto_confirm_horizon_days` (~30 — within → auto-confirm; beyond → `pending_approval`), `hard_max_advance_days` (~365 — sanity outer cap, refuse beyond) · `recurrence_generation_horizon_days` (~42 — how far ahead open-ended series rows are materialized) · `recurring_discount_pct`, `recurring_min_occurrences` · `holiday_surcharge_cents`, `holiday_dates` (Cal-managed list) · `reminder_lead_hours` (~24 — email fires this long before a confirmed start) · `cancellation_full_refund_hours` (~48), `late_cancel_refund_pct` (~50), `no_show_charge_pct` (~100) — **cancellation/refund policy, see Booking state machine**. Everything here is Cal-tunable — values, not code. _(Supersedes the earlier minutes-based gate columns `auto_approve_threshold_min` / `hard_cutoff_min` and the integer `booking_open_hour` / `booking_close_hour` / `max_advance_days`.)_
- **`bookings`** — `id` · `client_id` · `service_id` · `starts_at`, `ends_at` · `series_id` (nullable FK → `booking_series`; groups a recurring set) · `comments` · `status` (state machine, below) · `payment_status` ('unpaid' \| 'paid' \| 'refunded') · `distance_miles` (snapshot at quote) · `quote_inputs` (jsonb — pet counts, nights/partial, add-ons, holiday days captured at quote time) · `quote_breakdown` (jsonb — itemized result) · `discount_cents` (Kiche + recurring; Cal-adjustable) · `final_cents` · `requires_approval` (derived) · `reminder_sent_at` (nullable) · `created_at`, `updated_at`. Amount owed = `final_cents` − succeeded `payments`. `payment_status` is a **derived projection** of `payments` (single writer = Stripe webhook), never written independently (#10). No two **same-concurrency-class** bookings (`services.concurrency`) may overlap while active — enforced by a **Postgres exclusion constraint** (btree_gist over `tstzrange`, partitioned by class), not app code (ENGINEERING #11); cross-class (house-sit + short service) may overlap. Recurrence engine is general (Google-Calendar-style); MVP exposes **weekly** only.
- **`form_responses`** — `id` · `client_id` · `form_key` ('emergency' \| service slug) · `booking_id` (nullable; emergency form isn't booking-tied) · `data` (jsonb) · `submitted_at`. Forms are expected to change over time. For MVP, definitions live in a `features/forms/` registry of typed **Zod schemas in code** validating `data` at the edge (YAGNI / rule-of-three, [ENGINEERING.md](ENGINEERING.md) #9). The `data` jsonb already accommodates a future Cal-editable form builder with **no storage change** — only the definition source (code → DB) would move. _Assumption: Cal doesn't need self-serve form editing at launch; flag if wrong._
- **`payments`** — `id` · `booking_id` · `client_id` · `stripe_payment_intent_id` · `amount_cents` · `currency` · `status` ('requires_payment' \| 'succeeded' \| 'refunded' \| 'failed') · `created_at`. Stripe behind `features/payments/` adapter.
- **`reviews`** — `id` · `client_id` · `author_name` (snapshot) · `rating` (1–5) · `body` · `status` ('pending' \| 'published' \| 'rejected') · `created_at`. Client-submitted, Cal-moderated.
- **`booking_series`** — durable rule for a weekly recurrence (so open-ended "no end" series can be materialized forward by a cron instead of inserting infinite rows up front). `id` · `client_id` · `service_id` · `freq` ('weekly') · `step_interval` (the rule's interval; `interval` is a Postgres keyword) · `count` (nullable) · `until` (nullable) · `open_ended` (bool — true ⇒ neither `count` nor `until`) · `template_starts_at` · `duration_min` · `quote_inputs` (jsonb — **frozen** at submit so every occurrence re-quotes identically) · `active` · `created_at`. `bookings.series_id` FKs here. See **Recurrence** below.
- **`client_debits`** — outstanding balances that gate re-booking. `id` · `client_id` · `booking_id` · `amount_cents` · `reason` ('late_cancel' \| 'no_show') · `settled_at` (nullable) · `created_at`. Outstanding balance = Σ `amount_cents` where `settled_at is null`; a positive balance **blocks new bookings** (see Booking state machine, cancellation/refund). **System/admin-set, never client-writable** (same column-guard rule as `bookings.status`).

**RLS approach (deny-by-default):**

- Per-client tables (`profiles`, `pets`, `bookings`, `form_responses`, `payments`): row readable/writable only when `client_id = auth.uid()`. `booking_pets` is readable when the joined booking is the caller's.
- `booking_series`: client reads own; series rows created/updated by server actions + the series-roll cron under the service role (clients never write the rule directly). `client_debits`: client reads own; **admin/system write only** (debits and settlements move via admin actions, never client SQL).
- Public-read tables (`services`, `availability_windows`, `overnight_nights`): anon read, admin-only write. `reviews`: anon read where `status='published'`; clients insert their own (status forced `pending`); admin updates status.
- `settings`: authed read, admin write.
- **Busy-range exposure (two trust levels).** The customer calendar reads busy ranges through a service-role server action that projects **only** start/end + pet thumbnails (species + signed photo URL) — **no owner name/id**, by construction (identity-free result type + a dedicated repo method). The admin calendar uses a separate **admin-gated** action that joins owner + status for management. Pet photos live in a private bucket, served via short-lived signed URLs. Pet photos are intentionally client-visible (a photo is not a privacy concern); client identity is not.
- Admin (`role='admin'`) override expressed in each policy.
- **Column-level guard (security).** The client `UPDATE` policy on `profiles` whitelists only self-editable columns. `role`, `lat`, `lng`, `kiche_allowed`, and `onboarding_complete` are **system/admin-set, never client-writable** — otherwise a client could `SET role='admin'` and self-promote. Likewise clients never write `bookings.status` / `final_cents` / `payment_status` or `payments` rows by SQL; those move only through server actions and the Stripe webhook under the service role.

**Assumptions & boundaries:**

- **Single provider.** One Cal; no `provider_id`. Adding helpers later is a multi-provider migration (thread `provider_id` through `availability_windows` + `bookings`).
- **Single timezone.** Store UTC; render `America/Denver` (Cal's region). Revisit only if Cal works across zones.
- **Cal tunes values, devs add types.** `/admin` edits rates, settings, and a service's configured amounts. Adding a new `pricing_type`, `concurrency` class, or service-specific form is a code change (closed enums + typed Zod) — by design, not a gap.

## Pricing model

Pricing is **rule-based per service**, not a flat rate. Each `services` row carries a `pricing_type` and a Cal-editable `pricing_config` (jsonb, validated by a per-type Zod schema). A pure `features/pricing/quote()` dispatches on `pricing_type` → returns an itemized breakdown; the distance travel-factor and discounts apply as modifiers on top. Because every amount is config, Cal tunes rates in `/admin/services` + `/admin/settings` with **no code change** ([ENGINEERING.md](ENGINEERING.md) #5 pure logic, #4 config at the edges). The four `pricing_type`s are the real domain cases, not speculative abstraction.

**Service types + seed rates** (Cal's stated values — tunable):

| Service       | `pricing_type`  | Rate shape (seed)                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| House Sitting | `house_sitting` | **One base rate by pet priority** (dog > cat): $50/night if any dog present, else $30/night (cat-only). Every non-base pet is a per-night surcharge: +$15/night per extra dog, +$10/night per cat (e.g. 1 dog + 1 cat = $60/night). +$10/day if a dog can't be left alone 6 h; 45 min/day of walks included, +$5/day per extra 15 min; +$10/day holiday. "Night" = 24 h; partial = % of 24 h. |
| Check-ins     | `check_in`      | $30/hour incl. driving time, **$15 minimum**; pet count not a factor.                                                                                                                                                                                                                                                                                                                         |
| Walks         | `walk`          | $25/hour + $10/dog (behavior; Cal may discount well-behaved).                                                                                                                                                                                                                                                                                                                                 |
| Training      | `training`      | $35/hour, **one dog at a time** (`max_pets` = 1).                                                                                                                                                                                                                                                                                                                                             |

**Modifiers** (after base; all configurable):

- **Travel (driving time)** — round-trip estimated driving minutes × the service's hourly rate, added for hourly services (check-in / walk / training); see _Distance pricing_ for the estimate + approval gate. House-sitting travel = config (default off; open Cal Q).
- **Recurring discount** — −10% when a recurrence **series** has ≥ `recurring_min_occurrences` bookings (seed 3) of walks, check-ins, or training; house-sitting qualifies only on **3+ distinct stays** in the series (nights within one stay don't count). Multi-service "cart" grouping is deferred — **one booking per submit** at MVP, so this discount is series-based. **Frozen at booking time:** cancelling below the threshold does not retro-revoke.
- **Kiche discount** — eligibility flagged by `kiche_allowed`; **applied by Cal, never automatic**. Client agrees to full price; if Cal brings Kiche she applies 25% (walks) / 20% (house-sitting) → reduces `final_cents` (partial refund if already prepaid). A "nice surprise," per Cal. Percentages live in each service's `pricing_config`.

**Computation order** — pure + deterministic, round to nearest cent per line: base + per-pet / add-on surcharges → travel → recurring −10% (if the series qualifies) → Kiche % (applied later by Cal). Persisted as `quote_breakdown` (itemized lines) + `final_cents` (total).

## Booking state machine

Pure function `transition(state, event, ctx) → state | error` in `features/booking/` — no IO inside. **Quote is not a state**: distance + the quote (`quote_breakdown` / `final_cents`) are computed synchronously at submit. **Prepay is optional and decoupled from validity** — a booking is valid on _approval_, not payment; payment is tracked on `payment_status` and can happen at booking (prepay) or later (amount-owed). **Reminder is not a state**: it's a side-effect (Resend email N hours before a `confirmed` start; `reminder_sent_at` flag; SMS deferred).

```
submit ─┬ requires_approval? yes ─▶ pending_approval
        └ no  (auto-approve)  ─────▶ confirmed

pending_approval ── approve ──▶ confirmed
pending_approval ── decline ──▶ declined            (terminal)
confirmed ── end time reached ─▶ completed           (terminal, auto)
confirmed ── no-show (Cal marks) ─▶ no_show          (terminal; writes a client_debits row)
pending_approval | confirmed ── cancel ─▶ cancelled  (terminal; refund per policy below)
```

- `requires_approval` is **derived as the OR of three signals**: (1) the **distance** gate decision is manual (miles > `auto_approve_threshold_miles`); (2) the **time** gate decision is pending (`starts_at` is beyond `auto_confirm_horizon_days` from now); (3) the service is flagged (`requires_approval`). A **refuse** from either gate (miles > `hard_cutoff_miles`, or beyond `hard_max_advance_days`) short-circuits the submit. Derivation is **per-occurrence** — a recurring series can straddle the time horizon (near occurrences auto-confirm, far ones pend; see Recurrence).
- **Slot is held from submit onward** through any non-terminal state — no TTL, no expiry. Releases only on `declined` / `cancelled`.
- `completed` is automatic once end time passes (scheduled job).
- Stripe webhook is the **sole writer** of `payment_status` (a projection of `payments`); it never changes `status`.
- **Kiche discount** is applied by Cal (admin) → reduces `final_cents`; partial refund if already prepaid.
- **Client-initiated cancel** is allowed and governed by the **cancellation / refund policy** below.
- Payment model is **deposit-ready**: a future mandatory-deposit + forfeit-on-late-cancel slots in via partial `payments` rows — no schema rework. MVP = prepay optional, full amount, **pay-later default**.

**Cancellation / refund policy** (all values Cal-tunable in `settings`):

- **Cutoff = `cancellation_full_refund_hours` (~48 h) before start.** Cancel **at or before** the cutoff → **full** refund of whatever was paid (auto). Cancel **inside** the cutoff → **`late_cancel_refund_pct`** (~50%) refund by default, **flagged for Cal** to optionally grant the remaining (full) refund via an admin action.
- **Refund issuance keeps the single-writer rule.** The cancel path **initiates** the refund through the `payments` adapter (`StripeGateway.refund`); the **Stripe webhook stays the sole writer of `payment_status`** (re-projects to `refunded` on `charge.refunded`). The cancel path never writes `payment_status` directly (#10).
- **No partial-payment edge case:** prepay is full-amount-or-nothing, so paid = `final_cents` or 0; "50% of paid" = "50% of `final_cents`".
- **Debt gate.** Cancelling **unpaid inside the cutoff** (or a Cal-marked **no-show**) writes a `client_debits` row for what's owed (`late_cancel_refund_pct` / `no_show_charge_pct` of `final_cents`). An unpaid cancel **at/before** the cutoff owes nothing — free cancellation is honored regardless of prepay. Any **unsettled** balance **blocks new bookings** until cleared (Cal marks settled offline, or the client pays); the gate is checked **server-side** in the shared booking-artifacts path, so both the quote preview and the create call block. The series-roll cron also stops promoting a debtor's future occurrences.
- **No-show is a Cal admin action**, not automatic — the completion cron can't tell "no-showed" from "served, will pay later." `confirmed → no_show` (terminal) writes the debit.

## Recurrence

Engine is general (Google-Calendar-style); **MVP exposes weekly only**, with either a **fixed number of weeks** (`count`) or **open-ended** ("no end", `open_ended`). The booking system **never officially books past ~1 month** out:

- At submit, a `booking_series` row is written (rule + frozen `quote_inputs`) and occurrences are materialized only up to `recurrence_generation_horizon_days` (~42). Each occurrence's status is derived per-occurrence (see Booking state machine): within `auto_confirm_horizon_days` → `confirmed`; beyond → `pending_approval`.
- A daily **series-roll cron** (sibling of the reminder / completion crons) does two jobs: **promote** `pending_approval` occurrences to `confirmed` as they cross into the confirm horizon (re-checking availability + the no-overlap constraint; a now-conflicting slot stays pending and is flagged for Cal, never silently dropped), and **extend** open-ended series by materializing newly-in-horizon occurrences. It skips a debtor's occurrences (see cancellation/refund debt gate).
- This single horizon mechanism also covers **far one-off bookings**: a booking beyond the confirm horizon sits `pending_approval` and auto-confirms when it enters the horizon (Cal can decline during the window).

## Open questions for Cal

Running list, updated as Cal answers. Most are **tunable config**, not blockers — schema/logic are built to absorb the values later (see [WORKFLOW.md](WORKFLOW.md) dev loop).

**Resolved (recorded above):**

- **Services + rates** — house-sitting / check-ins / walks / training seed rates (Pricing model).
- **House-sitting base** — single base rate by pet priority (dog > cat); other pets are surcharges (dog + cat = $60/night).
- **Discounts** — Kiche 25% walks / 20% house-sitting, Cal-applied surprise; recurring −10% for ≥3 bookings (house-sitting: 3+ distinct stays), series-based at MVP.
- **Distance** — gate on **miles** (~8 mi → ask Cal, ~50 mi → refuse; straight-line for now, switchable to road distance); driving-**time** billed at the service hourly rate. Values tunable (Distance pricing).
- **Concurrency** — house-sit may overlap short services; same class never overlaps (exclusion constraint).
- **Booking flow** — one booking per submit at MVP (no multi-item cart).
- **Booking rules** — hours 6:30am–10:00pm (start & end within), min lead time unchanged, advance → soft `auto_confirm_horizon_days` (~1 month; beyond → pending, not refused) with a `hard_max_advance_days` sanity cap. Tunable.
- **Reminder timing** — 24 h before a confirmed start (`reminder_lead_hours`). Tunable.
- **Prepay** — full amount, **pay-later default**, prepay optional.
- **Cancellation / refund** — full refund ≥48 h out; <48 h → 50% (Cal may grant full); unpaid late cancel / no-show → debt that blocks re-booking until settled. Values tunable (Booking state machine).
- **Recurrence breadth** — weekly only at MVP; fixed week-count **or** open-ended via the rolling ~1-month materialization horizon (Recurrence). General engine retained underneath.
- **Per-dog fields** — `notes` covers vet / meds / feeding for now; structured fields planned (below). Tunable.

**Still open (Cal working on it):**

1. **House-sitting travel** — does a house-sit add a travel cost (flat trip fee?) or none? Driving-time billing is defined for hourly services only.
2. **Form fields** — initial set received (Forms below); rest still coming. Per-dog vs per-property/booking field split to confirm once the set firms up.
3. **Structured per-dog fields** — Cal drafting vaccination, meds, vet contact, feeding; `dogs.notes` jsonb absorbs them now, structured columns once finalized.
4. **Threshold tuning** — `road_factor`, `avg_speed_mph`, exact miles/horizon/refund values. Cal-settable; defaults seeded.

**Genuinely open design question (per Alex):**

- **Deposit / prepay system** — MVP = optional full prepay + the cancellation/refund policy above. Future likely: mandatory deposit as a security + forfeit-on-late-cancel mechanism. Payment model is built deposit-ready; the _policy_ beyond MVP is undecided.

**Assumption to confirm:** forms stay developer-edited (typed Zod) at launch — Cal doesn't get a self-serve form builder yet (storage is already future-proof for one).

### Forms (draft — Cal supplying incrementally)

Cal has begun sending form fields; the set is **incomplete and subject to change**. Recorded here so nothing's lost. Each maps to the existing `form_responses` + `features/forms/` typed-Zod registry — **no storage change**; a registry schema is added per form once Cal finalizes (implementation deferred). The **emergency** form already exists.

- **Home / property access** (entry info, reused across services needing access):
  - Address — _already on `profiles.address` / `zip`; reuse, don't duplicate._
  - How should I enter the home? (when client not home at service time)
- **Walk service form** (`form_key` = walk service slug):
  - Typical route(s)
  - Typical distance or time
  - Off-leash permitted? Off-leash tag?
  - Leash or harness? Where located?
  - Allowed to greet other dogs? Allowed to greet strangers?
  - Comments
  - Okay to drive to hike location? If yes: seatbelt / vehicle-restraint location; instructions for securing pet in vehicle

Some fields are **per-dog** (leash/harness, greeting behavior, restraint) vs **per-property/booking** (entry, route) — the split decides whether a field lives on the `dogs` record or the service-form response; confirm with Cal when the set firms up.

## Copy placeholders

Marketing copy that Cal must write is stubbed with double-square-bracket markers. Keep the structure in code; Cal owns the voice and substantive claims.

- **Marker:** `[[ ... ]]`. Grep with `rg "\[\["`.
- **Forms:**
  - `[[HEADER: purpose]]` — section/card/page header
  - `[[BODY: what this paragraph should cover]]` — paragraph copy
  - `[[Item N: what it is]]` — list/card/FAQ/resource stub
- **Header rules:** basic, descriptive noun phrases. No first-person, no quirky/pushy phrasing. ✗ "Pricing flexibility matters to me." → ✓ "Sliding cost scale". If unsure, write `[[HEADER: purpose]]`.
- **Body rules:** describe purpose only. No invented service claims, philosophy, or biographical detail — Cal supplies all of that.
- **Example items:** for resource/FAQ/testimonial arrays, always use stubs (`[[Resource 1: name]]`); never invent examples.
- **Locations:** Colorado only. No towns/cities/neighborhoods in copy, alt text, or addresses.
- **Don't assume Cal's services or audience-facing voice** — overnight stays, meet-and-greets, cat care, medication handling, sliding-scale philosophy, background, etc. all get placeholdered until Cal confirms.
- **Public emergency resources** (ASPCA poison line, 24/7 vet ER) are OK as real entries — verifiable, not a claim about Cal. **Generic local resources** (humane society, dog park) → stub.

---

_Last reviewed: 2026-06-07_ (services/booking merge: /services hub + /book compatibility redirect)
