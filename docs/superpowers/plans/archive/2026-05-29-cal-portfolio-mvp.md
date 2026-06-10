# Cal Portfolio + Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax; completed phases are marked `- [x]` with commit SHAs on the header. Canonical copy lives at `~/.claude/plans/handoff-cal-portfolio-jolly-meteor.md`; this is the in-repo mirror.

**Goal:** Build the cal-portfolio MVP **systems-first** — versioned DB schema + RLS + no-overlap exclusion constraint, TDD pure core (distance, pricing, booking state machine, recurrence, availability), vendor adapters, then functional **wireframe** frontend wired to the real systems. No visual polish this phase (deferred to a Claude Design session per DESIGN.md "Brand / visual direction").

**Architecture:** `app/` = routing only · `features/<domain>/` = domain logic (pure core + services + adapters) · `lib/` = business-agnostic infra. Core domain math/state are pure functions, IO at the edges. Vendors behind typed interfaces. RLS deny-by-default + column-level GRANT guard. `payment_status` is a derived projection written only by the Stripe webhook. (Authority: ENGINEERING.md #1–#5, #10–#12; DESIGN.md data model.)

**Tech Stack:** Next.js 16 App Router + TS strict · Supabase (Postgres/Auth/RLS/Realtime/Storage) · Tailwind v4 + shadcn/ui · Vitest + Zod · pgTAP · Stripe · Resend · Vercel.

---

## Context

The engineering foundation is scaffolded (Next 16, Supabase SSR clients with `sb_*` keys in `src/lib/supabase/`, `src/proxy.ts` session refresh, tooling gates, Vercel-on-push). **DESIGN.md is the finalized spec** — this plan turns it into ordered, independently verifiable milestones. The deliverable this phase is **provably working backend + pure core**; the frontend is functional wireframes only (shadcn defaults, semantic HTML, semantic tokens — no palette/type decisions).

**What's missing today (the work):** no migrations, no test framework, and no `zod` / `stripe` / `resend` deps. Existing scaffold to build on: `createClient()` (server, RLS-respecting), `createServiceClient()` (secret key, RLS-bypassing, server-only), `proxy.ts` (refreshes session on every non-asset path), `design-tokens.ts` (semantic color roles + motion/breakpoints).

### DESIGN.md ambiguities flagged for Alex (do not block; default chosen)

1. **Approval-gate unit mismatch.** State-machine §"Booking state machine" says `requires_approval` derives from `distance_miles > auto_approve_threshold_miles`, but the `settings` table + distance pipeline define thresholds in **driving minutes** (`auto_approve_threshold_min`, `hard_cutoff_min`). **Default taken:** minutes (driving-time), consistent with the pipeline and the settings columns; `distance_miles` is stored only as a snapshot. Flag to Alex; trivial to flip.
2. **House-sitting travel cost** — open Cal Q (flat trip fee vs none). **Default:** off (config-gated, `house_sitting` travel modifier defaults to 0); Cal toggles later. Built ready, not on.
3. **Recurrence breadth** — Alex chose **build the general engine now** (weekly exposed in UI), matching DESIGN's stated long-term goal.

> **Note — ENGINEERING #9 removed.** Alex deleted the "avoid premature abstraction / rule-of-three" principle; building forward is now welcome. **Scope-forward forks evaluated with Alex → keep MVP scope** (form builder, multi-item cart, DB-defined pricing-rule engine all stay deferred; storage is already future-proof so each is cheap to add when actually needed). Only the general **recurrence engine** is built forward (above). Doc work owed at execution time (can't edit docs in plan mode): renumber/remove ENGINEERING.md #9 and scrub the "not speculative abstraction" / "YAGNI" / "rule-of-three" justifications in DESIGN.md (notably the forms-registry note, line ~93) in the same commit as the code that touches them.

### Cross-cutting conventions (apply every phase)

- TS strict, no `any`; parse all external/DB/form/env data with Zod at the edge (ENGINEERING #7).
- Pure core = no IO/clock/`fetch` inside; pass data in (#5). Vendors behind typed interfaces (#4).
- Money = integer **cents**. Times stored UTC, rendered `America/Denver`.
- Closed enums as TS unions + DB check constraints / Postgres enums (#8). No stringly-typed.
- Same-commit doc rule: any file add/move/delete updates DESIGN.md in the same commit. Single `main`; commit only after gates pass; stage by name.
- Each phase ends green: `npm run typecheck` + `npm run lint` + `vitest run` (+ pgTAP where relevant) before commit.

---

## Phase 0 — Tooling foundation — ✅ DONE (`c665c09`)

**Goal:** Local, reproducible test + DB environment so every later phase is verifiable.
**Systems landed:** Supabase CLI local stack (Docker), Vitest, Zod, pgTAP harness.
**Deps:** none. **Wireframe screens:** none.
**Prerequisite (note for Alex):** Docker Desktop must be running for `supabase start`.

- [x] **Add deps.** `npm i zod` ; `npm i -D vitest @vitest/coverage-v8 supabase`.
- [x] **Vitest config.** Create `vitest.config.ts` (node environment, globals on, include `src/**/*.test.ts`). Add scripts to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`.
- [x] **Smoke test.** Create `src/lib/__smoke__.test.ts` with `it('runs', () => expect(1).toBe(1))`. Run `npm test` → PASS. Delete after confirming, or keep as `lib/haversine` test home in Phase 3.
- [x] **Supabase local init.** `npx supabase init` (creates `supabase/config.toml`, `supabase/migrations/`). Confirm `supabase/.gitignore` excludes secrets.
- [x] **Start stack.** `npx supabase start` → records local API URL + keys. Verify `supabase status` shows running.
- [x] **pgTAP enable.** In the first migration (Phase 1) enable `pgtap`; create `supabase/tests/` for `*.test.sql`. Verify `npx supabase test db` discovers the dir.
- [x] **Gate + commit.** `npm run typecheck && npm run lint && npm test`. Commit `chore: add vitest, zod, and supabase local dev tooling` (update DESIGN.md/WORKFLOW only if a tool choice needs recording).

**Verification:** `npm test` green; `supabase start` healthy; `supabase test db` runs (0 tests yet).

---

## Phase 1 — Schema + RLS + exclusion constraint + seeds — ✅ DONE (`2b6fb4c`)

**Goal:** The data backbone, deny-by-default, with the no-double-booking invariant enforced **in the DB**, proven by pgTAP.
**Systems landed:** all tables (DESIGN data model), Postgres enums, RLS policies, column-level GRANT guard, btree_gist exclusion constraint, seed `settings` + `services`.
**Deps:** Phase 0. **Wireframe screens:** none.

**Files:**

- Create: `supabase/migrations/<ts>_init_schema.sql`, `<ts>_rls.sql`, `<ts>_exclusion_constraint.sql`, `<ts>_seed.sql`.
- Create tests: `supabase/tests/rls.test.sql`, `supabase/tests/exclusion.test.sql`.

- [x] **Step 1 — Extensions + enums.** `create extension if not exists btree_gist; create extension if not exists pgtap;`. Postgres enums: `user_role ('client','admin')`, `pricing_type ('house_sitting','check_in','walk','training')`, `concurrency_class ('exclusive','resident')`, `booking_status ('pending_approval','confirmed','completed','declined','cancelled')`, `payment_status ('unpaid','paid','refunded')`, `payment_txn_status ('requires_payment','succeeded','refunded','failed')`, `review_status ('pending','published','rejected')`.
- [x] **Step 2 — Tables.** Create `profiles, dogs, services, availability_windows, settings, bookings, form_responses, payments, reviews` exactly per DESIGN "Data model" (columns + types; money `integer` cents; jsonb for `pricing_config/quote_inputs/quote_breakdown/data`; `series_id uuid` nullable; `reminder_sent_at timestamptz` nullable). On `bookings`, add denormalized `concurrency concurrency_class not null` (copied from the service at insert — required because an exclusion constraint can only reference same-table columns). `profiles.id references auth.users(id)`. Add a trigger `set_updated_at` on `bookings`.
- [x] **Step 3 — Profile auto-provision.** Trigger `on auth.users insert` → insert a `profiles` row (`id=new.id`, `email`, `role='client'`, `onboarding_complete=false`). Keeps `client_id = auth.uid()` invariant.
- [x] **Step 4 — RLS enable + policies (deny-by-default).** `alter table … enable row level security` on every table. Policies per DESIGN "RLS approach":
  - Per-client (`profiles/dogs/bookings/form_responses/payments`): `using (client_id = auth.uid())` for select/insert/update/delete; admin override `or (select role from profiles where id = auth.uid()) = 'admin'`.
  - `services`, `availability_windows`: anon `select` true; write admin-only.
  - `reviews`: anon `select` where `status='published'`; client `insert` own row with `status` forced `pending` (WITH CHECK); admin `update`.
  - `settings`: authed `select`; admin `update`.
- [x] **Step 5 — Column-level guard (security).** Do **not** rely on RLS alone for self-promotion defense. Use column GRANTs: `grant update (full_name, email, phone, avatar_url, address, zip) on profiles to authenticated;` and **never** grant update on `role, lat, lng, kiche_allowed, onboarding_complete` to `authenticated`. Those move only via the service role (server actions / webhook). Mirror for `bookings`: clients get no `update` grant on `status/final_cents/payment_status`.
- [x] **Step 6 — Exclusion constraint.** On `bookings`:
  ```sql
  alter table bookings add constraint no_same_class_overlap
    exclude using gist (
      concurrency with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('pending_approval','confirmed'));
  ```
  Same-class overlap rejected while a slot is held; cross-class (`resident` house-sit vs `exclusive` short service) allowed because the equality on `concurrency` fails; terminal/past states excluded by the `where`.
- [x] **Step 7 — Seed.** Insert the single `settings` row with Cal-tunable defaults (`road_factor 1.3`, `avg_speed_mph 40`, `auto_approve_threshold_min 60`, `hard_cutoff_min 120`, `booking_open_hour 8`, `booking_close_hour 18`, `min_lead_time_hours 24`, `max_advance_days 90`, `recurring_discount_pct 10`, `recurring_min_occurrences 3`, `holiday_surcharge_cents 1000`, `holiday_dates '[]'`, a Boulder origin lat/lng). Seed the four `services` rows with DESIGN seed rates in `pricing_config` and correct `concurrency` (`house_sitting`→`resident`, others→`exclusive`; `training` `max_pets=1`).
- [x] **Step 8 — pgTAP: RLS.** `supabase/tests/rls.test.sql` — assert: anon can `select` from `services` + published `reviews` but not `bookings`; a client set via `set local request.jwt.claims` can read own `bookings` but **0 rows** of another client's; a client `UPDATE profiles SET role='admin'` **fails / changes nothing** (column guard); admin reads all.
- [x] **Step 9 — pgTAP: exclusion.** `supabase/tests/exclusion.test.sql` — inserting two overlapping `confirmed` `exclusive` bookings **throws**; an `exclusive` + a `resident` overlapping pair **succeeds**; a `cancelled` overlapping a `confirmed` **succeeds** (released).
- [x] **Step 10 — Run + commit.** `npx supabase db reset` (applies migrations + seed) then `npx supabase test db` → all green. Update DESIGN.md if any column name shifted. Commit `feat: add schema, RLS, and no-overlap exclusion constraint`.

**Verification:** `supabase test db` all pgTAP green; `supabase db reset` clean.

---

## Phase 2 — Auth, route-group guards, onboarding gate — ✅ DONE (`91d191f`)

**Goal:** Real auth + the first-time onboarding gate; group-level session/role guards.
**Systems landed:** route groups `(marketing)/(auth)/(account)/(admin)`; login/signup/callback; profile geocode-at-signup; `onboarding_complete` single-setter server action; emergency-form schema.
**Deps:** Phase 1. **Wireframe screens:** `/login`, `/signup`, `/auth/callback`, `/onboarding`.

**Files:**

- Create: `src/app/(auth)/login/page.tsx`, `/signup/page.tsx`, `/auth/callback/route.ts`.
- Create: `src/app/(account)/layout.tsx` (session + onboarding guard), `src/app/(admin)/layout.tsx` (admin-role guard), `src/app/(marketing)/layout.tsx`.
- Create: `src/app/(account)/onboarding/page.tsx`, `src/features/accounts/onboarding-action.ts`, `src/features/accounts/profile-schema.ts` (Zod), `src/features/forms/registry.ts` + `src/features/forms/emergency-schema.ts`.

- [x] **Auth pages (wireframe).** Email/password via `supabase.auth.signInWithPassword` / `signUp`; `/auth/callback` exchanges the code (`exchangeCodeForSession`). Semantic HTML form, shadcn `Input`/`Button`, keyboard-navigable.
- [x] **Group guards.** `(account)/layout.tsx`: `createClient()` → if no user → redirect `/login`; if `profiles.onboarding_complete` false and path ≠ `/onboarding` → redirect `/onboarding`. `(admin)/layout.tsx`: redirect non-`admin` to `/`. (proxy.ts already refreshes the session — guards only read it.)
- [x] **Onboarding action (single setter).** `completeOnboarding(input)` server action: Zod-validate required profile fields + emergency-form payload; under the **service role** write `lat/lng` (via geocode adapter, Phase 3 interface — stub returns origin until Phase 3 lands, tracked) + insert the `emergency` `form_responses` row + flip `onboarding_complete=true`. This is the **only** writer of `onboarding_complete` (ENGINEERING #10).
- [x] **Forms registry seed.** `features/forms/registry.ts` maps `form_key → Zod schema`; add `emergency-schema.ts`. Service-specific forms extend the registry in Phase 10.
- [x] **Integration tests.** `src/features/accounts/onboarding-action.test.ts` (Vitest, against local Supabase): unauth user redirected (guard unit); `completeOnboarding` flips the flag + writes the form; a second client cannot read the first's `form_responses` (RLS).
- [x] **Gate + commit.** `feat: add auth, route-group guards, and onboarding gate`.

**Verification:** manual `verify` — signup → forced to `/onboarding` → completing it unlocks `/account`; non-admin blocked from `/admin`; unauth redirected from both.

---

## Phase 3 — Pure distance pipeline + geocoding adapter (TDD) — ✅ DONE (`a985b89`)

**Goal:** Deterministic miles→driving-minutes estimate + approval-gate derivation; geocoding behind a swappable interface.
**Systems landed:** `lib/haversine.ts` (pure math), `features/pricing/distance.ts` (pure estimate + gate), `features/pricing/geocoding/` adapter interface + offline ZIP-centroid impl.
**Deps:** Phase 1 (settings shape). **Wireframe screens:** none.

**Files:** Create `src/lib/haversine.ts` + `.test.ts`; `src/features/pricing/distance.ts` + `.test.ts`; `src/features/pricing/geocoding/geocoder.ts` (interface), `src/features/pricing/geocoding/zip-centroid-geocoder.ts` + `.test.ts`, plus a bundled `zip-centroids.json` (free NBER/zipcodeR US centroid dataset, offline).

- [x] **Step 1 — Failing test `haversine`.**
  ```ts
  import { haversineMiles } from "./haversine";
  it("Boulder→Denver ≈ 24mi", () => {
    expect(
      haversineMiles(
        { lat: 40.015, lng: -105.27 },
        { lat: 39.739, lng: -104.99 },
      ),
    ).toBeCloseTo(24, 0);
  });
  it("identical points = 0", () => expect(haversineMiles(p, p)).toBe(0));
  ```
- [x] **Step 2 — Run → FAIL** (`haversineMiles not defined`).
- [x] **Step 3 — Implement** pure great-circle (radius 3958.8 mi), no IO. TSDoc one-liner.
- [x] **Step 4 — Run → PASS.**
- [x] **Step 5 — Failing test `distance.estimateDrivingMinutes` + `deriveApproval`.**
  ```ts
  // road_factor 1.3, avg_speed 40 → minutes = miles*1.3/40*60 (one-way)
  it("24mi one-way ≈ 47min", () =>
    expect(
      estimateDrivingMinutes(24, { roadFactor: 1.3, avgSpeedMph: 40 }),
    ).toBeCloseTo(46.8, 1));
  it("auto-approve under threshold", () =>
    expect(
      deriveApproval(46.8, { autoApproveMin: 60, hardCutoffMin: 120 }),
    ).toBe("auto"));
  it("manual between", () => expect(deriveApproval(90, thr)).toBe("manual"));
  it("refuse over cutoff", () =>
    expect(deriveApproval(130, thr)).toBe("refuse"));
  ```
- [x] **Step 6 — Run → FAIL → implement pure** `estimateDrivingMinutes(miles, cfg)` and `deriveApproval(minutes, cfg): 'auto'|'manual'|'refuse'` (named-constant boundaries; `>` semantics per DESIGN) → **PASS**.
- [x] **Step 7 — Geocoder interface.** `interface Geocoder { geocode(zip: string): Promise<LatLng | null> }`. App depends on the interface (ENGINEERING #4).
- [x] **Step 8 — TDD offline impl.** Test: known ZIP → expected centroid (±tolerance); unknown ZIP → `null`. Implement `ZipCentroidGeocoder` reading the bundled JSON. Wire it into Phase 2's onboarding action (replace stub; remove the tracked TODO).
- [x] **Step 9 — Commit** `feat: add pure distance pipeline and offline ZIP geocoder`.

**Verification:** `vitest run src/features/pricing src/lib/haversine.test.ts` green; grep `lib/` for domain terms → empty (ENGINEERING #2 check).

---

## Phase 4 — Pure pricing `quote()` + per-type Zod configs (TDD) — ✅ DONE (`b951857`, `4f383db`)

**Goal:** Rule-based, itemized, deterministic quoting dispatched on `pricing_type`, with config-validated rates.
**Systems landed:** `features/pricing/quote.ts` (pure), `features/pricing/config-schemas.ts` (per-type Zod for `pricing_config`), shared pricing types.
**Deps:** Phase 3 (travel modifier consumes driving minutes). **Wireframe screens:** none.

**Files:** Create `src/features/pricing/types.ts`, `config-schemas.ts` (+`.test.ts`), `quote.ts` (+`.test.ts`).

- [x] **Step 1 — Types + config schemas (TDD).** `QuoteInput`, `QuoteLine`, `QuoteBreakdown { lines: QuoteLine[]; finalCents: number }`. One Zod schema per `pricing_type` validating its `pricing_config`. Test: valid seed config parses; missing rate throws; negative cents rejected.
- [x] **Step 2 — Failing tests for `quote()`** (table-driven, seed rates from DESIGN Pricing model):
  ```ts
  // house_sitting: 1 dog + 1 cat, 1 night = $50 base + $10 cat surcharge = $60.00
  expect(quote(houseSit({ dogs: 1, cats: 1, nights: 1 })).finalCents).toBe(
    6000,
  );
  // +$15/night extra dog; +$10/day can't-be-left-alone; +$5/day per extra 15min walk; +$10/day holiday
  // check_in: 0.5h on-site, $30/h, $15 min → max(15, ...) ; pet count irrelevant
  // walk: $25/h + $10/dog
  // training: $35/h, max_pets enforced upstream
  // travel modifier: round-trip minutes × hourly rate, hourly services only; house_sit travel default 0
  // recurring: −10% when series qualifies (≥3; house_sit ≥3 distinct stays)
  // Kiche: passed-in flag applies % AFTER recurring (Cal-applied)
  // computation order + round-to-nearest-cent per line
  ```
- [x] **Step 3 — Run → FAIL → implement** pure `quote(input): QuoteBreakdown` dispatching on `pricing_type`; modifiers applied in DESIGN order (base+surcharges → travel → recurring → Kiche); each line rounded to nearest cent. No IO, no clock.
- [x] **Step 4 — Run → PASS** (all rows).
- [x] **Step 5 — Commit** `feat: add pure pricing quote with per-type config schemas`.

**Verification:** `vitest run src/features/pricing/quote.test.ts` green; every DESIGN seed-rate example has a passing assertion.

---

## Phase 5 — Pure booking state machine (TDD) — ✅ DONE (`9f72927`)

**Goal:** Total, pure `transition()` enforcing the DESIGN state diagram; invalid events rejected.
**Systems landed:** `features/booking/state-machine.ts` (pure), booking status/event types.
**Deps:** none (pure). **Wireframe screens:** none.

**Files:** Create `src/features/booking/state-machine.ts` + `.test.ts`.

- [ ] **Step 1 — Failing tests** covering the full diagram:
  ```ts
  // submit + requiresApproval → 'pending_approval'; submit + !requiresApproval → 'confirmed'
  // pending_approval --approve--> confirmed ; --decline--> declined ; --cancel--> cancelled
  // confirmed --complete--> completed ; --cancel--> cancelled
  // terminal states reject every event (returns {error})
  // invalid event for state → {error}, never throws
  ```
- [ ] **Step 2 — Run → FAIL.**
- [ ] **Step 3 — Implement** `transition(state, event, ctx): { state } | { error }` as a pure lookup; `requires_approval` is read from `ctx` (derived upstream from distance/flag, Phase 3). No IO. Document that quote/prepay/reminder are **not** states (DESIGN).
- [ ] **Step 4 — Run → PASS.**
- [ ] **Step 5 — Commit** `feat: add pure booking state machine`.

**Verification:** `vitest run src/features/booking/state-machine.test.ts` green; exhaustive transition table covered incl. invalid-event rejection.

---

## Phase 6 — Pure recurrence engine + availability overlap/guards (TDD) — ✅ DONE (`a88e95f`)

**Goal:** General recurrence expansion (weekly exposed) + the pure "does this candidate fit an open window and pass the booking-rule guards" check + series-qualification for the recurring discount.
**Systems landed:** `features/booking/recurrence.ts` (general engine, pure), `features/booking/availability.ts` (pure overlap + hours/lead/advance guards + series qualification).
**Deps:** Phase 1 (settings shape). **Wireframe screens:** none.
**Note:** general engine built per Alex's explicit choice + DESIGN's long-term goal.

**Files:** Create `src/features/booking/recurrence.ts` + `.test.ts`; `src/features/booking/availability.ts` + `.test.ts`.

- [ ] **Step 1 — Recurrence failing tests.** A general rule `{ freq, interval, count?, until? }` (RRULE-subset). Tests: weekly × count=3 → 3 dated occurrences a week apart; `interval=2` → fortnightly; `until` bounds the set; `count` and `until` both honored. Engine is general; MVP callers pass `freq:'weekly'` only.
- [ ] **Step 2 — Run → FAIL → implement pure** `expandOccurrences(start, rule): Date[]` (no clock; deterministic) → **PASS**.
- [ ] **Step 3 — Availability failing tests.** `fitsWindow(candidate, openWindows)`; `passesGuards(candidate, settings, now)` → checks `booking_open_hour..close_hour` (America/Denver hours), `min_lead_time_hours`, `max_advance_days`; `seriesQualifiesForRecurringDiscount(occurrences, service, settings)` (≥`recurring_min_occurrences`; house-sitting counts **distinct stays**, not nights). `now` passed in (no clock read inside).
  ```ts
  it('inside open window passes', …); it('outside all windows fails', …);
  it('before lead time fails', …); it('past max advance fails', …);
  it('hour-of-day outside open/close fails', …);
  it('house_sit 3 nights one stay does NOT qualify', …);
  it('house_sit 3 distinct stays qualifies', …);
  ```
- [ ] **Step 4 — Run → FAIL → implement pure** functions → **PASS**.
- [ ] **Step 5 — Commit** `feat: add recurrence engine and availability guards`.

**Verification:** `vitest run src/features/booking` green; series-qualification edge cases covered.

---

## Phase 7 — Booking service + server actions (IO edge) — ✅ DONE (`bc470e0` + review-fix `d1957b6`)

**Goal:** Wire the pure core to the DB: submit computes distance+quote synchronously, derives approval, persists snapshots, holds the slot; realtime availability stream.
**Systems landed:** `features/booking/booking-service.ts` (orchestrates pure core + Supabase adapter), `createBooking` / `cancelBooking` server actions, Supabase Realtime subscription for `/book`.
**Deps:** Phases 1–6. **Wireframe screens:** none (surfaced in Phase 9).

**Files:** Create `src/features/booking/booking-service.ts`, `src/features/booking/actions.ts`, `src/features/booking/use-availability.ts` (realtime hook), `src/features/booking/booking-repository.ts` (Supabase adapter, ENGINEERING #4).

- [x] **`createBooking` action.** Zod-parse payload → load service + settings (repo) → geocode-cached `lat/lng` from profile → `estimateDrivingMinutes` + `deriveApproval` → `quote()` (+ series qualification for recurring) → expand occurrences if recurring (share `series_id`) → `transition('submit', ctx)` → insert booking(s) with `concurrency` denormalized, `distance_miles`, `quote_inputs`, `quote_breakdown`, `final_cents`, derived `status`. The DB exclusion constraint is the final arbiter — catch its unique-violation and surface "slot taken" (ENGINEERING #11, expected race). `refuse` from `deriveApproval` rejects before insert.
- [x] **`cancelBooking` action.** `transition('cancel', …)` → update status (releases the slot via the constraint's `where`). Refund is **manual by Cal** for MVP (no auto-refund).
- [x] **Realtime hook.** `use-availability.ts` subscribes to `availability_windows` + `bookings` changes (Supabase Realtime, events over polling — ENGINEERING #12) → derives open slots client-side using the pure `fitsWindow`/`passesGuards`.
- [x] **Integration tests** (local Supabase): submit far client → `pending_approval`; submit near client → `confirmed`; submit over hard cutoff → rejected; concurrent same-class submit → second gets "slot taken"; cross-class overlap → both succeed.
- [x] **Commit** `feat: wire booking service, server actions, and realtime availability`.

**Verification:** integration tests green; manual `verify` of submit paths once Phase 9 surfaces UI (or via a temporary action harness).

**Review findings applied (`d1957b6`):** per-`pricing_type` Zod validation of `quantities` (money-input integrity — blocks negative/non-numeric reaching `final_cents`); Zod-parse of the `settings`/`service` DB rows at the repo edge; **server-side enforcement of `passesGuards`** (hours-of-day / lead-time / max-advance) on every occurrence via an injected `now` (new `unavailable` result kind). **`fitsWindow` (availability-window containment) deferred to Phase 9** — `availability_windows` is empty until Phase 8 builds the admin CRUD, so enforcing it now would reject every booking (tracked by a `TODO(Phase 9)` in `booking-service.ts`).

---

## Phase 8 — Admin: availability, approvals, services, settings (wireframe) — ✅ DONE (`c032764` + trim-fix `5efd257` + review-fix `27bd6ee`)

**Goal:** Full in-app admin so Cal never touches the Supabase dashboard.
**Systems landed:** availability-window CRUD + block-out (cancel-confirm), approvals queue, services editor (config-schema-validated), settings editor.
**Deps:** Phases 1, 2, 7. **Wireframe screens:** `/admin/availability`, `/admin/bookings`, `/admin/services`, `/admin/settings`, `/admin/reviews`, (optional) `/admin/clients`.

- [x] **Availability.** List/create/trim/delete `availability_windows`; block-out = delete/trim with a confirm dialog that also cancels any booking inside (server action; reuse `cancelBooking`).
- [x] **Approvals.** `/admin/bookings` lists `pending_approval`; approve/decline call `transition` server actions (admin-guarded).
- [x] **Services + settings editors.** Forms validated by the Phase-4 per-type config schemas / a settings Zod schema; write under admin RLS. All values, not code.
- [x] **Reviews moderation.** `/admin/reviews` flips `status` published/rejected.
- [x] **Tests.** Action-level: only admins can mutate (RLS + guard); block-out cancels the inner booking; invalid `pricing_config` rejected by Zod.
- [x] **Commit** `feat: add admin availability, approvals, services, and settings`.

**Verification:** manual `verify` — Cal opens a window, a booking lands in it, block-out cancels it with confirmation; editing a rate changes a fresh quote.

---

## Phase 9 — `/book` client flow (wireframe) — ✅ DONE (9a `b01dc3d`+`f3c9b58`, 9b `4eb9fe7`+`0098914`)

**Goal:** Calendly-style availability + booking submit wired to real systems.
**Systems landed:** availability calendar (realtime), service picker, weekly-recurring toggle, live quote preview, submit → `createBooking`; **fitsWindow server-side enforcement now wired into `createBookingCore` (Phase-7 TODO removed)**.
**Deps:** Phases 7, 8. **Wireframe screens:** `/book`.

- [x] **Public availability view** using `use-availability` (auth required only to submit).
- [x] **Quote preview** calls a read-only quote server action (reuses pure `quote()`); shows itemized `quote_breakdown` before submit.
- [x] **Weekly recurring option** (engine general; UI weekly only) → passes a weekly rule to `createBooking`.
- [x] **Submit** → `createBooking`; surface approval-needed vs confirmed; surface "slot taken".
- [x] **Tests.** Component/integration: unauth user prompted to log in on submit; quote preview matches persisted breakdown.
- [x] **Commit** `feat: add /book availability and booking flow`.

**Verification:** manual `verify` end-to-end booking on local stack.

**Phase 9 review outcome (carry forward):**

- **Split into 9a (backend, full review) + 9b (UI, light review).** 9a: extracted `computeBookingArtifacts` (internal) so the read-only `previewQuote` action and `createBookingCore` share ONE computation — persisted `quote_breakdown` is byte-identical to the preview (drift-proof; asserted by a test). Wired `fitsWindow` enforcement + `repo.getOpenWindows(now)`; **removed** the Phase-7 `TODO(Phase 9)`. Code-quality review (needs-changes) → `f3c9b58`: artifacts threaded out of the compute fn to kill a double DB round-trip, 7 `!` non-null assertions, and a float `oneWayMin` re-derivation that could have silently broken the preview==persisted guarantee; `getOpenWindows` now takes injected `now`.
- 9b: `/book` under `(marketing)`; server component reads settings rule fields + active services via **service-role** (anon can't read `settings` under RLS) and passes `rules`/`services` as props. Pure `messages.ts` (result→message) is the unit-tested seam. Review fix `0098914`: removed `dangerouslySetInnerHTML` + stringly-typed `text.includes("Log in")` branching; login CTA is now a structured `action:"login"` flag rendered as a real element.

**BEHAVIOR CHANGE — flag to Cal (operational):** with `fitsWindow` enforcement live, a booking only succeeds if every occurrence falls inside an admin-defined `availability_windows` row. **Zero windows → every booking is `unavailable`.** Cal MUST publish availability windows (Phase-8 `/admin/availability`) before any booking can be accepted.

**KNOWN LIMITATION (carry forward):** `use-availability` reads `bookings` via the RLS-scoped browser client, so the public `/book` view only sees the VIEWER's own bookings — it cannot subtract other clients' busy slots from the displayed open slots. The DB exclusion constraint is the real arbiter at submit (→ `slot_taken`). Accurate public busy-slot display needs a service-role "busy ranges" endpoint/RPC — deferred (out of MVP scope).

---

## Phase 10 — Account area (wireframe) — ✅ DONE (`42f4e2b` + token-fix `aa16277`)

**Goal:** Client self-service surfaces wired to RLS-protected data.
**Systems landed:** profile editor, dogs CRUD, forms (emergency, registry-driven), bookings list with amount-owed.
**Deps:** Phases 2, 7. **Wireframe screens:** `/account`, `/account/dogs`, `/account/forms`, `/account/bookings`.

- [x] **Profile** edits only self-editable columns (column GRANT enforces; UI mirrors).
- [x] **Dogs CRUD** (name/breed/`notes`; photo DEFERRED — no Storage bucket yet, TODO in code).
- [x] **Forms.** Render generically from `features/forms/registry.ts` (only `emergency` registered; service-specific schemas are future code per DESIGN); submit → `form_responses` (upsert).
- [x] **Bookings list.** Upcoming/history split on `ends_at`; amount owed = `final_cents` − succeeded `payments`; prepay button disabled placeholder (wires in Phase 12).
- [x] **Tests.** RLS: a client sees only own dogs/bookings/forms; attempting to write `role`/`kiche_allowed` via session client is blocked (verified unchanged).
- [x] **Commit** `feat: add account profile, dogs, forms, and bookings`.

**Verification:** manual `verify` — CRUD round-trips; cross-client isolation holds.

**Phase 10 review outcome (carry forward):** Security model correct — ALL account mutations use the **session client** (`createClient()`), never the service role; identity from `getUser()`; only self-editable profile columns written; the column-guard test proves a session-client `update({role:'admin'})` leaves role unchanged. DI split (`runUpdateProfile`/`runCreateDog`/… + `"use server"` wrappers) tested with an anon-key session client (signInWithPassword) for RLS assertions. Light review (lower-risk RLS-guarded phase) — no spec/quality subagents dispatched; main-thread read + token-violation fix (`text-green-700` → semantic token) only. DEFERRED: avatar/dog photo upload (no Supabase Storage bucket configured — TODO in code); a `services` join returns an array (`{name}[]`) — typed accordingly.

---

## Phase 11 — Portfolio marketing pages (wireframe) ✅ DONE (573ec3c)

**Goal:** Public portfolio half (SSR/SEO), wireframe fidelity.
**Systems landed:** Home/About/Services(+sliding-scale CTA)/Gallery/Reviews(submit + published)/Resources.
**Deps:** Phases 1 (services/reviews read), 2. **Wireframe screens:** `/`, `/about`, `/services`, `/gallery`, `/reviews`, `/resources`.

- [x] **Services page** renders active services + rates from DB + the sliding-scale CTA (DESIGN: a CTA, not a feature).
- [x] **Gallery** uses `next/image`, defined aspect ratios, lazy loading (FRONTEND baseline).
- [x] **Reviews** lists `published`; authed clients submit (status forced `pending`).
- [x] **Static-ish pages** Home/About/Resources (semantic HTML; reference portfolio content).
- [x] **Tests.** Reviews submit forces `pending`; only published render publicly.
- [x] **Commit** `feat: add portfolio marketing pages`.

**Verification:** manual `verify` — pages render, review submit→moderation→publish loop works.

**Phase 11 review outcome (carry forward):** Light review (lower-risk: public reads + one client write) — main-thread security/correctness read, no spec/quality subagents. Security correct: reviews submit uses **session client** (`createClient()`) via DI core `runSubmitReview` + `"use server"` wrapper (`src/features/reviews/`), identity from `getUser()`, `status` hardcoded `'pending'` (RLS `with check (client_id = auth.uid() and status = 'pending')` also forces it); never service role. Public reads anon-allowed via session/anon client (`listActiveServices`, `listPublishedReviews` scoped to `status='published'`). 266 tests green (was 259; +7: pricing `display.test.ts` unit + `reviews-action.test.ts` integration asserting forced-pending + anon/published visibility). Home moved into `(marketing)` group: new `(marketing)/page.tsx`, deleted root `src/app/page.tsx`; `(marketing)/layout.tsx` now a real session-aware shell (header/nav/footer, `getUser()` → Account vs Sign-in). New pricing display helper `features/pricing/display.ts` (`formatCents` + exhaustive `headlineRate`, pure+tested). **services-repo was found mid-flight written against a NON-EXISTENT schema** (`base_rate_cents`/`rate_unit`/`concurrency_class`) — rewritten to the real `services` columns (`pricing_type`/`pricing_config` jsonb/`concurrency`), parsing `pricing_config` via `parsePricingConfig` (skip-on-invalid). No hardcoded colors (all semantic tokens). DEFERRED (flag to Cal): gallery uses `picsum.photos` placeholders (`images.remotePatterns` in `next.config.ts`) + Home/About/Resources/sliding-scale copy is wireframe placeholder prose — both need real portfolio photos/copy before launch. NOTE: `runSubmitReview` falls back to `user.email` as `author_name` when no profile `full_name` — admin moderates before publish, acceptable for MVP.

---

## Phase 12 — Stripe adapter + webhook (prepay) ✅ DONE (28dc7c2 + 19e13ce + 5716b30)

**Goal:** Optional full prepay; `payment_status` written **only** by the webhook (single writer), deposit-ready schema unchanged.
**Systems landed:** `features/payments/` Stripe adapter (typed interface), PaymentIntent creation, `/api/webhooks/stripe` route handler (service role).
**Deps:** Phases 1, 7, 10. **Wireframe screens:** pay buttons on `/account/bookings`, `/book`.

- [x] **Add deps.** `stripe@22.2.0`.
- [x] **Adapter.** `PaymentGateway` interface (`features/payments/types.ts`) + `StripeGateway` (`stripe-gateway.ts`); app/core depend on the interface (#4).
- [x] **Create intent** server action `runCreatePrepayIntent` (DI core) + `createPrepayIntent` wrapper → server-derived amount → inserts `payments` row (`requires_payment`) via service role → returns client secret.
- [x] **Webhook** (`createServiceClient`, RLS-bypass) verifies signature → updates `payments` row status → recomputes `bookings.payment_status` as the **derived projection** (sole writer; never touches `status`).
- [x] **Tests.** 26 payments tests (294 total): succeeded→paid + amount-owed recompute, idempotent re-delivery, refund, forward-only refund guard, expanded `payment_intent`, signature verify, RLS (clients can't write `payments`/`payment_status`), create-intent owner/already-paid.
- [x] **Commit** `feat: add Stripe prepay and webhook payment projection`.

**Verification:** Stripe CLI `stripe listen` → trigger `payment_intent.succeeded` → `payment_status` flips; manual `verify` prepay on a booking.

**Phase 12 review outcome (carry forward):** FULL two-stage review (money phase) + main-thread sensitive read. Spec reviewer: 1 gap (integration test didn't assert amount-owed recompute) → fixed (19e13ce). Code-quality reviewer: 3 blocking → fixed (5716b30): (1) forward-only guard so a re-delivered/out-of-order `succeeded`/`failed` can't overwrite a terminal `refunded` row (would wrongly flip booking back to `paid`); (2) `chargeObjectSchema` now accepts both string and expanded `{id}` `payment_intent` (else `charge.refunded` could 500-loop); (3) finite-number guard on `final_cents` before money math; also throw on null `client_secret`. **Security verified:** webhook writes ONLY `payments.status` + `bookings.payment_status`, never `bookings.status`; signature verified before any DB write (raw `request.text()` body); service role used only post-verify / after `getUser()`+ownership in create-intent; amount always server-derived from `final_cents`; clients can't write payments/payment_status (RLS-tested). `apiVersion` pinned `2026-05-27.dahlia`. **DEFERRED non-blocking (revisit in Elements phase):** double-submit of create-intent can create duplicate `requires_payment` rows / PaymentIntents — needs a DB unique constraint or idempotency key; not money-incorrect today (only `succeeded` counts) and intents can't yet be confirmed. **SCOPE BOUNDARY — flag to Cal:** Stripe **Elements card-entry UI is NOT built** — `/account/bookings` Prepay button creates the intent + returns clientSecret but shows "card entry coming soon"; `/book` pay button still a stub. Finishing needs `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + Cal's live Stripe account (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`). Env placeholders added to `.env.example`; `.env.test` got a local `STRIPE_WEBHOOK_SECRET` (gitignored).

---

## Phase 13 — Resend reminders + scheduled completion (Vercel cron) ✅ DONE (d956197 + 16134ab + 1565ae3)

**Goal:** Confirmation/reminder email side-effects + automatic `completed` transition.
**Systems landed:** `features/notifications/` Resend adapter, reminder cron, completion cron.
**Deps:** Phases 1, 5, 7, 12. **Wireframe screens:** none.

- [x] **Add deps.** `resend`.
- [x] **Adapter.** `Mailer` interface (`features/notifications/types.ts`) → `ResendMailer` (`resend-mailer.ts`); only the adapter imports `resend` (#4).
- [x] **Confirmation email** fired (best-effort) from `createBooking` + `approveBooking`; failed send never alters the booking result.
- [x] **Reminder cron.** `GET /api/cron/reminders` (CRON_SECRET bearer) → `runReminderCron` finds `confirmed` bookings within `reminder_lead_hours` with null `reminder_sent_at` → sends → stamps `reminder_sent_at` only on success. N from `settings.reminder_lead_hours` (new column, Cal-tunable via /admin/settings).
- [x] **Completion cron.** `GET /api/cron/complete` (CRON_SECRET bearer) → `runCompletionCron` → `confirmed` past `ends_at` → `transition('complete')` → `completed` (only `status`, never `payment_status`).
- [x] **Tests.** 36 notification tests (327 total): email builders (Denver TZ, dollars, html+text), `isRemindable`/`isCompletable` predicates, reminder fires once + idempotent re-run (mailer asserted 0), far-future excluded (real cron call), completion flips only past-end confirmed.
- [x] **Commit** `feat: add Resend reminders and scheduled completion`.

**Verification:** trigger cron routes locally; assert email payload (mock Mailer) + status flips.

**Phase 13 review outcome (carry forward):** FULL two-stage review + main-thread sensitive read. **BUILD FIX (c050bad):** Phase 12's Stripe webhook route instantiated `new Stripe(requireEnv(...))` at MODULE TOP LEVEL → `next build` page-data collection threw on missing `STRIPE_SECRET_KEY` → build failed. Fixed by lazy-init inside the POST handler (cron routes already lazy). Spec reviewer: 1 minor test gap (far-future "integration" test only checked the predicate) → fixed (16134ab) to drive the real cron + assert no send/stamp. Code-quality reviewer: applied (1565ae3) — (C1) wrapped reminder-route `new ResendMailer()` in try/catch (constructor throws on missing env → now a structured 500, not an unhandled throw); (I2) distinct WARNING log when email sends but stamp fails (double-send risk visible); (I3) Zod-validate the nested `profiles(email)`/`services(name)` join rows in both action email blocks (was unchecked `as` casts); (N1) `escapeHtml` the admin-controlled `serviceName` in email HTML; (N2) comment typo. **Deliberately NOT changed (with rationale):** empty-string `CRON_SECRET` rejecting all is fail-CLOSED = the safe behavior (keep); timing-safe bearer compare negligible for an HTTPS cron secret; reminder `reminder_lead_hours` already has a `typeof===number?:24` runtime guard; `parseInt('')→NaN` in settings UI is pre-existing across ALL numeric fields (out of Phase 13 scope, save fails safely). **Security verified:** cron routes fail-closed 401 without correct bearer; completion never touches `payment_status`; reminder idempotent via success-only stamp; emails best-effort (cannot fail a booking); only the adapter imports `resend`. **SCOPE BOUNDARY (flag Cal):** email copy/branding is wireframe placeholder (TODO in `emails.ts`) — needs real copy before launch. Env placeholders (`RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`) in `.env.example`; real values needed in Vercel for crons/emails to run. SMS reminders deferred (DESIGN out-of-scope).

---

## Self-review (against DESIGN.md)

- **Data model** → Phase 1 (all 9 tables, enums, jsonb, cents). **RLS + column guard + exclusion constraint** → Phase 1. **Distance pipeline** → Phase 3. **Pricing model (4 types + modifiers + order)** → Phase 4. **Booking state machine** → Phase 5. **Availability/concurrency/recurrence** → Phases 6–7 + DB constraint. **Route map** → Phases 2 (auth/account/admin guards), 8–11 (every route). **Stripe single-writer projection** → Phase 12. **Reminders + completion** → Phase 13. **Geocoding/Stripe/Resend adapters** → Phases 3/12/13. No spec section left without a phase.
- **Type consistency:** `QuoteBreakdown.finalCents`, `transition()` `{state}|{error}`, `Geocoder.geocode`, `concurrency_class`, `booking_status` reused verbatim across phases.
- **Open Cal questions** seeded as `settings` defaults (Phase 1 Step 7), not blockers.

## Definition of Done (per WORKFLOW.md)

Each phase: tests green → `tsc`/lint/format clean → `/code-review` → manual `verify` → conventional commit on `main` (subject only) → Vercel preview confirmed.
