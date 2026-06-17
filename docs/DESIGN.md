# Design — Project Source of Truth

> Authority for **everything project-specific**: build, stack rationale, scope, pages, brand, pricing, data model, routes. Other docs are a portable, project-agnostic engineering framework — project facts belong here.

---

## What this is

`calbarba.com` for **Cal**'s unofficial dog-walking / house-sitting business. Two products in one:

- **Portfolio** — About, Services & Booking, Gallery, Reviews, Resources.
- **Self-serve scheduling** — clients see availability, book, manage an account, complete forms, prepay; quotes adjust by distance.

Goal: Cal redirects clients here, saves both sides time. Budget slim — hosting only (domain owned).

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

**Study, not fork**: Cal.com (open-source Calendly) for scheduling logic — availability, timezone math, recurring events. Runs ~$0/mo at MVP.

## MVP scope

**In:** availability + booking (Cal sets slots; clients see open/booked; book a service; recurring option; hour/lead-time rules); accounts + forms (profile, pets [name/species/breed/optional photo], emergency form, service-specific forms, first-time onboarding gate); Stripe prepay; haversine auto-quoting.
**Reframed:** sliding scale → informational section on Services & Booking, not its own feature.
**Deferred:** SMS reminders (Twilio), Google Calendar sync (Cal wants manual control), Mapbox drive-time accuracy.

## Distance pricing (zero ongoing cost)

Distance feeds **two** things: an approval gate and a driving-time cost.

