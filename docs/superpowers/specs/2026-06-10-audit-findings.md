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

SP3 split into **SP3a** (codebase structure — DONE 2026-06-10) and **SP3b** (system IA + UI primitives — pending). SP3a resolved A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 (behavior-preserving refactor: cross-feature moves, enforced feature boundaries with client/server entry split, booking-service split, scheduler cell primitive, client-state hooks, mutation layer, notifier seam, suppression cleanup, CONTEXT + ADRs 0001–0004). The two remaining findings below carry to **SP3b**.

| ID  | Sev | Finding                                                                                                                                                                                                      |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A2  | M   | Two parallel confirm-dialog implementations: `components/feedback/confirm-dialog.tsx` (promise hook) vs `components/ui/confirm-dialog.tsx` (controlled). 12 call sites, no unified seam. Standardize on one. |
| A12 | m   | Onboarding lives beside /account but nav treats it as foreign (see U3) — decide IA placement (move under account or fix active-state) as system-architecture call.                                           |

## SP4 — payments

| ID   | Sev | Finding                                                                                                                                                                                                                                                                                      |
| ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY1 | C   | Payment flow is a dead-end: PaymentIntent created + payments row inserted, but Stripe Elements never mounted — `prepay-button.tsx:28` TODO shows "card entry coming soon". No client confirmation step, no money can actually move.                                                          |
| PAY2 | C   | No Stripe keys in any env file (.env/.env.local/.env.test); no `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; no local webhook forwarding (Stripe CLI) documented. Set up **test mode** end-to-end (pretend money).                                                                                   |
| PAY3 | M   | Partial-refund accounting: late-cancel 50% refund flips the whole payments row to `refunded` (no refunded-amount column), and `computePaymentStatus` gives `paid` precedence over refunds — retained-half state is unrepresentable. Re-model refund amounts before building refund surfaces. |
| PAY4 | M   | Repeated prepay clicks create new PaymentIntents + `requires_payment` rows; abandoned intents never canceled/reused. Reuse open intent or cancel stale ones (industry practice).                                                                                                             |
| PAY5 | m   | No overpay guard if two intents both succeed (paidSum > final); define reconcile behavior (auto-refund excess).                                                                                                                                                                              |
| PAY6 | m   | Unhandled webhook events: `payment_intent.canceled`, `charge.dispute.*`. Add to event map or consciously ignore with comment.                                                                                                                                                                |
| PAY7 | m   | Booking-confirmation/cancellation emails don't mention payment policy (ties to U9); email copy is wireframe-level (`emails.ts` TODO).                                                                                                                                                        |

## SP5 — admin (Cal-friendly)

| ID  | Sev | Finding                                                                                                                                                                                                                                                    |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD1 | M   | Series-roll conflicts are flagged in cron output only — no admin surface lists "occurrences left pending due to conflict" (DEV_NOTES owed item). Cal can't see or resolve them.                                                                            |
| AD2 | M   | Admin create-on-behalf "add pet" binds to the wrong profile (UI-level; core `insertBookingPets` is correct). Root-cause fix: scope pet creation to the target client — do **not** remove the capability (rejects DEV_NOTES suggestion to drop the button). |
| AD3 | M   | Settings UI exposes raw values (minutes-since-midnight integers etc.). Cal-friendly controls owed: hour+minute pickers for open/close, labeled inputs for miles/horizon/refund-pct/holiday dates. **(live-verify exact fields)**                           |
| AD4 | M   | Cancel-with-reason: no reason field on admin/client cancel; reason should flow into the cancellation email (with booking-mutation P3).                                                                                                                     |
| AD5 | m   | No admin notification badges (wordmark/tabs) for pending approvals / new inquiries / flagged conflicts — "what needs Cal's attention now" surface missing (ties SP3 nav).                                                                                  |
| AD7 | m   | Inquiry list: long messages overflow; show preview + popup with email/text/resolve actions (DEV_NOTES; better mobile too). **(live-verify)**                                                                                                               |

Admin-powers inventory: all 17 expected powers exist in code with UI (approve/decline, cancel, no-show, refund grant, debt view/settle, create-on-behalf, edit-any, reschedule, windows, overnight nights, services CRUD, full settings, onboarding status, Kiche toggle, reviews moderation, inquiries, ban-via-declined). Gaps = AD1 (conflict UI), AD4 (reason), AD3 (friendliness, not capability). Ban-from-meet-greets needs no dedicated surface — `declined` covers it (maintainer decision 2026-06-10).

## SP6 — cohesion + feedback + responsiveness

| ID  | Sev | Finding                                                                                                                                                                                             |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | C   | No success state/redirect after `createBooking` succeeds — book button appears to "just break" (user-reported). Result union returned but page renders nothing for success.                         |
| U2  | M   | Lead-time guard surfaces as an error message; should render as unavailability (grayed slots) with optional "contact Cal for sooner" note. Core returns `unavailable` correctly — UI labeling wrong. |
| U3  | m   | Nav active-state misses /onboarding (checks `startsWith("/account")`) — account underline bug (with A12).                                                                                           |
| U4  | M   | `returnTo` redirect-back only implemented for `/book/` paths; login/signup from any other page dumps the user at a default landing. Generalize with the same open-redirect guard.                   |
| U5  | M   | Text overflow: long contact messages (and other user text) overflow containers; sweep every user-text surface for wrap/clamp. **(live-verify each)**                                                |
| U6  | M   | Booking-confirm step lacks prepay explanation + cancellation-penalty disclosure (U9/DEV_NOTES); policy values are Cal-tunable settings — render from settings, don't hardcode.                      |
| U7  | m   | Toasts are fixed-length; redesign sizing/duration in SP3 primitive, apply here.                                                                                                                     |
| U8  | m   | Client's own bookings should render muted-clay in calendar slots; time-calendar lacks "your booking is here" indicator.                                                                             |
| U9  | m   | Return-to-top button (bottom-right) on long pages.                                                                                                                                                  |
| U10 | m   | Booking detail: show fuller service info per booking.                                                                                                                                               |
| U11 | m   | Empty/overflow/confusing states sitewide sweep at desktop + mobile + breakpoint transition — full walk with `busy-week` scenario. **(live-verify — this is the SP6 entry activity)**                |
| U12 | m   | Footer social/email icon links are placeholders — add correct email icon + update all footer links before launch. **(live-verify targets with Cal)**                                                |
| U13 | m   | "Contact page?" open question from DEV_NOTES — decide whether a dedicated /contact route is needed (Cal decision); current contact flow is the inquiry form on the home/admin surface.              |

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
- A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 resolved by SP3a (codebase structure), 2026-06-10. A2, A12 carry to SP3b.

---

_Last reviewed: 2026-06-10_
