# Audit findings register

> Output of the 2026-06-10 full-site audit (static + live). Companion to the [professionalization roadmap](2026-06-10-professionalization-roadmap-design.md). Every finding: **ID · severity (C=critical / M=major / m=minor) · evidence · owning SP**. Each SP prunes its resolved findings at DoD. Findings marked **(live-verify)** were inferred statically or user-reported — confirm during the owning SP with seeded scenarios.

## Verified sound (do not re-litigate)

Cross-checked DESIGN.md against code — all VERIFIED with evidence:

- All server-side booking gates in `computeBookingArtifacts` (onboarding, debt, lead time, open/close minutes both ends, distance refuse/manual, horizon per-occurrence) — booking-service.ts:249-479.
- `requires_approval` = OR of distance/time/service-flag, per-occurrence.
- `bookings.payment_status` single writer = webhook projection (webhook-core.ts); cancel path initiates refund via gateway only.
- Exclusion constraint `no_same_class_overlap` (migration 20260529205134); app maps 23P01 → `slot_taken`.
- Crons (complete / reminders / series-roll) correct, vercel.json-scheduled, CRON_SECRET-gated; series-roll honors `skipped_starts`, flags conflicts, skips debtors.
- `editBookingCore` MutationPolicy, price_locked, re-quote + re-derive, cutoff gate, series detach.
- RLS column guards (profiles/bookings whitelists), inquiries service-role-only insert, identity-free busy ranges, private pet photos + signed URLs.
- `returnTo` open-redirect guard; pricing pure dispatch + computation order; pet counts server-derived.
- Webhook: signature verify on raw body, 500 → Stripe retry, refunded-row forward-only guard. Prepay intent: server-derived amount, ownership check, service-role insert.

## SP3 — foundations (codebase + system + primitives)

SP3 split into **SP3a** (codebase structure — DONE 2026-06-10) and **SP3b** (system IA + UI primitives — DONE 2026-06-10). SP3a resolved A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 (behavior-preserving refactor: cross-feature moves, enforced feature boundaries with client/server entry split, booking-service split, scheduler cell primitive, client-state hooks, mutation layer, notifier seam, suppression cleanup, CONTEXT + ADRs 0001–0004). **SP3b resolved A2, A12** (+ the A13/A14/A16 deepening follow-ups below): A2 — unified the confirm dialog on the single `useConfirm` promise hook (icon + async/pending + alertdialog a11y), deleted the `ui/` duplicate; A12 — moved `/onboarding` out of the `(account)` zone into its own group with a `BackToSite` wayfinding affordance. SP3b also shipped the toast (U7 build), nav attention-badge + `AttentionCounts` seam (AD5 setup), generic dialog primitive + shared shell, and the feedback-conventions doc + `BackToTop` primitive (U9 build). All SP3-tagged findings cleared.

### SP3a fresh-review follow-ups (deepening — out of SP3a's behavior-preserving scope; logged 2026-06-10)