- Cal's **origin is a configurable setting** (Boulder / Springs / etc) — a row Cal edits.
- **Geocode each client once** at signup: ZIP → lat/lng from a free bundled US ZIP-centroid dataset (NBER / zipcodeR, offline) or one free geocode call. Store `lat`/`lng`. Geocoding is a **vendor adapter** in `features/pricing/`, swappable for a real geocoder later (ENGINEERING #4).
- **Pipeline:** pure `lib/haversine.ts` (miles, math only — ENGINEERING #2) → × `road_factor` → ÷ `avg_speed_mph` → **estimated one-way driving minutes**. All three constants Cal-tunable; whole estimate is one module, swappable for Mapbox drive-time later. No per-booking API call, no recurring cost.
- **Approval gate (miles, not minutes).** Distance-based, as Cal reasons: straight-line haversine `miles` > `auto_approve_threshold_miles` (~8 mi) → manual approval; > `hard_cutoff_miles` (~50 mi) → refuse. `gate_use_road_miles` flag (default off) switches gate to `miles × road_factor` (real driving distance) — no rewrite. **Gate uses miles; travel cost uses minutes** — two concerns, one distance input. Both thresholds Cal-tunable values, not code.
- **Cost — driving time billed.** Round-trip driving time × service's hourly rate, added for hourly services (check-in = `(on-site + round-trip drive) × $30/h`, per Cal's "including driving time"). House-sitting travel cost = open Cal Q (flat trip fee vs none).

## Brand / visual direction

Cal's stated intent: **"simple and straightforward."** No brand assets yet (no logo, palette, fonts). Concrete brand **set** (design-overhaul Phase 0, 2026-06-04; extended 2026-06-05): palette **"Trail"** — warm sand/stone/cream neutrals (`--sand-0…950`, the re-palette swap layer) + a **clay/terracotta** accent split into `--brand` (bright `#AE5A35` fill — fills + button text, white passes AA) and `--brand-strong` (`#8A4226` — AA-safe small text / links / active-nav / focus ring). `--primary` stays warm near-black: clay is a deliberate accent, never the default button color. Type: **Fraunces** (serif headings, `--font-heading`) + **Public Sans** (body, `--font-sans`), wired via `next/font`. Type scale + spacing scale + `65ch` reading measure live in `src/lib/design-tokens.ts` (`typeScale`, `space`, `measure`); `.measure` utility in `globals.css`. **Whitespace is a token** — only `space.*` steps (Tailwind 4px base) for padding/gaps, no arbitrary values; shells apply them so all zones share one rhythm. Status colors (sage/blue/warm-gray) reconciled to warm base: `--status-*` fills re-tuned, unavailable stays warm gray (not red), red reserved for `--destructive`. Tokens live in `src/app/globals.css`; swap layer = the `--sand-*` / `--clay-*` primitives. Full rationale: `docs/superpowers/specs/2026-06-04-design-overhaul-phase0-tokens-design.md`. Anti-generic, accessibility, token rules → [FRONTEND.md](FRONTEND.md), not restated here.

**Concrete brand-token roster (the project values behind FRONTEND.md's portable system):**

- **`--canvas`** — accent desk behind the sheet: light = `--sand-200`, dark = `--sand-950`. Two-layer semantic role — swapping desk color needs no component edits.
- **`--bg-texture`** — swappable site-wide background pattern, aliased from a `--tex-*` texture library in `globals.css`. Library holds `--tex-wood` (inline procedural feTurbulence data-URI) and `--tex-topo` (recolored hand-drawn contour SVGs in `public/bg/topography-{light,dark}.svg`, the active default). Each theme-aware (light/dark variants). Painted **once, statically** on `html` (`bg-canvas` + `--bg-texture`, `background-attachment: fixed`); desk is a transparent layout container so the single fixed layer shows through gutters + overscroll, while the opaque sheet/reading surface stays clean. Swap whole site pattern by repointing `--bg-texture` at another `--tex-*`; `none` disables.
- **`--section-alt`** (`sand-100` / dark `sand-800`) — secondary content tone for alternating marketing section bands, deliberately **not** the white chrome color so a band never reads as header/footer.
- **`--sidebar-active`** — sidebar active-rect fill: light = `--clay-soft`, dark = `--clay-deep`.
- **`--destructive-warm` / `--danger-warm`** — warm clay-leaning red for sign-out / soft-destructive affordances (sidebar sign-out), distinct from pure `--destructive`.
- **Chrome tones** — `SiteHeader` + `SiteFooter` are `bg-card` (white / dark `sand-925`); sheet body is `bg-background` (`sand-50` / dark `sand-950`), darker than `card` in both themes, so cards lift off it.

**Layout: desk + sheet (2026-06-05).** Every page renders as one centered `bg-card` sheet on a warm accent desk (`--canvas`, light = sand-200 / dark = sand-950) carrying a faint static texture (`--bg-texture`, on `html`) — depth felt, not seen. Inspired by the content-first study references below. Sheet has hairline side borders on wide viewports; full-bleed on mobile. System details in [FRONTEND.md](FRONTEND.md) (Shell + brand tokens).

**Starting brief for that session:** warm, trustworthy, approachable-but-professional, outdoorsy hint (dog-walking / house-sitting). Photography-forward (Gallery, About). Not flashy. Mobile-first.

**Shell + component kit.** Marketing pages compose the shell system — `PageContainer` / `PageHeader` + the shadcn/ui kit — for consistent layout + spacing. Home + about share a photographic hero (`public/bg/`); Gallery renders real photography from `public/gallery/` in masonry with a lightbox.

**Cal's design study references** (**study, not fork**): `about.readthedocs.com`, `gwern.net`, `write.as`. Common thread — content-first, strongly typographic, low-chrome, document-like reading surfaces. Restrained, text-forward over flashy marketing; reconcile with photography-forward Gallery/About once concrete type + palette set.

## Route map

Next.js App Router, three route groups. Auth-session refresh **and** the auth + onboarding gate live in middleware (`src/proxy.ts` → `src/lib/supabase/proxy.ts`): reads canonical pathname, redirects users whose `onboarding_status` ≠ `approved` to /onboarding; group layouts keep only a thin auth backstop. `role` guards sit at group layouts. Architecture rules in [ENGINEERING.md](ENGINEERING.md).

| Route                                 | Group     | Access                        | Notes                                                                                                                                               |
| ------------------------------------- | --------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                   | marketing | public                        | Home / landing                                                                                                                                      |
| `/about`                              | marketing | public                        | Blurb + references                                                                                                                                  |
| `/services`                           | marketing | public                        | Services, rates, and booking chooser hub                                                                                                            |
| `/gallery`                            | marketing | public                        | Photo grid (`next/image`)                                                                                                                           |
| `/reviews`                            | marketing | public                        | Published reviews only                                                                                                                              |
| `/resources`                          | marketing | public                        | Info + links                                                                                                                                        |
| `/contact`                            | marketing | public                        | Inquiry / contact form                                                                                                                              |
| `/book`                               | marketing | public                        | Permanent compatibility redirect to `/services`                                                                                                     |
| `/book/[serviceSlug]`                 | marketing | public view, **auth to book** | Calendar-first per-service booking; deferred-auth gate; `meet-greet` redirects to /onboarding                                                       |
| `/login`, `/signup`, `/auth/callback` | auth      | public                        | Supabase Auth                                                                                                                                       |
| `/onboarding`                         | account   | client                        | Stateful gate wizard: profile + emergency form → schedule meet & greet inline (collapses to a status card; reschedule re-opens it) → await approval |
| `/account`                            | account   | client                        | Profile (name / email / phone / avatar / password)                                                                                                  |
| `/account/pets`                       | account   | client                        | Pets CRUD (species, photo)                                                                                                                          |
| `/account/forms`                      | account   | client                        | Emergency + service-form status                                                                                                                     |
| `/account/bookings`                   | account   | client                        | Upcoming, history, amount owed, pay / prepay                                                                                                        |
| `/account/inquiries`                  | account   | client                        | Client's own inquiries: searchable, paginated; read/edit (while unanswered)/resolve in a popup. Shares components with `/admin/inquiries`           |
| `/admin/availability`                 | admin     | admin                         | Calendar: create/resize/block-out windows + manage day's bookings                                                                                   |
| `/admin/bookings`                     | admin     | admin                         | Booking calendar + approvals                                                                                                                        |
| `/admin/services`                     | admin     | admin                         | Edit services + rates                                                                                                                               |
| `/admin/settings`                     | admin     | admin                         | Origin swap, distance threshold, booking hours, lead time                                                                                           |
| `/admin/reviews`                      | admin     | admin                         | Moderate submissions                                                                                                                                |
| `/admin/clients`                      | admin     | admin                         | Client directory + detail; onboarding status dropdown (Pending/Approved/Declined), inline in list + detail                                          |
| `/admin/inquiries`                    | admin     | admin                         | Inquiry queue + reply handoff; shares the `src/features/inquiries/components/` set with `/account/inquiries` (read-only of client text)             |

Full in-app admin so Cal never touches the Supabase dashboard. `/admin/availability` uses the `<Scheduler>` family (ADMIN capabilities preset) to manage windows: pick a day to create a window (Denver wall-time inputs), resize or block-out existing windows (block-out cancels overlapping bookings, keeping the confirm step), overlay that day's bookings (enriched busy: client name + pet photos). Selecting a booking opens a side panel to cancel, approve/decline a `pending_approval`, or mark a `confirmed` booking `no_show` — all via existing booking/approval cores; mutations `router.refresh()` the server-loaded windows + busy.

**Booking flow + deferred-auth gate.** `/services` is the public chooser hub; each active service card opens `/book/[serviceSlug]`, where the `<Scheduler>` family (BOOKING capabilities preset) drives selection — **month-range** (check-in/out dates) for house-sitting, **month→day-timeline** (`week-slots` mode) for hourly services: month picks the day, then a duration-accurate single-day timeline picks/types the start time. Live receipt auto-updates as selection changes (no "Get quote" button). Anyone may browse + pick; sign-in deferred to the **Book action**. A guest who clicks Book → `/login?returnTo=…`, a signed-in-but-un-onboarded user → `/onboarding?returnTo=…`; on success they land back on their exact selection. `returnTo` encodes the selection (slug in path; resolved start/end ISO + assigned pet ids in query), validated by a same-origin open-redirect guard (relative, must start `/book/`). `createBooking` keeps its own server-side `redirect("/login")` backstop. Pet-aware services (house-sitting, walk) assign **real pets** from the profile; dog/cat counts derived server-side from the assignment, never typed in.

Shared booking-form leaf components (`PetAssignment`, `QuantityForm`, `QuotePanel`) live in `src/features/booking/_components/`, consumed by both the book flow and (soon) the account self-edit route.

**Onboarding gate (meet & greet).** Booking gated on `profiles.onboarding_status` (see Data model). `createBookingCore` is the authoritative server-side gate: `approved` client may book any active service; `meet_greet_pending` may book **only** the free `meet-greet` service (one at a time); `info_pending` / `declined` book nothing — blocked submits return `onboarding_incomplete`. Book page mirrors this with per-state panels (`needs-info` / `needs-meet-greet` / `declined`). New clients finish the intro form (→ `meet_greet_pending`), book + attend an in-person meet & greet; Cal then **manually approves** from `/admin/clients/[id]` (any-direction override; confirm warns if approving before the visit's scheduled time).

## Data model

Supabase Postgres. Auth via Supabase `auth.users` (username / password **not** app columns). `client_id` = `auth.uid()`; Cal is `role='admin'`. Money = integer **cents**. RLS deny-by-default. Core logic (distance, quote, availability-overlap, booking state) lives in `features/*` as **pure functions**, IO at the edges ([ENGINEERING.md](ENGINEERING.md) #5); vendors (Stripe, geocoding) behind adapters (#4).

**Tables** (column → purpose):

- **`profiles`** (1:1 `auth.users`) — `id` (=auth.uid) · `full_name` · `email` · `phone` · `avatar_url` (single now; gallery later) · `address`, `zip` · `lat`, `lng` (geocoded once at signup) · `kiche_allowed` (set at first booking → discount) · `onboarding_status` (enum `info_pending` → `meet_greet_pending` → `approved`, plus `declined`; the booking gate = `approved`. `info_pending` finishing the intro form advances to `meet_greet_pending`; `approved` / `declined` are **admin-set** by Cal after the in-person meet & greet, any-direction override. Replaces the former `onboarding_complete` boolean) · `role` ('client' \| 'admin') · `created_at`.
- **`pets`** (was `dogs`) — `id` · `client_id`→profiles · `name` · `species` ('dog' \| 'cat') · `breed` · `photo_url` (optional; object path in the private `pet-photos` storage bucket, served via short-lived signed URLs) · `notes` · structured identity columns (all **text**, owner-entered freeform): `age`, `sex`, `spayed_neutered` (bool), `weight`, `vet_name`, `vet_phone`, `vet_address`, `emergency_vet` · `created_at`. Rich per-pet medical / behavior / feeding narrative lives in a pet-scoped `form_responses` row (`form_key='pet'`), not wide columns here.
- **`booking_pets`** — join (`booking_id`→bookings, `pet_id`→pets, PK both). Which specific pets are on a booking. Written by service role at booking creation; clients read their own. Pricing derives counts from assigned pets, snapshots into `quote_inputs`.
- **`services`** — `id` · `slug` · `name` · `description` · `pricing_type` ('house_sitting' \| 'check_in' \| 'walk' \| 'training') · `pricing_config` (jsonb — Cal-editable rates/surcharges, validated by a per-type Zod schema) · `default_duration_min` · `max_pets` (capacity; training = 1) · `concurrency` ('exclusive' \| 'resident' — house-sitting = resident) · `form_key` (nullable → service-specific form) · `requires_approval` (force manual review) · `active` · `sort_order`. See **Pricing model** below.
- **`availability_windows`** — `id` · `starts_at` · `ends_at` · `note`. **Sole source of truth for when Cal is bookable** (#10); default world **closed**, Cal adds open windows. A booking must fall inside an open window _and_ within `settings.booking_open_minute..close_minute` (hard hours-of-day guard, **start and end**) and respect `min_lead_time_hours`; advance beyond `auto_confirm_horizon_days` is **pending, not refused** (only `hard_max_advance_days` refuses — see Booking state machine / Recurrence). Block-out = delete/trim a window (confirm + cancel any booking inside). `/book/[serviceSlug]` reflects live state via **Supabase Realtime** (events over polling, ENGINEERING #12). Window recurrence deferred — one-off windows for MVP.
- **`overnight_nights`** — `night` (date PK, Denver calendar; night D = Cal sleeps D → D+1) · `note` · `created_at`. Explicit per-night overnight availability for house-sitting. Admin toggles nights on/off; un-toggling a night with an active resident booking is refused (conflict returned, nothing cancelled). Public-read; all writes via service role / admin actions.
- **`settings`** (single config row Cal edits) — `origin_label` · `origin_lat`, `origin_lng` (current base; swappable Boulder / Springs) · `road_factor` (~1.3), `avg_speed_mph` (miles → driving-minutes; **travel-cost only**) · `auto_approve_threshold_miles` (~8), `hard_cutoff_miles` (~50, refuse beyond), `gate_use_road_miles` (bool, default false — gate on `miles × road_factor` instead of straight-line) — **distance approval gate, see Distance pricing** · `booking_open_minute`, `booking_close_minute` (minutes-since-midnight, hard hours-of-day guard; 390 = 6:30am, 1320 = 10:00pm; bounds **both** booking start ≥ open and end ≤ close — see `availability_windows`) · `min_lead_time_hours` · `auto_confirm_horizon_days` (~30 — within → auto-confirm; beyond → `pending_approval`), `hard_max_advance_days` (~365 — sanity outer cap, refuse beyond) · `recurrence_generation_horizon_days` (~42 — how far ahead open-ended series rows are materialized) · `recurring_discount_pct`, `recurring_min_occurrences` · `holiday_surcharge_cents`, `holiday_dates` (Cal-managed list) · `reminder_lead_hours` (~24 — email fires this long before a confirmed start) · `cancellation_full_refund_hours` (~48), `late_cancel_refund_pct` (~50), `no_show_charge_pct` (~100) — **cancellation/refund policy, see Booking state machine**. Everything here is Cal-tunable — values, not code. _(Supersedes the earlier minutes-based gate columns `auto_approve_threshold_min` / `hard_cutoff_min` and the integer `booking_open_hour` / `booking_close_hour` / `max_advance_days`.)_
- **`bookings`** — `id` · `client_id` · `service_id` · `starts_at`, `ends_at` · `series_id` (nullable FK → `booking_series`; groups a recurring set) · `comments` · `status` (state machine, below) · `payment_status` ('unpaid' \| 'paid' \| 'partially_refunded' \| 'refunded') · `distance_miles` (snapshot at quote) · `quote_inputs` (jsonb — pet counts, nights/partial, add-ons, holiday days captured at quote time) · `quote_breakdown` (jsonb — itemized result) · `discount_cents` (Kiche + recurring; Cal-adjustable) · `final_cents` · `requires_approval` (derived) · `reminder_sent_at` (nullable) · `created_at`, `updated_at`. Amount owed = `final_cents` − succeeded `payments`. `payment_status` is a **derived projection** of `payments` (single writer = Stripe webhook), never written independently (#10). No two **same-concurrency-class** bookings (`services.concurrency`) may overlap while active — enforced by a **Postgres exclusion constraint** (btree_gist over `tstzrange`, partitioned by class), not app code (ENGINEERING #11); cross-class (house-sit + short service) may overlap. Recurrence engine general (Google-Calendar-style); MVP exposes **weekly** only.
- **`form_responses`** — **entity-scoped** reusable intake profiles. `id` · `client_id` · `form_key` (five active keys: `owner`, `home_access`, `home_sitting`, `pet_care`, `pet_walk`; legacy `emergency` kept registered so old rows still validate but is no longer a required profile; legacy `home`/`pet` keys retired) · `pet_id` (nullable FK→pets `on delete cascade`; set only for pet-scoped rows: `pet_care`, `pet_walk`) · `booking_id` (nullable) · `data` (jsonb) · `submitted_at` (bumped on every submit **and** on a "Confirm up to date" action — drives staleness). Uniqueness is scope-aware: `(client_id, form_key, coalesce(pet_id, nil-uuid))`, so account profiles are one-per-client and pet profiles one-per-pet. The `scope` ('account' \| 'pet') + Zod schema per `form_key` live in `src/features/accounts/form-registry.ts` (code, validated at the edge — YAGNI, [ENGINEERING.md](ENGINEERING.md) #9). `owner` = identity/pronouns/backup/emergency contacts (account-scoped); `home_access` = door codes/alarms/wifi/parking (account-scoped); `home_sitting` = sleeping arrangements/house rules/guest policy (account-scoped); `pet_care` = medical/behavior/feeding (per-pet); `pet_walk` = route/leash/off-leash (per-pet, **dog-only** — species-gated in the requirement manifest). Bookings **require and confirm** these rather than re-collecting — see Booking requirement gate.
- **`authorizations`** — **append-only** audit trail for click-to-accept e-signatures (the Owner form's emergency-expense authorization). `id` · `client_id` · `kind` ('expense_auth') · `version` (the accepted text version) · `accepted_name` (typed legal name) · `accepted_at`. Each acceptance is a new immutable row; the booking/profile gate re-prompts only when the current `EXPENSE_AUTH_VERSION` is newer than the client's latest accepted row. Granted `select, insert` only (no update/delete) to `authenticated`.
- **`payments`** — `id` · `booking_id` · `client_id` · `stripe_payment_intent_id` · `amount_cents` · `currency` · `status` ('requires_payment' \| 'succeeded' \| 'refunded' \| 'failed') · `refunded_cents` (cumulative, cents) · `disputed_at` · `dispute_status` · `created_at`. Stripe behind `features/payments/` adapter.
- **`reviews`** — `id` · `client_id` · `author_name` (snapshot) · `rating` (1–5) · `body` · `status` ('pending' \| 'published' \| 'rejected'; `pending` remains in the enum for legacy rows only) · `created_at`. Client-submitted, **auto-published** (maintainer decision 2026-06-11); Cal moderates reactively (reject/unpublish via admin reviews).
- **`inquiries`** — public contact-form submissions. `id` · `client_id` (nullable FK→profiles; null = guest, set = signed-in submitter) · `name` · `email` · `phone` (nullable) · `subject` (nullable) · `message` · `status` ('new' \| 'resolved') · `replied_at` (nullable; stamped when Cal opens an email/SMS reply — a timestamp, not a state) · `resolved_at` (nullable) · `created_at`. RLS: **no public insert** — submissions flow only through the service-role `submitInquiry` server action (honeypot + per-email rate-limit + Zod), so callers can't forge `client_id`/`status`/timestamps or bypass guards via the REST API; owner/admin read, admin update.
- **`booking_series`** — durable rule for a weekly recurrence (so open-ended "no end" series materialize forward by a cron instead of inserting infinite rows up front). `id` · `client_id` · `service_id` · `freq` ('weekly') · `step_interval` (the rule's interval; `interval` is a Postgres keyword) · `count` (nullable) · `until` (nullable) · `open_ended` (bool — true ⇒ neither `count` nor `until`) · `template_starts_at` · `duration_min` · `quote_inputs` (jsonb — **frozen** at submit so every occurrence re-quotes identically) · `skipped_starts` (timestamptz[] — RFC 5545 EXDATE; cadence starts removed by an occurrence edit so the roll cron never refills them) · `active` · `created_at`. `bookings.series_id` FKs here. See **Recurrence** below.
- **`client_debits`** — outstanding balances that gate re-booking. `id` · `client_id` · `booking_id` · `amount_cents` · `reason` ('late_cancel' \| 'no_show') · `settled_at` (nullable) · `created_at`. Outstanding balance = Σ `amount_cents` where `settled_at is null`; positive balance **blocks new bookings** (see Booking state machine, cancellation/refund). **System/admin-set, never client-writable** (same column-guard rule as `bookings.status`).

**RLS approach (deny-by-default):**

- Per-client tables (`profiles`, `pets`, `bookings`, `form_responses`, `payments`): row readable/writable only when `client_id = auth.uid()`. `booking_pets` is readable when the joined booking is the caller's. `form_responses` pet ownership (the `pet_id` scope) is verified in the server action, not RLS — `pet_id` is only meaningful joined with the forced `client_id`. `authorizations`: client reads/inserts own, **append-only** (no update/delete grant).
- `booking_series`: client reads own; series rows created/updated by server actions + the series-roll cron under the service role (clients never write the rule directly). `client_debits`: client reads own; **admin/system write only** (debits and settlements move via admin actions, never client SQL).
- `inquiries`: **no public insert grant** — writes only via the service-role `submitInquiry` server action (honeypot + per-email rate-limit + Zod at the edge); signed-in clients read their own; admin reads and updates all.
- Public-read tables (`services`, `availability_windows`, `overnight_nights`): anon read, admin-only write. `reviews`: anon read where `status='published'`; clients insert their own (status forced `published` — auto-publish); admin updates status (reactive reject/unpublish).
- `settings`: authed read, admin write.
- **Busy-range exposure (two trust levels).** Customer calendar reads busy ranges through a service-role server action projecting **only** start/end + pet thumbnails (species + signed photo URL) — **no owner name/id**, by construction (identity-free result type + a dedicated repo method). Admin calendar uses a separate **admin-gated** action joining owner + status for management. Pet photos live in a private bucket, served via short-lived signed URLs — intentionally client-visible (a photo is not a privacy concern); client identity is not.
- Admin (`role='admin'`) override expressed in each policy.
- **Column-level guard (security).** The client `UPDATE` policy on `profiles` whitelists only self-editable columns. `role`, `lat`, `lng`, `kiche_allowed`, and `onboarding_status` are **system/admin-set, never client-writable** — otherwise a client could `SET role='admin'` and self-promote, or `SET onboarding_status='approved'` and self-approve past the meet & greet. Likewise clients never write `bookings.status` / `final_cents` / `payment_status` or `payments` rows by SQL; those move only through server actions and the Stripe webhook under the service role.

**Assumptions & boundaries:**

- **Single provider.** One Cal; no `provider_id`. Adding helpers later is a multi-provider migration (thread `provider_id` through `availability_windows` + `bookings`).
- **Single timezone.** Store UTC; render `America/Denver` (Cal's region). Revisit only if Cal works across zones.
- **Cal tunes values, devs add types.** `/admin` edits rates, settings, and a service's configured amounts. Adding a new `pricing_type`, `concurrency` class, or service-specific form is a code change (closed enums + typed Zod) — by design, not a gap.

## Local data seeding

`supabase/seed.sql` creates the local admin login (`admin@local.test` / `password123`) on every `npx supabase db reset` (local-only; seeds never run on prod). Named DB states: `npm run db:seed -- <scenario>` — `fresh`, `busy-week`, `payment-states`, `admin-demo` (sets `form_key='emergency'` on walk, exercising the forms-gate state). Wipe-first + deterministic; the seeder refuses non-local URLs; services + settings stay migration-owned. All seeded users share the admin password. Design: [SP2 spec](superpowers/specs/2026-06-10-db-seeding-design.md). Each later SP extends scenarios for the states it changes (roadmap standing rule).

## Pricing model

Pricing is **rule-based per service**, not flat. Each `services` row carries a `pricing_type` + a Cal-editable `pricing_config` (jsonb, validated by a per-type Zod schema). A pure `features/pricing/quote()` dispatches on `pricing_type` → returns an itemized breakdown; distance travel-factor + discounts apply as modifiers on top. Every amount is config, so Cal tunes rates in `/admin/services` + `/admin/settings` with **no code change** ([ENGINEERING.md](ENGINEERING.md) #5 pure logic, #4 config at edges). The four `pricing_type`s are the real domain cases, not speculative abstraction.

**Service types + seed rates** (Cal's stated values — tunable):

| Service       | `pricing_type`  | Rate shape (seed)                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| House Sitting | `house_sitting` | **One base rate by pet priority** (dog > cat): $50/night if any dog present, else $30/night (cat-only). Every non-base pet is a per-night surcharge: +$15/night per extra dog, +$10/night per cat (e.g. 1 dog + 1 cat = $60/night). +$10/day if a dog can't be left alone 6 h; 45 min/day of walks included, +$5/day per extra 15 min; +$10/day holiday. "Night" = 24 h; partial = % of 24 h.             |
| Check-ins     | `check_in`      | $30/hour incl. driving time, **$15 minimum**; pet count not a factor.                                                                                                                                                                                                                                                                                                                                     |
| Walks         | `walk`          | $25/hour + $10/dog (behavior; Cal may discount well-behaved).                                                                                                                                                                                                                                                                                                                                             |
| Training      | `training`      | $35/hour, **one dog at a time** (`max_pets` = 1).                                                                                                                                                                                                                                                                                                                                                         |
| Meet & Greet  | `meet_greet`    | **Free** ($0), `concurrency='exclusive'`, onboarding-only. A required in-person introduction booked + attended before a new client's first paid booking; not offered to already-approved clients as a paid service. **Not publicly listed** (excluded from `/services`) and scheduled only inside the onboarding wizard — there is no public `/book/meet-greet`. See **Onboarding gate** under Route map. |

**Modifiers** (after base; all configurable):

- **Travel (driving time)** — round-trip estimated driving minutes × service's hourly rate, added for hourly services (check-in / walk / training); see _Distance pricing_ for estimate + approval gate. House-sitting travel = config (default off; open Cal Q).
- **Recurring discount** — −10% when a recurrence **series** has ≥ `recurring_min_occurrences` bookings (seed 3) of walks, check-ins, or training; house-sitting qualifies only on **3+ distinct stays** in the series (nights within one stay don't count). Multi-service "cart" grouping deferred — **one booking per submit** at MVP, so this discount is series-based. **Frozen at booking time:** cancelling below the threshold doesn't retro-revoke.
- **Kiche discount** — gated **per booking** by two flags: `kiche_welcome` (client consent, set in the booking Details step, default true — never affects price) and `kiche_applied` (Cal's admin decision that Kiche is coming). **Applied by Cal, never automatic.** Client agrees to full price; when Cal applies it she gives 25% (walks) / 20% (house-sitting) → reduces `final_cents` (partial refund if already prepaid). The per-account `profiles.kiche_allowed` flag is **deprecated** (column retained, no admin toggle, not read by pricing). A "nice surprise," per Cal. Percentages live in each service's `pricing_config`.

**Computation order** — pure + deterministic, round to nearest cent per line: base + per-pet / add-on surcharges → travel → recurring −10% (if series qualifies) → Kiche % (applied later by Cal). Persisted as `quote_breakdown` (itemized lines) + `final_cents` (total).

## Booking state machine

Pure function `transition(state, event, ctx) → state | error` in `features/booking/` — no IO inside. **Quote is not a state**: distance + quote (`quote_breakdown` / `final_cents`) computed synchronously at submit. **Prepay is optional, decoupled from validity** — a booking is valid on _approval_, not payment; payment tracked on `payment_status`, can happen at booking (prepay) or later (amount-owed). **Reminder is not a state**: side-effect (Resend email N hours before a `confirmed` start; `reminder_sent_at` flag; SMS deferred).

```
submit ─┬ requires_approval? yes ─▶ pending_approval
        └ no  (auto-approve)  ─────▶ confirmed

pending_approval ── approve ──▶ confirmed
pending_approval ── decline ──▶ declined            (terminal)
confirmed ── end time reached ─▶ completed           (terminal, auto)
confirmed ── no-show (Cal marks) ─▶ no_show          (terminal; writes a client_debits row)
pending_approval | confirmed ── cancel ─▶ cancelled  (terminal; refund per policy below)
```

- `requires_approval` is **derived as the OR of three signals**: (1) the **distance** gate decision is manual (miles > `auto_approve_threshold_miles`); (2) the **time** gate decision is pending (`starts_at` beyond `auto_confirm_horizon_days` from now); (3) the service is flagged (`requires_approval`). A **refuse** from either gate (miles > `hard_cutoff_miles`, or beyond `hard_max_advance_days`) short-circuits the submit. Derivation is **per-occurrence** — a recurring series can straddle the time horizon (near occurrences auto-confirm, far ones pend; see Recurrence).
- **Slot held from submit onward** through any non-terminal state — no TTL, no expiry. Releases only on `declined` / `cancelled`.
- `completed` is automatic once end time passes (scheduled job).
- Stripe webhook is the **sole writer** of `payment_status` (a projection of `payments`); never changes `status`.
- **Kiche discount** applied by Cal (admin) → reduces `final_cents`; partial refund if already prepaid.
- **Client-initiated cancel** allowed, governed by the **cancellation / refund policy** below.
- Payment model is **deposit-ready**: a future mandatory-deposit + forfeit-on-late-cancel slots in via partial `payments` rows — no schema rework. MVP = prepay optional, full amount, **pay-later default**.

**Cancellation / refund policy** (all values Cal-tunable in `settings`):

- **Cutoff = `cancellation_full_refund_hours` (~48 h) before start.** Cancel **at or before** cutoff → **full** refund of whatever was paid (auto). Cancel **inside** cutoff → **`late_cancel_refund_pct`** (~50%) refund by default, **flagged for Cal** to optionally grant the remaining (full) refund via an admin action.
- **Refund issuance keeps the single-writer rule.** Cancel path **initiates** the refund through the `payments` adapter (`StripeGateway.refund`); the **Stripe webhook stays the sole writer of `payment_status`** (re-projects to `refunded` on `charge.refunded`). Cancel path never writes `payment_status` directly (#10).
- **Partial-refund state is modeled:** a full prepay that gets a `late_cancel_refund_pct` (~50%) refund leaves a `succeeded` `payments` row with `refunded_cents` set and projects to `partially_refunded` — the retained half is representable. (Was previously claimed impossible; corrected with SP4b's `refunded_cents` re-model.)
- **Debt gate.** Cancelling **unpaid inside the cutoff** (or a Cal-marked **no-show**) writes a `client_debits` row for what's owed (`late_cancel_refund_pct` / `no_show_charge_pct` of `final_cents`). An unpaid cancel **at/before** the cutoff owes nothing — free cancellation honored regardless of prepay. Any **unsettled** balance **blocks new bookings** until cleared (Cal marks settled offline, or client pays); gate checked **server-side** in the shared booking-artifacts path, so both quote preview and create call block. The series-roll cron also stops promoting a debtor's future occurrences.
- **No-show is a Cal admin action**, not automatic — the completion cron can't tell "no-showed" from "served, will pay later." `confirmed → no_show` (terminal) writes the debit.

**In-place edit (mutation spine).** A non-terminal booking may be edited in place (time / pets / quantities / comments) via `editBookingCore`, parameterized by a `MutationPolicy` (client = all gates enforced; admin = warn-don't-block override, derived from the verified session role in the action layer, never the payload). Editing **re-quotes** (unpaid only — a paid booking locks price-affecting fields, returning `price_locked`) and **re-derives approval**, so a `confirmed` booking can return to `pending_approval`. A client may not self-edit inside the `cancellation_full_refund_hours` cutoff (mirrors the cancel-fee gate); admin overrides. Editing a series occurrence **detaches** it (`series_id → null`) and records its original cadence start in `booking_series.skipped_starts` so the roll cron never refills the slot. Service-swap is **not** an edit (cancel + rebook). Edit path **never touches Stripe**. _(Existing `rescheduleBookingCore` — time-only, price-preserving — retained for the meet-greet onboarding flow; unifying it under `editBookingCore` deferred so the onboarding gate doesn't reject a meet-greet reschedule.)_

## Recurrence

Engine is general (Google-Calendar-style); **MVP exposes weekly only**, with either a **fixed number of weeks** (`count`) or **open-ended** ("no end", `open_ended`). The booking system **never officially books past ~1 month** out:

- At submit, a `booking_series` row is written (rule + frozen `quote_inputs`); occurrences materialized only up to `recurrence_generation_horizon_days` (~42). Each occurrence's status derived per-occurrence (see Booking state machine): within `auto_confirm_horizon_days` → `confirmed`; beyond → `pending_approval`.
- A daily **series-roll cron** (sibling of the reminder / completion crons) does two jobs: **promote** `pending_approval` occurrences to `confirmed` as they cross into the confirm horizon (re-checking availability + the no-overlap constraint; a now-conflicting slot stays pending and is flagged for Cal, never silently dropped), and **extend** open-ended series by materializing newly-in-horizon occurrences. Skips a debtor's occurrences (see cancellation/refund debt gate).
- This single horizon mechanism also covers **far one-off bookings**: a booking beyond the confirm horizon sits `pending_approval`, auto-confirms when it enters the horizon (Cal can decline during the window).

## Open questions for Cal

Running list, updated as Cal answers. Most are **tunable config**, not blockers — schema/logic built to absorb values later (see [WORKFLOW.md](WORKFLOW.md) dev loop).

**Resolved (recorded above):**

- **Services + rates** — house-sitting / check-ins / walks / training seed rates (Pricing model).
- **House-sitting base** — single base rate by pet priority (dog > cat); other pets are surcharges (dog + cat = $60/night).
- **Discounts** — Kiche 25% walks / 20% house-sitting, Cal-applied surprise; recurring −10% for ≥3 bookings (house-sitting: 3+ distinct stays), series-based at MVP.
- **Distance** — gate on **miles** (~8 mi → ask Cal, ~50 mi → refuse; straight-line for now, switchable to road distance); driving-**time** billed at service hourly rate. Values tunable (Distance pricing).
- **Concurrency** — house-sit may overlap short services; same class never overlaps (exclusion constraint).
- **Booking flow** — one booking per submit at MVP (no multi-item cart).
- **Booking rules** — hours 6:30am–10:00pm (start & end within), min lead time unchanged, advance → soft `auto_confirm_horizon_days` (~1 month; beyond → pending, not refused) with a `hard_max_advance_days` sanity cap. Tunable.
- **Reminder timing** — 24 h before a confirmed start (`reminder_lead_hours`). Tunable.
- **Prepay** — full amount, **pay-later default**, prepay optional.
- **Cancellation / refund** — full refund ≥48 h out; <48 h → 50% (Cal may grant full); unpaid late cancel / no-show → debt that blocks re-booking until settled. Values tunable (Booking state machine).
- **Recurrence breadth** — weekly only at MVP; fixed week-count **or** open-ended via the rolling ~1-month materialization horizon (Recurrence). General engine retained underneath.
- **Per-dog fields** — `notes` covers vet / meds / feeding for now; structured fields planned (below). Tunable.

**Still open (Cal working on it):**

1. **House-sitting travel** — does a house-sit add a travel cost (flat trip fee?) or none? Driving-time billing defined for hourly services only.
2. **Form fields** — initial set received (Forms below); rest still coming. Per-dog vs per-property/booking split to confirm once set firms up.
3. **Structured per-dog fields** — Cal drafting vaccination, meds, vet contact, feeding; `dogs.notes` jsonb absorbs them now, structured columns once finalized.
4. **Threshold tuning** — `road_factor`, `avg_speed_mph`, exact miles/horizon/refund values. Cal-settable; defaults seeded.

**Genuinely open design question (per Alex):**

- **Deposit / prepay system** — MVP = optional full prepay + the cancellation/refund policy above. Future likely: mandatory deposit as security + forfeit-on-late-cancel. Payment model built deposit-ready; the _policy_ beyond MVP is undecided.

**Assumption to confirm:** forms stay developer-edited (typed Zod) at launch — Cal doesn't get a self-serve form builder yet (storage already future-proof for one).

### Intake profiles & the booking requirement gate

Cal's service-shaped intake forms are **normalized into five reusable profiles** rather than re-collected per booking. Each is a `form_responses` row keyed by `form_key` + scope (see Data model). `FORMS.md` (repo root) is Cal's raw, owner-written source; it is requirements to normalize, not a schema.

**Five active form keys:**

| Key            | Scope                 | Description                                             |
| -------------- | --------------------- | ------------------------------------------------------- |
| `owner`        | account               | Identity, pronouns, backup contacts, emergency contacts |
| `home_access`  | account               | Door codes, alarms, wifi, parking                       |
| `home_sitting` | account               | Sleeping arrangements, house rules, guest policy        |
| `pet_care`     | per-pet               | Medical, behavior, feeding, exercise                    |
| `pet_walk`     | per-pet, **dog-only** | Route, leash, off-leash — species-gated in the manifest |

Legacy keys: `emergency` is still registered (old rows validate) but is no longer a required profile and not surfaced on the profiles page. `home`/`pet` are retired.

**Pet-aware services.** `house_sitting`, `walk`, `check_in`, and `training` are all pet-aware (they accept assigned pets from the client's profile). Only `house_sitting` and `walk` price by pet headcount; `check_in` and `training` are hours-only. `training` accepts a single dog (`max_pets = 1`).

**Requirement manifest (code, not schema).** `REQUIRED_PROFILES` in `src/features/booking/required-profiles.ts` maps `pricing_type` → required forms: `house_sitting` → [owner, home_access, home_sitting, pet_care, pet_walk(dog)]; `check_in` → [owner, home_access, pet_care, pet_walk(dog)]; `walk` → [owner, pet_care, pet_walk(dog)]; `training` → [owner, pet_care]; `meet_greet` → [owner]. `pet_walk` carries an explicit `species: "dog"` predicate — only dog-assigned pets trigger it. Kept in code so Cal can't misconfigure required forms; `services.form_key` is legacy and no longer consulted by the gate.

**Hard-block gate.** Pure `bookingRequirements(...)` returns per-profile `complete | stale | missing`; `computeBookingArtifacts` blocks a client-policy booking (`profiles_incomplete`) until every required profile is satisfied. **Stale** = `submitted_at` older than `FRESHNESS_WINDOW_DAYS` (180); a one-click **"Confirm up to date"** bumps `submitted_at` without re-entering data. **Missing** = no row. A pet requirement is per-assigned-pet and vacuous when no pets are on the booking (pet selection is enforced separately by quantity validation). Admin-on-behalf policy warns instead of blocking. Clients complete/confirm profiles inline from the booking flow's requirements checklist or standalone at `/account/forms`; Cal can complete on a client's behalf from the admin client detail.

## Copy placeholders

> Filling these in is governed by the **copy-sync protocol** ([docs/CONTENT.md](CONTENT.md)): Cal's verbatim text captured in `docs/content/cal-source.md`, tracked in `docs/content/copy-ledger.md`, rendered from `src/content/marketing.ts`. This section remains the marker-grammar reference.

Marketing copy Cal must write is stubbed with double-square-bracket markers. Keep structure in code; Cal owns voice + substantive claims.

- **Marker:** `[[ ... ]]`. Grep with `rg "\[\["`.
- **Forms:**
  - `[[HEADER: purpose]]` — section/card/page header
  - `[[BODY: what this paragraph should cover]]` — paragraph copy
  - `[[Item N: what it is]]` — list/card/FAQ/resource stub
- **Header rules:** basic, descriptive noun phrases. No first-person, no quirky/pushy phrasing. ✗ "Pricing flexibility matters to me." → ✓ "Sliding cost scale". If unsure, write `[[HEADER: purpose]]`.
- **Body rules:** describe purpose only. No invented service claims, philosophy, or biographical detail — Cal supplies all of that.
- **Example items:** for resource/FAQ/testimonial arrays, always use stubs (`[[Resource 1: name]]`); never invent examples.
- **Locations:** Colorado only. No towns/cities/neighborhoods in copy, alt text, or addresses.
- **Don't assume Cal's services or audience-facing voice** — overnight stays, meet-and-greets, cat care, medication handling, sliding-scale philosophy, background, etc. all placeholdered until Cal confirms.
- **Public emergency resources** (ASPCA poison line, 24/7 vet ER) OK as real entries — verifiable, not a claim about Cal. **Generic local resources** (humane society, dog park) → stub.

---

_Last reviewed: 2026-06-16_ (split intake forms: five active keys `owner`, `home_access`, `home_sitting`, `pet_care`, `pet_walk`; `pet_walk` dog-only; pet-aware services listed with headcount-vs-hours pricing distinction; requirement manifest updated; legacy `home`/`pet` keys retired)
_Earlier: 2026-06-10_ (meet & greet onboarding gate: `onboarding_status`, `meet_greet` service; meet-greet de-listed + scheduled inline in onboarding, `/book/meet-greet` retired, admin status dropdown; added `booking_series.skipped_starts` EXDATE column; in-place booking-edit spine: `editBookingCore` + `MutationPolicy`)
