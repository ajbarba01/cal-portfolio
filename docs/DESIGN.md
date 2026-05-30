# Design — Project Source of Truth

> Authority for **everything project-specific**: what we're building, the stack rationale, scope, pages, brand, pricing, data model, and routes. The other docs are a portable, project-agnostic engineering framework — project facts belong here.

---

## What this is

A site at `calbarba.com` for **Cal**'s unofficial dog-walking / house-sitting business. Two products in one:

- **Portfolio** — About, Services & Rates, Gallery, Reviews, Resources.
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

**In:** availability + booking (Cal sets slots; clients see open/booked; book a service; recurring option; hour/lead-time rules); accounts + forms (profile, dogs [name/breed/optional photo], emergency form, service-specific forms, first-time onboarding gate); Stripe prepay; haversine auto-quoting.
**Reframed:** sliding scale → a CTA on Services & Rates, not its own feature.
**Deferred:** SMS reminders (Twilio), Google Calendar sync (Cal wants manual control), Mapbox drive-time accuracy.

## Distance pricing (zero ongoing cost)

Distance feeds **two** things: an approval gate and a driving-time cost.

- Cal's **origin is a configurable setting** (Boulder / Springs / etc) — a row Cal edits.
- **Geocode each client once** at signup: ZIP → lat/lng from a free bundled US ZIP-centroid dataset (NBER / zipcodeR, offline) or one free geocode call. Store `lat`/`lng`. Geocoding is a **vendor adapter** in `features/pricing/`, swappable for a real geocoder later (ENGINEERING #4).
- **Pipeline:** pure `lib/haversine.ts` (miles, math only — ENGINEERING #2) → × `road_factor` → ÷ `avg_speed_mph` → **estimated one-way driving minutes**. All three constants Cal-tunable; the whole estimate is one module, swappable for Mapbox drive-time later. No per-booking API call, no recurring cost.
- **Approval gate:** est. driving time > `auto_approve_threshold_min` (Cal: ~1 h) → manual approval; > `hard_cutoff_min` → refuse.
- **Cost — driving time is billed.** Round-trip driving time × the service's hourly rate, added for hourly services (a check-in = `(on-site + round-trip drive) × $30/h`, per Cal's "including driving time"). House-sitting travel cost is an open Cal Q (flat trip fee vs none).

## Brand / visual direction

Cal's stated intent: **"simple and straightforward."** No brand assets yet (no logo, palette, or fonts). Concrete palette + typography are set later in a **Claude Design** session (separate quota), onboarded on this repo so it reuses `design-tokens.ts` + existing components. Anti-generic, accessibility, and token rules live in [FRONTEND.md](FRONTEND.md) — not restated here.

**Starting brief for that session:** warm, trustworthy, approachable-but-professional, with an outdoorsy hint (dog-walking / house-sitting). Photography-forward (Gallery, About). Not flashy. Mobile-first.

## Route map

Next.js App Router, three route groups. Auth-session refresh lives in `src/proxy.ts`; session + `role` guards sit at the group layouts. Architecture rules in [ENGINEERING.md](ENGINEERING.md).

| Route                                 | Group     | Access                        | Notes                                                     |
| ------------------------------------- | --------- | ----------------------------- | --------------------------------------------------------- |
| `/`                                   | marketing | public                        | Home / landing                                            |
| `/about`                              | marketing | public                        | Blurb + references                                        |
| `/services`                           | marketing | public                        | Rates **+ sliding-scale CTA**                             |
| `/gallery`                            | marketing | public                        | Photo grid (`next/image`)                                 |
| `/reviews`                            | marketing | public                        | Published reviews only                                    |
| `/resources`                          | marketing | public                        | Info + links                                              |
| `/book`                               | marketing | public view, **auth to book** | Calendly-style availability; core scheduling flow         |
| `/login`, `/signup`, `/auth/callback` | auth      | public                        | Supabase Auth                                             |
| `/onboarding`                         | account   | client                        | First-time gate: profile + emergency form before booking  |
| `/account`                            | account   | client                        | Profile (name / email / phone / avatar / password)        |
| `/account/dogs`                       | account   | client                        | Dogs CRUD                                                 |
| `/account/forms`                      | account   | client                        | Emergency + service-form status                           |
| `/account/bookings`                   | account   | client                        | Upcoming, history, amount owed, pay / prepay              |
| `/admin/availability`                 | admin     | admin                         | Input open windows; block-out with cancel-confirm         |
| `/admin/bookings`                     | admin     | admin                         | Approve manual-approval requests                          |
| `/admin/services`                     | admin     | admin                         | Edit services + rates                                     |
| `/admin/settings`                     | admin     | admin                         | Origin swap, distance threshold, booking hours, lead time |
| `/admin/reviews`                      | admin     | admin                         | Moderate submissions                                      |
| `/admin/clients`                      | admin     | admin                         | (optional) Client list                                    |

Full in-app admin so Cal never touches the Supabase dashboard.

## Data model

Supabase Postgres. Auth via Supabase `auth.users` (username / password are **not** app columns). `client_id` = `auth.uid()`; Cal is `role='admin'`. Money stored as integer **cents**. RLS is deny-by-default. Core logic (distance, quote, availability-overlap, booking state) lives in `features/*` as **pure functions**, IO at the edges ([ENGINEERING.md](ENGINEERING.md) #5); vendors (Stripe, geocoding) sit behind adapters (#4).

**Tables** (column → purpose):

- **`profiles`** (1:1 `auth.users`) — `id` (=auth.uid) · `full_name` · `email` · `phone` · `avatar_url` (single now; gallery later) · `address`, `zip` · `lat`, `lng` (geocoded once at signup) · `kiche_allowed` (set at first booking → discount) · `onboarding_complete` (booking gate — single setter: flips true when the onboarding flow finishes; criteria = required profile fields + emergency form present) · `role` ('client' \| 'admin') · `created_at`.
- **`dogs`** — `id` · `client_id`→profiles · `name` · `breed` · `photo_url` (optional) · `notes` (extra per-dog fields — see Cal Q8) · `created_at`.
- **`services`** — `id` · `slug` · `name` · `description` · `pricing_type` ('house_sitting' \| 'check_in' \| 'walk' \| 'training') · `pricing_config` (jsonb — Cal-editable rates/surcharges, validated by a per-type Zod schema) · `default_duration_min` · `max_pets` (capacity; training = 1) · `concurrency` ('exclusive' \| 'resident' — house-sitting = resident) · `form_key` (nullable → service-specific form) · `requires_approval` (force manual review) · `active` · `sort_order`. See **Pricing model** below.
- **`availability_windows`** — `id` · `starts_at` · `ends_at` · `note`. **Sole source of truth for when Cal is bookable** (#10); default world is **closed**, Cal adds open windows. A booking must fall inside an open window _and_ within `settings.booking_open_hour..close_hour` (hard hours-of-day guard) and respect `min_lead_time_hours` / `max_advance_days`. Block-out = delete/trim a window (confirm + cancel any booking inside). `/book` reflects live state via **Supabase Realtime** (events over polling, ENGINEERING #12). Window recurrence deferred — one-off windows for MVP.
- **`settings`** (single config row Cal edits) — `origin_label` · `origin_lat`, `origin_lng` (current base; swappable Boulder / Springs) · `road_factor` (~1.3), `avg_speed_mph` (miles → driving-minutes) · `auto_approve_threshold_min` (~60), `hard_cutoff_min` (refuse beyond) · `booking_open_hour`, `booking_close_hour` (hard hours-of-day guard on booking start — see `availability_windows`) · `min_lead_time_hours` · `max_advance_days` · `recurring_discount_pct`, `recurring_min_occurrences` · `holiday_surcharge_cents`, `holiday_dates` (Cal-managed list). Everything here is Cal-tunable — values, not code.
- **`bookings`** — `id` · `client_id` · `service_id` · `starts_at`, `ends_at` · `series_id` (nullable; groups a recurring set) · `comments` · `status` (state machine, below) · `payment_status` ('unpaid' \| 'paid' \| 'refunded') · `distance_miles` (snapshot at quote) · `quote_inputs` (jsonb — pet counts, nights/partial, add-ons, holiday days captured at quote time) · `quote_breakdown` (jsonb — itemized result) · `discount_cents` (Kiche + recurring; Cal-adjustable) · `final_cents` · `requires_approval` (derived) · `reminder_sent_at` (nullable) · `created_at`, `updated_at`. Amount owed = `final_cents` − succeeded `payments`. `payment_status` is a **derived projection** of `payments` (single writer = Stripe webhook), never written independently (#10). No two **same-concurrency-class** bookings (`services.concurrency`) may overlap while active — enforced by a **Postgres exclusion constraint** (btree_gist over `tstzrange`, partitioned by class), not app code (ENGINEERING #11); cross-class (house-sit + short service) may overlap. Recurrence engine is general (Google-Calendar-style); MVP exposes **weekly** only.
- **`form_responses`** — `id` · `client_id` · `form_key` ('emergency' \| service slug) · `booking_id` (nullable; emergency form isn't booking-tied) · `data` (jsonb) · `submitted_at`. Forms are expected to change over time. For MVP, definitions live in a `features/forms/` registry of typed **Zod schemas in code** validating `data` at the edge (YAGNI / rule-of-three, [ENGINEERING.md](ENGINEERING.md) #9). The `data` jsonb already accommodates a future Cal-editable form builder with **no storage change** — only the definition source (code → DB) would move. _Assumption: Cal doesn't need self-serve form editing at launch; flag if wrong._
- **`payments`** — `id` · `booking_id` · `client_id` · `stripe_payment_intent_id` · `amount_cents` · `currency` · `status` ('requires_payment' \| 'succeeded' \| 'refunded' \| 'failed') · `created_at`. Stripe behind `features/payments/` adapter.
- **`reviews`** — `id` · `client_id` · `author_name` (snapshot) · `rating` (1–5) · `body` · `status` ('pending' \| 'published' \| 'rejected') · `created_at`. Client-submitted, Cal-moderated.

**RLS approach (deny-by-default):**

- Per-client tables (`profiles`, `dogs`, `bookings`, `form_responses`, `payments`): row readable/writable only when `client_id = auth.uid()`.
- Public-read tables (`services`, `availability_windows`): anon read, admin-only write. `reviews`: anon read where `status='published'`; clients insert their own (status forced `pending`); admin updates status.
- `settings`: authed read, admin write.
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
pending_approval | confirmed ── cancel ─▶ cancelled  (terminal; manual refund if paid)
```

- `requires_approval` is derived: `distance_miles > settings.auto_approve_threshold_miles` **or** the service is flagged.
- **Slot is held from submit onward** through any non-terminal state — no TTL, no expiry. Releases only on `declined` / `cancelled`.
- `completed` is automatic once end time passes (scheduled job).
- Stripe webhook is the **sole writer** of `payment_status` (a projection of `payments`); it never changes `status`.
- **Kiche discount** is applied by Cal (admin) → reduces `final_cents`; partial refund if already prepaid.
- **Client-initiated cancel** is allowed; refund is issued **manually by Cal via admin** for MVP (auto-refund + cancellation-fee a later addition).
- Payment model is **deposit-ready**: a future mandatory-deposit + forfeit-on-late-cancel slots in via partial `payments` rows — no schema rework. MVP = prepay optional, full amount.

## Open questions for Cal

Running list, updated as Cal answers. Most are **tunable config**, not blockers — schema/logic are built to absorb the values later (see [WORKFLOW.md](WORKFLOW.md) dev loop).

**Resolved (recorded above):**

- **Services + rates** — house-sitting / check-ins / walks / training seed rates (Pricing model).
- **House-sitting base** — single base rate by pet priority (dog > cat); other pets are surcharges (dog + cat = $60/night).
- **Discounts** — Kiche 25% walks / 20% house-sitting, Cal-applied surprise; recurring −10% for ≥3 bookings (house-sitting: 3+ distinct stays), series-based at MVP.
- **Distance** — driving-time billed at the service hourly rate; approval gate ~1 h away, refusal past a hard cutoff (values tunable).
- **Concurrency** — house-sit may overlap short services; same class never overlaps (exclusion constraint).
- **Booking flow** — one booking per submit at MVP (no multi-item cart).
- **Per-dog fields** — `notes` covers vet / meds / feeding for now; house-sitting form asks special-needs (frequent meds). Tunable.

**Still open (mostly tuning — answer fills a config value):**

1. **Threshold values** — `auto_approve_threshold_min` (~60?), `hard_cutoff_min`, `road_factor`, `avg_speed_mph`. Cal-settable.
2. **House-sitting travel** — does a house-sit add a travel cost (flat trip fee?) or none? Driving-time billing is defined for hourly services only.
3. **Booking rules** — allowed hours, min lead time, max advance. Cal-settable.
4. **Reminder timing** — how long before a booking the email fires. Cal-settable.

**Two genuinely open design questions (per Alex):**

- **Deposit / prepay system** — MVP = optional full prepay. Future likely: mandatory deposit as a security + cancellation-fee mechanism (forfeit deposit on late cancel). Payment model is built deposit-ready; the _policy_ is undecided.
- **Recurrence breadth** — goal is a general engine (Google-Calendar-style, any pattern); MVP restricts to **weekly** until requirements firm up. Scheduling system should carry most of this.

**Assumption to confirm:** forms stay developer-edited (typed Zod) at launch — Cal doesn't get a self-serve form builder yet (storage is already future-proof for one).

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

_Last reviewed: 2026-05-30_