Surfaced by the SP3a fresh-session `/code-review`. All were **pre-existing duplication/structure** that SP3a relocated verbatim (not regressions). **A13, A14, A16 resolved by SP3b Plan A** (behavior-preserving, ADR-0005): A13 — extracted the shared `useBookingScheduler` substrate (the three hooks are now thin wrappers feeding their deltas via refs; load-bearing invariants preserved, guarded by a new characterization test + a hook-test stack); A14 — extracted `toRuleSettings()` into `booking-service-shared` (the guard/window _pairing_ was deliberately left per-core — the cores' policy-gated short-circuits + warning-vs-silent divergence differ, so a combined runner would change behavior); A16 — surfaced the parsed `input` on `BookingQuoteArtifacts`, dropping the re-parse. **A15 remains SP7** (a perf serialization, out of SP3b scope).

| ID  | Sev | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Target |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A15 | m   | `computeBookingArtifacts` awaits `getOutstandingDebtCents` then `getOnboardingStatus` serially before the `Promise.all` load; the two base reads have no data dependency and could join the `Promise.all` (inner `hasActiveBookingForServiceSlug` stays conditional). One extra serial Supabase RTT on every quote preview / create / edit — fires on the ~400 ms live-quote debounce. (Pre-existing serialization, re-exposed by the move into shared.) | SP7    |

## SP4 — payments

**All SP4 findings resolved (PAY1–PAY7) — DONE 2026-06-11.**

- **SP4a (PAY1, PAY2, PAY4 + the `payment_intent.canceled` half of PAY6):** PaymentElement mounted in the account-bookings dialog; test-mode setup documented in `.env.example`; open-intent reuse + booking-scoped idempotency (cancel-and-recreate on stale, key rotated); `payment_intent.canceled` → row `failed`, `bookings.status` untouched. Live `verify` (real `stripe listen`, `4242` card → `paid`, repeat-click reuse) passed.
- **SP4b (PAY3, PAY5, the `charge.dispute.*` half of PAY6, PAY7):** `refunded_cents` re-model + `partially_refunded` projection (paid-first, overpay-safe), cumulative-refund write from `charge.amount_refunded` (forward-only), overpay auto-reconcile (idempotency-keyed refund initiated from the webhook), dispute marker columns (`disputed_at`/`dispute_status`) + structured log, prepay reuse-path 404 guard, and payment-policy confirmation-email copy rendered from `settings` (first-person voice). Webhook stays the sole `payment_status` writer; `bookings.status` never touched by payment code.

## SP5 — admin (Cal-friendly)

| ID  | Sev | Finding                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD1 | M   | Series-roll conflicts are flagged in cron output only — no admin surface lists "occurrences left pending due to conflict" (DEV_NOTES owed item). Cal can't see or resolve them.                                                                                                                                                                                              |
| AD2 | M   | Admin create-on-behalf "add pet" binds to the wrong profile (UI-level; core `insertBookingPets` is correct). Root-cause fix: scope pet creation to the target client — do **not** remove the capability (rejects DEV_NOTES suggestion to drop the button).                                                                                                                   |
| AD3 | M   | Settings UI exposes raw values (minutes-since-midnight integers etc.). Cal-friendly controls owed: hour+minute pickers for open/close, labeled inputs for miles/horizon/refund-pct/holiday dates. **(live-verify exact fields)**                                                                                                                                             |
| AD4 | M   | Cancel-with-reason: no reason field on admin/client cancel; reason should flow into the cancellation email (with booking-mutation P3).                                                                                                                                                                                                                                       |
| AD5 | m   | No admin notification badges (wordmark/tabs) for pending approvals / new inquiries / flagged conflicts — "what needs Cal's attention now" surface missing (ties SP3 nav). **Primitive-ready (SP3b):** shipped the `NavBadge` primitive + the typed `AttentionCounts` seam (`{pendingApprovals,newInquiries,flaggedConflicts}`); SP5 wires the real counts + final placement. |
| AD7 | m   | Inquiry list: long messages overflow; show preview + popup with email/text/resolve actions (DEV_NOTES; better mobile too). **(live-verify)**                                                                                                                                                                                                                                 |

Admin-powers inventory: all 17 expected powers exist in code with UI (approve/decline, cancel, no-show, refund grant, debt view/settle, create-on-behalf, edit-any, reschedule, windows, overnight nights, services CRUD, full settings, onboarding status, Kiche toggle, reviews moderation, inquiries, ban-via-declined). Gaps = AD1 (conflict UI), AD4 (reason), AD3 (friendliness, not capability). Ban-from-meet-greets needs no dedicated surface — `declined` covers it (maintainer decision 2026-06-10).

### SP5 planning decisions (2026-06-11)

Spec + plans committed ([spec](2026-06-11-sp5-admin-design.md), [SP5a plan](../plans/2026-06-11-sp5a-admin-operational-surfaces.md), [SP5b plan](../plans/2026-06-11-sp5b-admin-awareness-layer.md)); 20 maintainer-approved mockups in [`mockups/sp5/`](../mockups/sp5/NOTES.md). Split SP5a (operational surfaces) / SP5b (awareness layer); both schema-free. Maintainer override: **every** admin surface gets a Cal-friendly functional-UX pass, not just the finding-tagged ones.

- **AD1 → RE-ROUTED out of SP5** to the grill-required **Recurring workflow rework** (interleaved item). Maintainer reframed conflicts as a **booking-time, client-side** concern — first-come-first-served; a new recurring series reschedules its own conflicting occurrences at booking time; **Cal needs no conflict inbox**. Root cause is the roll cron's lazy materialization → a recurring-engine fix, not an admin surface. No `series_conflicts` table; `AttentionCounts.flaggedConflicts` stays 0.
- **AD2, AD3 → SP5a** (pruned at SP5a DoD). **AD5 → SP5b** (pruned at SP5b DoD).
- **AD4 → deferred** to the cancellation-fee/debt spec (cancellation email doesn't exist; SP4b deferred it to SP6).
- **AD7 → resolved already** (live-verify: admin inquiries-client shipped the preview cards + bottom-sheet popup + Email/Text/Resolve/View-client via the inquiries-tab + SP3b dialog work). Pruned, no SP5 work.
- **No-show removed** (maintainer): SP5 strips it from all admin UI + the "No-Show Charge %" settings control + unwires `markNoShow`; the backend rip-out (action, `no_show_charge_pct` column, `no_show` debit reason) is deferred to the debt spec.
- **SP4 payment-action polish** (deferred from SP4) lands in SP5a client-detail: payment-status pills, retained-half line, the `disputed_at`/`dispute_status` marker surface.
- **SP6 notes recorded:** client booking-calendar premium-day legend; sidebar lucide icons; the unified `<BookingFlow>` then carries U1/U2 fixes for both public + admin.

## SP6 — cohesion + feedback + responsiveness

| ID  | Sev | Finding                                                                                                                                                                                                                                                                                                       |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | C   | No success state/redirect after `createBooking` succeeds — book button appears to "just break" (user-reported). Result union returned but page renders nothing for success.                                                                                                                                   |
| U2  | M   | Lead-time guard surfaces as an error message; should render as unavailability (grayed slots) with optional "contact Cal for sooner" note. Core returns `unavailable` correctly — UI labeling wrong.                                                                                                           |
| U3  | m   | Nav active-state misses /onboarding (checks `startsWith("/account")`) — account underline bug (with A12). **Resolved by SP3b:** /onboarding moved out of the `(account)` group entirely, so it no longer mis-highlights Account.                                                                              |
| U4  | M   | `returnTo` redirect-back only implemented for `/book/` paths; login/signup from any other page dumps the user at a default landing. Generalize with the same open-redirect guard.                                                                                                                             |
| U5  | M   | Text overflow: long contact messages (and other user text) overflow containers; sweep every user-text surface for wrap/clamp. **(live-verify each)**                                                                                                                                                          |
| U6  | M   | Booking-confirm step lacks prepay explanation + cancellation-penalty disclosure (U9/DEV_NOTES); policy values are Cal-tunable settings — render from settings, don't hardcode.                                                                                                                                |
| U7  | m   | Toasts are fixed-length; redesign sizing/duration in SP3 primitive, apply here. **Primitive built (SP3b):** type-based duration (success/info auto-dismiss, errors sticky+assertive), content-clamped sizing + motion; sitewide application (tagging each call site's `type`) remains the SP6 cohesion sweep. |
| U8  | m   | Client's own bookings should render muted-clay in calendar slots; time-calendar lacks "your booking is here" indicator.                                                                                                                                                                                       |
| U9  | m   | Return-to-top button (bottom-right) on long pages.                                                                                                                                                                                                                                                            |
| U10 | m   | Booking detail: show fuller service info per booking.                                                                                                                                                                                                                                                         |
| U11 | m   | Empty/overflow/confusing states sitewide sweep at desktop + mobile + breakpoint transition — full walk with `busy-week` scenario. **(live-verify — this is the SP6 entry activity)**                                                                                                                          |
| U12 | m   | Footer social/email icon links are placeholders — add correct email icon + update all footer links before launch. **(live-verify targets with Cal)**                                                                                                                                                          |
| U13 | m   | "Contact page?" open question from DEV_NOTES — decide whether a dedicated /contact route is needed (Cal decision); current contact flow is the inquiry form on the home/admin surface.                                                                                                                        |

## SP7 — performance

| ID  | Sev | Finding                                                                                                                                                                                                                                                                                                                                                           |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | C   | **All 32 routes build dynamic (ƒ) — zero static.** Root cause: `SiteHeader` (in every zone's `PageShell`) calls `createClient()`/`getUser()` → cookies → whole tree dynamic, including all marketing pages. Fix: auth-aware header widget becomes client-side (browser session) or PPR, marketing pages go static/ISR. This is the "slow navigations" root cause. |
| P2  | M   | Lighthouse (local prod, mobile): perf 0.74–0.89; LCP 3.8–4.4 s on home/gallery/book; TBT 400 ms on /book/walk (scheduler JS). Budgets after fix: LCP < 2.5 s, TBT < 200 ms, CLS 0 (already 0; a11y already 1.0).                                                                                                                                                  |
| P3  | M   | Zero `loading.tsx` / no Suspense boundaries — layouts block on auth+profile queries before any paint (admin/account feel slow).                                                                                                                                                                                                                                   |
| P4  | M   | `listClientsCore` runs ~5 independent queries sequentially (~5× latency). Parallelize with `Promise.all`. Sweep other actions for the same pattern.                                                                                                                                                                                                               |
| P5  | M   | Gallery lightbox loads full-resolution originals (no sizes/quality variants, no preload) — user-reported slowness.                                                                                                                                                                                                                                                |
| P6  | m   | Defensive memoization across scheduler components (59 useMemo/useCallback) — profile, keep only load-bearing ones.                                                                                                                                                                                                                                                |
| P7  | m   | Vercel page analytics not set up (DEV_NOTES "later").                                                                                                                                                                                                                                                                                                             |

## DEV_NOTES triage (decisions)

- **Feature roadmap, not findings** (booking-mutation P2-P4, after SP4): reschedule generalization for paid bookings; cancel bookings (+ reason + refund semantics → AD4/PAY3); recurring rework; account inquiries enhancements.
- **Already shipped, verify + close**: account inquiries tab (route exists); admin manual booking entry (create-on-behalf shipped 2026-06-10; polish in SP5).
- **Rejected**: removing admin add-pet button (AD2 — fix scoping instead, capability is legit for phone bookings).
- **Cal/ops questions, not code**: dedicated send-address for automated email (needed before notification system); "we" vs Cal-third-person voice (copy-sync decision); website logo.
- **Post-program ideas** (unchanged): dynamic gallery priority/descriptions, placeholder accounts for migrating manual clients.

## SP1 — docs (this register's own home)

### Resolved

- D1–D3 resolved by SP1 (doc architecture), 2026-06-10.
- S1 resolved by SP2 (db seeding framework), 2026-06-10.
- A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 resolved by SP3a (codebase structure), 2026-06-10.
- A2, A12, A13, A14, A16 resolved by SP3b (system IA + UI primitives), 2026-06-10. U3 resolved; U7/AD5 primitives built (sitewide application + count wiring remain SP6/SP5). A15 → SP7.

---

_Last reviewed: 2026-06-10_
