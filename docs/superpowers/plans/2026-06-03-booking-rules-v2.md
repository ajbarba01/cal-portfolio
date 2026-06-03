# Booking Rules v2 — Implementation Plan (Phases 14–18)

> **For agentic workers:** continues the systems-first style of `2026-05-29-cal-portfolio-mvp.md` (Phases 0–13, all done). Standalone — **not** appended to the MVP plan. Steps use checkbox (`- [ ]`) syntax; mark `- [x]` with a commit SHA on the header when a phase lands. **Authority:** DESIGN.md (updated 2026-06-03) is the spec; this turns its new behavior into ordered, independently verifiable milestones.

**Goal:** Absorb Cal's resolved booking rules into the running MVP — a **miles-based** distance approval gate, **half-hour** booking hours bounded at both ends, a **soft time horizon** (auto-confirm within ~1 month, pend beyond), **open-ended weekly** recurrence with a rolling materialization cron, and a **cancellation/refund policy + debt gate** with no-show. Every value Cal gave stays a Cal-tunable `settings` row — values, not code.

**Architecture (unchanged):** `app/` routing only · `features/<domain>/` pure core + services + adapters · `lib/` business-agnostic infra. Pure domain math/state, IO at the edges; vendors behind typed interfaces. RLS deny-by-default + column guard. `payment_status` is a projection written only by the Stripe webhook. (ENGINEERING #1–#5, #10–#12; DESIGN data model.)

---

## Context

The MVP (Phases 0–13) shipped with a **driving-minutes** approval gate, integer-hour booking windows, a hard `max_advance_days` refuse, a recurrence engine that **rejects unbounded rules**, and **manual-only** refunds with no debt tracking. Cal's answers (recorded in DESIGN.md) change all five. This plan does not redesign the systems — it re-points existing pure functions and the settings edge, and adds one cron + two tables.

**Resolves the Phase-3 ambiguity flag** (MVP plan §"DESIGN.md ambiguities", item 1): the gate is now unambiguously **miles**, not minutes. Minutes survive only as the travel-**cost** input.

### Cross-cutting conventions (every phase)

- TS strict, no `any`; Zod-parse all DB/form/env data at the edge. Money = integer cents. Times UTC, rendered `America/Denver`.
- Every settings change touches the **same five places**: migration + seed · `SettingsRow` interface · `settingsRowSchema` · the `getSettings` select string in `src/features/booking/booking-repository.ts` · the `/admin/settings` UI. `settingsRowSchema` is the runtime safety net that catches a missed column.
- Pure core = no IO/clock inside; pass `now` in. New crons mirror the existing shape: pure predicate + `runXCron({ serviceClient, now })` + `CRON_SECRET`-gated GET route + `vercel.json` daily entry (Hobby-plan compatible).
- Each phase ends green: `npm run typecheck` + `npm run lint` + `vitest run` (+ pgTAP where relevant) before a conventional commit. Same-commit doc rule.

### Order (dependencies)

14 → 15 → 16 → 17 (depends on 16) → 18. 16's `auto_confirm_horizon_days` + `deriveTimeApproval` are reused by 17's cron; 18's debt gate is cross-checked by 17's cron.

---

## Phase 14 — Distance gate in miles — [x] `3da4885`

**Goal:** Approval gate reasons in miles (Cal's mental model); driving-minutes kept only for the travel-cost line.
**Systems landed:** miles-based `deriveApproval`; settings re-pointed. **Deps:** none.

**Files:** `src/features/pricing/distance.ts`, `src/features/booking/booking-service.ts`, `src/features/booking/booking-repository.ts`, `supabase/migrations/<ts>_distance_miles_gate.sql` (+ seed), `distance.test.ts`.

- [x] **Settings.** Add `auto_approve_threshold_miles` (8), `hard_cutoff_miles` (50), `gate_use_road_miles` (false). Drop `auto_approve_threshold_min` / `hard_cutoff_min` (no longer gate anything; billing uses `road_factor`/`avg_speed_mph` directly).
- [x] **`deriveApproval` re-type.** Take `miles` + `{ autoApproveMiles, hardCutoffMiles, useRoadMiles }` → `"auto" | "manual" | "refuse"`. Gate on `haversineMiles` (× `road_factor` only when `useRoadMiles`). Leave `estimateDrivingMinutes` untouched. (cfg also carries `roadFactor` so the switch is self-contained.)
- [x] **`computeBookingArtifacts`.** Call the miles gate; still compute `oneWayMin` for the round-trip travel-cost line; preserve the null-lat/lng → manual-approval safe default. Refuse message → miles.
- [x] **Repo edge.** `SettingsRow` + `settingsRowSchema` + `getSettings` select: add the 3 miles columns, drop the 2 min columns. (Admin settings edge — `settings-actions.ts`, `settings-schema.ts`, `settings-client.tsx` — re-pointed too.)
- [x] **Tests.** `deriveApproval`: <8 → auto, 8–50 → manual, >50 → refuse; `useRoadMiles` multiplies; null-coords → manual. Reuse: `haversineMiles` (`src/lib/haversine.ts`). Integration fixtures re-pointed to miles bands.
- [x] **Gate + commit** `feat: gate booking approval on miles, not driving minutes`. DESIGN.md already documents the miles columns (no shift needed).

**Verification:** unit tests green; a far booking (>50 mi origin→client) refuses; 8–50 mi pends.

---

## Phase 15 — Booking hours: half-hour granularity + end-bound — [x] `dbf4f48`

**Goal:** 6:30am–10:00pm windows; a booking must **start ≥ open AND end ≤ close**.
**Systems landed:** minute-based hours guard. **Deps:** 14 (settings-edge habit).

**Files:** `src/features/booking/availability.ts`, `booking-service.ts`, `booking-repository.ts`, `supabase/migrations/<ts>_booking_minute_hours.sql` (+ seed), `availability.test.ts`.

- [x] **Settings.** Replace `booking_open_hour` / `booking_close_hour` with `booking_open_minute` (390) / `booking_close_minute` (1320). CHECK `0..1440` and `open < close` added.
- [x] **Guard.** Add pure `denverMinutesSinceMidnight(date)` (extends the `Intl.DateTimeFormat` tz approach with `minute`). `passesGuards` bounds **start ≥ open** and **end ≤ close**. Updated `BookingRuleSettings` + the BOUNDARY-SEMANTICS doc comment.
- [x] **Wire.** `booking-service.ts` reads the new columns; repo + admin + `/book` settings edges updated.
- [x] **Tests.** 6:30am start allowed, 6:29 rejected; a service ending 10:30pm rejected; DST day correct (tz handled by IANA). Fixtures updated (availability, use-availability, booking-service integration, admin).
- [x] **Gate + commit** `feat: half-hour booking hours bounded at start and end`.

**Verification:** `availability.test.ts` green; manual — a 9:30pm walk that runs past 10pm is rejected.

---

## Phase 16 — Time horizon: soft approval + auto-confirm — [x] `78a1b67`

**Goal:** Within ~1 month → auto-confirm (no conflict); beyond → `pending_approval`, not refused; a generous hard cap stays.
**Systems landed:** pure `deriveTimeApproval`; `requires_approval` = distance OR time OR service-flag, **per occurrence**. **Deps:** 14, 15.

**Files:** new `src/features/booking/time-gate.ts`, `availability.ts`, `booking-service.ts`, `booking-repository.ts`, `supabase/migrations/<ts>_time_horizon.sql` (+ seed), `time-gate.test.ts`.

- [x] **Settings.** Add `auto_confirm_horizon_days` (30); rename `max_advance_days` → `hard_max_advance_days` (365).
- [x] **`deriveTimeApproval(startsAt, now, { autoConfirmHorizonDays, hardMaxAdvanceDays })`** → `"auto" | "pending" | "refuse"`, parallel to `deriveApproval`.
- [x] **`passesGuards`.** Soft reject dropped; the surviving max-advance reject is the hard cap (`hardMaxAdvanceDays`). Updated `BookingRuleSettings` + doc comments.
- [x] **Compose.** `computeBookingArtifacts` folds the per-occurrence time decision into `requiresApprovalByOccurrence` (OR with distance + service flag); `createBookingCore` derives status per occurrence. A time refuse short-circuits the submit.
- [x] **Tests.** `time-gate.test.ts`: day 0–30 → auto, 31–365 → pending, >365 → refuse, past → auto. Integration: 45-day near booking → pending_approval; 400-day → refuse.
- [x] **Gate + commit** `feat: soft time-approval horizon (auto-confirm within ~1 month)`.

> Far **one-off** bookings sit `pending_approval` and are promoted by Phase 17's cron when they enter the horizon (single mechanism, per the locked decision).

**Verification:** a booking 2 months out is created `pending_approval`, not refused; one 2 weeks out auto-confirms.

---

## Phase 17 — Open-ended weekly recurrence + rolling series cron — [x] `f77b125`

**Goal:** Weekly series, fixed week-count or "no end"; never officially books past ~1 month; a daily cron promotes pending→confirmed at the horizon and extends open series.
**Systems landed:** `booking_series` table; bounded recurrence; `series-roll` cron + route. **Deps:** 16.

**Files:** `recurrence.ts`, `booking-service.ts`, `booking-repository.ts`, new `src/features/booking/series-cron.ts`, new `src/app/api/cron/series-roll/route.ts`, `vercel.json`, `supabase/migrations/<ts>_booking_series.sql` (+ seed), `recurrence.test.ts`, `series-cron.test.ts`.

- [x] **Settings.** Add `recurrence_generation_horizon_days` (42, ≥ confirm horizon + buffer).
- [x] **Schema.** `booking_series` table (column `step_interval`, not `interval` — Postgres keyword; DESIGN updated) + `bookings.series_id` FK + RLS (client reads own; service-role writes).
- [x] **Recurrence bound.** Added optional `opts.materializeUntil` to `expandOccurrences`; **throw kept** when no bound (count/until/materializeUntil) is passed. UNBOUNDED-RULE-CONTRACT doc + tests updated.
- [x] **Submit.** Accept an open-ended rule (count & until both absent); write a `booking_series` row with **frozen `quote_inputs`**; materialize occurrences only to the generation horizon, status per-occurrence via `deriveTimeApproval`. Weekly-only enforced (table CHECK + service guard). Slot conflict on first insert cleans up the orphan series.
- [x] **Cron.** `series-cron.ts`: pure `shouldPromote` + `nextOccurrencesToMaterialize`. `runSeriesRollCron({ serviceClient, now })` after `completion-cron.ts`: **promote** time-only pendings (distance/service pendings left for Cal) via `transition('pending_approval','approve')`; **extend** active series, catching 23P01 → conflict count + log, never dropped. (Debtor-skip added in Phase 18 — both passes skip a client with an unsettled balance.)
- [x] **Route + schedule.** `api/cron/series-roll/route.ts` (clone of `complete/route.ts`, `CRON_SECRET`-gated); daily `vercel.json` entry added.
- [x] **Repo.** `insertSeries`, `deleteSeries`, `getActiveSeries` (generalized from `getActiveOpenSeries` — handles bounded tails too), `getMaterializedOccurrenceStarts(seriesId)`, `getServiceById`, `BookingSeriesRow`/`BookingSeriesInsert` types + schema.
- [x] **Tests.** `materializeUntil` bound (implicit until + count interplay); `shouldPromote` boundary; `nextOccurrencesToMaterialize` skips existing/past; cron promotes an in-horizon time-only pending, leaves a distance-manual pending, and leaves a conflicting extend occurrence unmaterialized.
- [x] **Gate + commit** `feat: open-ended weekly recurrence with rolling series-roll cron`.

**Verification:** an open-ended weekly series materializes ~6 weeks of rows (near = confirmed, far = pending); running the cron with a future `now` promotes the next occurrence; a manufactured conflict leaves it pending + flagged.

---

## Phase 18 — Cancellation / refund policy + debt gate + no-show — [x] `3cd137c`

**Goal:** Self-cancel with a 48h/50% policy (Cal can grant full <48h); unpaid late cancel / no-show → debt that blocks re-booking until settled.
**Systems landed:** pure `computeRefund`; `StripeGateway.refund`; `client_debits` + gate; `no_show` status. **Deps:** 17 (cron debt skip).

**Files:** `state-machine.ts`, `src/features/payments/stripe-gateway.ts` (+ `PaymentGateway` interface), new `src/features/booking/cancellation.ts`, `booking-service.ts`, `actions.ts`, `booking-repository.ts`, `supabase/migrations/<ts>_cancellation_debt.sql` (+ seed), `cancellation.test.ts`, `state-machine.test.ts`.

- [x] **Settings.** `cancellation_full_refund_hours` (48), `late_cancel_refund_pct` (50), `no_show_charge_pct` (100).
- [x] **Schema.** `client_debits` table + RLS (admin/system write only); added `no_show` to the `booking_status` enum.
- [x] **State machine.** Added `no_show` terminal status + `confirmed → no_show` (event `no_show`); updated `TERMINAL_STATUSES` + the diagram doc.
- [x] **`computeRefund`** → `{ refundCents, tier: "full"|"late"|"none", needsCalReview }`, pure; plus `computeCancellationDebtCents` (forfeited portion for unpaid late / no-show). (paid = final or 0.)
- [x] **Gateway.** Added `refund(paymentIntentId, amountCents)` to `StripeGateway` + `PaymentGateway`. Cancel path **initiates** the refund; `charge.refunded` webhook re-projects `payment_status` (sole writer preserved).
- [x] **Cancel core + debt gate.** `cancelBookingCore` (now takes `CancelDeps` with a gateway): computes refund, initiates it, writes a `client_debits` row on unpaid late cancel. **Debt gate** at the top of `computeBookingArtifacts` → `{ kind: "blocked_debt", owedCents }` blocks preview **and** create. Block-out (trim/delete window) cancel path threads a gateway too.
- [x] **Actions.** Wired gateway DI + `now`; added admin `grantFullRefund`, `markNoShow`, `settleDebt` (admin-gated wrappers + `*Core` fns).
- [x] **Repo.** `getOutstandingDebtCents`, `insertDebit`, `settleDebit`, `getBookingWithPayments`.
- [x] **Tests.** `computeRefund`/debt math; state-machine `no_show` (incl. terminal matrix); integration — unpaid late cancel writes a debit, next booking is `blocked_debt` until `settleDebt`, and `markNoShow` writes a full-price debit. `/book` messages surface `blocked_debt`.
- [x] **Gate + commit** `feat: cancellation/refund policy, no-show, and debt-gated re-booking`.

> **Debtor-skip (17↔18):** completed here — `runSeriesRollCron` now skips a debtor's occurrences in BOTH passes (promote + extend), with a per-client debt lookup cached across the run. Tested: a debtor's in-horizon time-only pending is left `pending_approval`.

**Verification:** ≥48h cancel of a prepaid booking refunds full via the webhook projection; <48h unpaid cancel creates a debit and blocks the next booking; Cal `settleDebt` clears the block; `markNoShow` on a past confirmed booking writes the debit.

---

## Owed UI (track in DEV_NOTES, build alongside)

`/admin/settings` hour+minute pickers + new value inputs · `/admin/bookings` grant-full-refund / mark-no-show / pending-conflict surfacing · admin debt view + settle · recurring weekly UI (fixed-count or "no end").

## Still pending Cal (not blockers)

House-sitting travel cost · remaining form fields + per-dog vs per-property split · structured per-dog fields (vaccination/meds/vet/feeding) · exact threshold tuning.
