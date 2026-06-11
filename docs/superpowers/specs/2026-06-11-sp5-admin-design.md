# SP5 — Admin overhaul (Cal-friendly) (design)

> Companion: [roadmap](2026-06-10-professionalization-roadmap-design.md) §SP5, [findings register](2026-06-10-audit-findings.md) §SP5, [SP4 spec](2026-06-10-sp4-payments-design.md) (payment-action polish deferred here). **Visual contract:** [mockups + decision log](../mockups/sp5/NOTES.md) — 20 mockups produced with the maintainer via the visual companion; the formal decisions below mirror that log. Split into **SP5a** (operational surfaces) and **SP5b** (awareness layer), mirroring the 3a/3b · 4a/4b precedent; this spec covers both, plan SP5a first.

## Goal

Bring every admin surface to an industry-standard, **Cal-friendly** state: a non-technical operator never meets a raw internal (minutes-since-midnight, percentages as bare integers, `pricing_config` JSON, `JSON.stringify`'d form data, raw enum text), every power is surfaced where Cal expects it, and the SP4 payment data (payment status, partial refunds, disputes) finally has a UI. This is a **functional-UX** pass — the best UI to surface each existing power — not the deep sitewide cohesion sweep (SP6) and not new capability (the [admin-powers inventory](2026-06-10-audit-findings.md) confirms all 17 powers already exist in code).

The aesthetic direction (frontend-design, spec stage): the admin **wears the same clothes as the public site** — the established Trail palette, Fraunces/Public Sans, the "sheet on a desk" chrome, semantic status tokens, nav-underline/sidebar-rect interactions. A warm, legible operator console, never a generic Material/Bootstrap admin panel. Tokens are law; AA contrast re-verified per surface; lucide icons throughout.

## Scope

**Owns** (findings register §SP5): **AD2** (add-pet scoping), **AD3** (settings humanization), **AD5** (attention badges) + the **SP4 payment-action polish** (refund/dispute/debt surfaces, deferred from SP4 to here). Plus the maintainer's **all-surfaces** directive: every admin surface gets a functional-UX pass, not just the finding-tagged ones.

**Re-routed / deferred / pruned:**

- **AD1 (series conflicts) → re-routed** to the grill-required **Recurring workflow rework** (interleaved roadmap item). Maintainer's model makes conflicts a **booking-time, client-side** concern (first-come-first-served; a new recurring series reschedules its own conflicting occurrences at booking time; **Cal never needs a conflict inbox**). Enforcing that is a recurring-engine change (the roll cron's lazy materialization is the root cause), so it belongs to the rework, not an admin surface. No `series_conflicts` table, no Cal resolver. `AttentionCounts.flaggedConflicts` stays unwired/0.
- **AD4 (cancel-reason → cancellation email) → deferred** to the cancellation-fee/debt spec (grill-required). The cancellation email doesn't exist yet (SP4b deferred it to SP6).
- **AD7 (inquiry preview+popup) → already shipped** (admin inquiries-client: preview cards + bottom-sheet popup + Email/Text/Resolve/View-client). **Prune at DoD, no work.**

**Out of scope (recorded):** manual client creation (profiles decoupled from auth — a feature, not a surfacing pass; later session); the deep cohesion sweep + sidebar lucide icons + client-facing premium-day calendar legend (SP6); the no-show backend rip-out and broader debt/fee mechanics (debt spec).

## Decomposition

| Slice    | Surfaces                                                                                                                                                                                        | Schema   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **SP5a** | Settings (AD3), Client detail (payment/dispute/debt + forms/pets/Kiche/onboarding + AD2), Availability + Premium days, Bookings hub, Clients index, Create/Edit booking flow, Services, Reviews | **none** |
| **SP5b** | AD5 nav badges (real `AttentionCounts`) + Dashboard redesign (attention list + today timeline)                                                                                                  | **none** |

Both slices are schema-free (AD1's table was the only proposed migration; re-routed). Execute SP5a first; SP5b is small and depends on nothing in 5a.

## Decisions (from maintainer grilling, 2026-06-11)

Full log in [mockups/sp5/NOTES.md](../mockups/sp5/NOTES.md). The load-bearing ones:

### Process / scope

1. **Split SP5a/SP5b** by operational-surface vs awareness-layer.
2. **All admin surfaces get a functional-UX pass** (not findings-only).
3. **AD1 re-routed, AD4 deferred, AD7 pruned, no-show removed** (UI now; backend later) — see Scope.
4. **No-show removed from all admin UI** + the "No-Show Charge %" settings control + `markNoShow` unwired. Backend rip-out (action, `no_show_charge_pct` column, `no_show` debit reason) → debt spec.

### Cross-cutting build decisions

5. **Calendars unify onto `<Scheduler>`** — the Bookings page drops its hand-rolled month grid for `<Scheduler.MonthGrid>` (inspect/read mode); Availability already uses it. One calendar family across admin.
6. **Booking flow modularized** — extract one `<BookingFlow>` (the stepped Scheduler → PetAssignment → QuantityForm → RecurringControls → QuotePanel layout) from the public `ServiceBookingClient`. Public booking, admin create-on-behalf, and admin edit all consume it via their own hook + header/footer slots. **Public path behavior-preserving**; SP6's U1/U2 flow fixes then land once and benefit all three.
7. **Fidelity:** lucide icons (never emoji), reuse existing primitives, AA contrast re-verified per surface (explicit DoD line per UI task), confirm popups via `useConfirm`.

### Surface decisions

8. **AD3 time control = option A** — hour / minute / AM-PM **Select-trio** on the base-ui Select primitive (token-styled, no new dep), reused for any clock field. Units printed beside every number; plain-language group headings; **Advanced collapse** for origin coords / road factor / avg speed. Stored as minutes internally.
9. **"Holiday" → "Premium days"** (label only; storage stays `holiday_dates` / `holiday_surcharge_cents` — no migration). **Date-editor moves to the Availability calendar** (mark a day ★ Premium → writes `holiday_dates`); the **rate** stays in Settings + a pointer.
10. **Client-detail payment surface:** payment pills (Paid / Unpaid / Partially refunded / Refunded — icon **and** colour); retained-half line ("Refunded $X · kept $Y"); **dispute = the single red alert** (ringed card + ⚠ pill + Stripe deep-link) — red reserved for disputes. Humanized status + debit reasons.
11. **Forms → reuse the account `FormCard`** (kills the raw-JSON dump); **Pets → reuse `PetItem` + `PetForm`** + a collapse. **AD2 fixed by construction** — admin add/edit-pet is the shared profile-scoped `PetForm`. Kiche → toggle + explanation; onboarding → the settable pill-Select.
12. **Bookings IA = model A** — Bookings page is the management hub; Availability is paint-only (booked cells = read-only inspect + "Manage →"). Bookings hub: **dual Calendar ⇄ List** sharing one filter bar; **inline actions in every row** (shared row component); Calendar view is a **full-width vertical stack** (month → read-only day timeline → list) with **click-to-isolate** and **search-greys-context** (hatched non-matching days + greyed timeline blocks).
13. **Availability cancel-by-blocking** — marking booked time unavailable pops a `useConfirm` naming the affected booking(s) + refund, then cancels + blocks inline; empty time blocks silently.
14. **Cancellation refund actor-aware** — **Cal-initiated/manual cancel = 100% refund**; client late-cancel = the `late_cancel_refund_pct` policy. `cancel-core` gains a contained actor/waive-fee path. Block-cancel = one batch, one shared reason (reason itself deferred to the debt spec).
15. **Services** — replace the raw-JSON `pricing_config` textarea with **structured price fields per pricing type**; approval/active → toggles; edit-only kept.
16. **Reviews** — status pills + filter tabs + rendered stars; light pass.
17. **Clients index** — quick-filter chips (Owing / Needs onboarding / Active) + sortable columns; keep the existing search + pill-onboarding-Select.
18. **SP5b dashboard** — drop bare stat cards; "Needs your attention" actionable task list + a read-only "Today" timeline (click → Bookings). AD5 badges wire `pendingApprovals` + `newInquiries` only.

## Industry validation (standing rule)

Targeted against the concrete findings; sources cited inline + listed below.

- **Form humanization / time controls** — clock-time pickers + manual entry, explicit unit labels, consistent AM/PM; avoid exposing raw internal representations ([1][2][3]). Drives AD3 (Select-trio time picker, units, Premium-day calendar marking over a YYYY-MM-DD list).
- **Notification badges** — `aria-label` conveys the count, `sr-only` text beside the visual badge, `aria-live` on change, restraint to avoid alert fatigue ([4][5][6]). Drives AD5 (`NavBadge` aria-label + the 2 wired counts only).
- **Table status badges** — colour **plus** icon/shape (never colour alone, for colour-blind users), reserve red for serious/time-sensitive, don't over-colour ([7]). Drives the payment pills (icon+colour) + dispute-as-the-only-red.
- **Attention dashboard** — task-centric "what needs attention / what action / what context", pending counters, proactive surfacing over raw-number dumps ([8][9]). Drives the SP5b dashboard (attention tasks + today timeline, no stat grid).

## Current state (grounding, verified against code)

- `settings-client.tsx` — one generic text/number `field()`; minutes-since-midnight with parenthetical hints, bare-integer %, lat/lng/road-factor, a YYYY-MM-DD `<textarea>` for holidays.
- `client-detail-client.tsx` — approve/decline/cancel/no-show + a Balance/debits section; **no `payment_status`, no `refunded_cents`, no dispute marker** surfaced; raw `booking.status` / `debit.reason`; Forms dumped via `JSON.stringify` in a `<pre>`.
- `availability-client.tsx` — `<Scheduler>` (paint windows/unavailable/overnight) **plus** a duplicate Bookings list + `BusySidePanel` moderation (raw status, no-show button). `setWindowUnavailable` refuses on booking conflict.
- `bookings-calendar-client.tsx` — a **hand-rolled** month grid (dots) + status filter + client search → per-day moderation (raw status, no-show). Duplicates availability's moderation + a second calendar implementation.
- `clients-index-client.tsx` — responsive table→cards, search, inline `OnboardingStatusSelect`, red balance. Already on-pattern.
- `admin-create-booking-client.tsx` — "Adapted from the public ServiceBookingClient"; reuses the shared primitives + `useBookingScheduler` substrate but **duplicates the stepped-flow JSX**. `useEditBooking` already serves client + admin via an `admin?` prop.
- `services-client.tsx` — `pricing_config` edited as **raw JSON** in a textarea; approval/active checkboxes.
- `reviews-client.tsx` — author + `★`-text rating + raw status text + Publish/Reject; close to fine.
- `admin/page.tsx` — 5 bare stat-number cards. `attention-counts.ts` ships `emptyAttentionCounts`; `NavBadge` built (SP3b). `series-cron.ts:329` catches `23P01` → `conflicts++` → unmaterialized + `console.error` only.

## Architecture

### SP5a — operational surfaces (no schema)

Each surface is one task; all behavior-preserving on the data layer (server actions/cores unchanged except the two noted). Build against the matching mockup; tokens-only, lucide, AA, mobile parity (the established table→cards / bottom-sheet / drawer patterns).

1. **Settings (AD3).** Replace the generic `field()` with humanized controls: a `<TimePicker>` Select-trio (hour/minute/AM-PM ↔ minutes-since-midnight, pure converters unit-tested); unit-suffixed number inputs (%, miles, days, hours, $); plain-language `fieldset` legends; an **Advanced** `<details>` collapse for origin coords / road factor / avg speed. Remove the "No-Show Charge %" control + the holiday-dates textarea (dates move to Availability). Mockups: `ad3-settings-direction`, `time-control`.

2. **Premium days.** UI rename only (storage unchanged). Settings keeps the rate + a pointer. The Availability calendar gains a ★ Premium day-action that toggles membership in `settings.holiday_dates` (reads/writes the existing setting via a small admin action; optimistic like the other availability mutations). Legend gains the ★ state. Mockups: `holiday-on-availability`, `availability-full`.

3. **Client detail.** (a) **Payment:** add payment pills + retained-half line + dispute alert (reads SP4b's `payment_status` / `refunded_cents` / `disputed_at` / `dispute_status`); humanize `status`/`reason`. (b) **Forms:** render via the account `FormCard` (extract a shared, profile-scoped variant; admin reads the target client's responses, edit-any allowed) — delete the JSON `<pre>`. (c) **Pets:** render via `PetItem` + add a collapse; add/edit through the shared profile-scoped `PetForm` (**AD2 fix**). (d) Kiche toggle + explanation; onboarding pill-Select. (e) Remove the no-show button. Mockups: `client-payment-surface`, `client-detail-rest-v2`, `forms-pets-reuse`.

4. **Availability.** (a) Remove the duplicate Bookings list + `BusySidePanel` moderation; booked-cell click → read-only inspect (Scheduler `BookingDetailsPanel`) + "Manage on Bookings →" / "View client →". (b) **Cancel-by-blocking:** when `setWindowUnavailable` would hit booked time, the client pre-checks affected bookings and routes through a `useConfirm` that lists them + the **full** refund, then cancels (actor-aware, see task 7) + blocks; empty time blocks silently. (c) Premium ★ day-action (task 2). (d) Keep the time-paint `WeekGrid`/`DayTimeline`. Mockups: `availability-full`, `block-cancel-v2`, `model-a-surfaces`.

5. **Bookings hub.** (a) Replace the hand-rolled grid with `<Scheduler.MonthGrid>` (inspect/read mode) — calendar unification. (b) **Dual view** Calendar ⇄ List + one shared filter bar (humanized status Select + client search). (c) A shared **booking-row-with-actions** component (Approve/Decline/Cancel via confirm + Edit link) rendered in both views; remove no-show. (d) Calendar view = vertical stack (month → read-only `DayTimeline` → list) with click-to-isolate; (e) **search greys** non-matching days (hatch) + timeline blocks (pure filter predicate, unit-tested). Mockups: `model-a-refined`, `bookings-hub-v2`, `bookings-calendar-v4`.

6. **Clients index.** Add quick-filter chips (Owing / Needs onboarding / Active — pure predicates) + sortable columns (pure comparators); keep the existing search + pill-Select. Mockup: `clients-index`.

7. **Booking flow modularization + actor-aware cancel.** (a) Extract `<BookingFlow>` from `ServiceBookingClient`; refactor public + admin-create (`AdminCreateBookingClient`) + admin-edit to consume it via hook + header/footer slots (public behavior-preserving; characterization test guards it). AD2's pet-add already routes through the shared `PetForm` via `PetAssignment`. (b) **Actor-aware refund:** `cancel-core` gains a `fullRefund`/actor flag; admin/manual cancels refund 100%, client late-cancel keeps the policy %; pure refund computation unit-tested for both actors. Mockups: `create-on-behalf`, `bookingflow-modular`.

8. **Services.** Replace the JSON textarea with structured per-pricing-type field sets (mirror the `pricing_config` schemas; a small typed editor per type, like the forms field-set pattern); approval/active → toggles; edit-only. Mockup: `services-reviews`.

9. **Reviews.** Status pills + filter tabs (All/Pending/Published/Rejected) + rendered stars (lucide) + Publish/Reject. Mockup: `services-reviews`.

### SP5b — awareness layer (no schema)

10. **AD5 nav badges.** Wire `AttentionCounts` from real queries (`pendingApprovals` = pending-approval bookings; `newInquiries` = new inquiries; `flaggedConflicts` left 0). Place `NavBadge` on the relevant admin nav items with `aria-label` carrying the count (e.g. "Bookings, 2 awaiting approval") + sr-only text; gold fill, restraint. Count source is a single server query reused by the dashboard.

11. **Dashboard redesign.** Replace the 5 stat cards with: a **"Needs your attention"** task list (pending approvals, new inquiries, clients owing, reviews to moderate — each icon + what + context + action link; "All caught up ✓" when empty) and a read-only **"Today" timeline** (`Scheduler.DayTimeline`, inspect mode) whose blocks link to the Bookings page. Mockups: `sp5b-attention` (conflict panel superseded), `dashboard-v2`.

### Seams preserved (do not regress)

- The webhook stays the **sole writer** of `bookings.payment_status`; payment surfaces are **read-only** displays of SP4 data. The actor-aware cancel still only **initiates** refunds via `cancel-core`/gateway (never writes `payment_status`).
- `<BookingFlow>` extraction is **behavior-preserving** for the public path (the load-bearing booking gates live in the cores/hook, untouched).
- Calendar unification reuses the existing `<Scheduler>` capabilities seam (a read/inspect preset); no Layer-1/2 changes.
- Shared `FormCard` / `PetForm` keep their existing account behavior; the admin variants are profile-scoped consumers.

## Testing

- **Pure units:** time-of-day ↔ minutes converters; clients-index filter predicates + sort comparators; bookings search/isolate filter predicate; actor-aware refund computation (admin 100% vs client policy %); per-type pricing-config field ↔ JSON mapping.
- **Component/characterization:** `<BookingFlow>` characterization test (public path unchanged) before the extraction; payment-pill/dispute rendering from SP4 fields; cancel-by-blocking confirm lists affected bookings.
- **Seed:** extend `admin-demo` (+ `payment-states`) to cover the states the new surfaces display — a partially-refunded booking (exists from SP4b), a disputed payment (`disputed_at`/`dispute_status`), a premium day, a multi-pet client with forms on file, a client owing a balance, pending-approval bookings (for the badges/dashboard). Local-only seeder (SP2).
- **Gates per slice (WORKFLOW):** `tsc --noEmit` strict, lint (boundaries), full suite, fresh-session `/code-review`, manual `verify` (desktop + mobile + breakpoint walk of each changed surface — mobile parity).

## Risks / known gaps

- **`<BookingFlow>` touches the public booking page.** Mitigated: characterization test first, behavior-preserving extraction, public path is the safety net for U1/U2 (SP6). If the extraction proves deep, it can be the first SP5a task reviewed in isolation.
- **Calendar unification** swaps the bookings grid for `<Scheduler>` — verify inspect/read capabilities cover the needs without enabling paint in the bookings context.
- **Actor-aware refund** changes refund amounts on admin cancel (50%→100% for soon bookings). Pre-launch, test mode, disposable data; covered by a projection/refund unit test + manual `verify`.
- **Services per-type editor** depends on the `pricing_config` schemas staying typed; if a type's schema is loose, fall back to labeled fields for the known keys + guard unknowns.

## Definition of done

- **SP5a:** every operational surface matches its mockup — Cal-friendly controls (no raw internals), payment/dispute/debt surfaced from SP4 data, forms/pets via shared profile-scoped components (AD2 closed), bookings IA model A (hub dual-view + paint-only availability + unified `<Scheduler>` calendar + cancel-by-blocking with actor-aware full refund), Services structured pricing, Reviews polish, no-show gone from the UI; `<BookingFlow>` extracted (public behavior-preserving); seeds extended; gates green. Prune AD2/AD3 + the SP4 payment-polish note.
- **SP5b:** `AttentionCounts` wired (2 counts) + `NavBadge` placed with a11y; dashboard = attention list + today timeline; gates green. Prune AD5.
- **Register/roadmap (same commit):** AD1 re-routed to the recurring rework; AD4 noted in the debt spec; AD7 pruned (already shipped); the no-show backend rip-out noted for the debt spec; SP6 notes recorded (sidebar lucide icons, client premium-day legend).

## Sources

1. Eleken — Time Picker UX. https://www.eleken.co/blog-posts/time-picker-ux
2. NN/G — Date-Input Form Fields. https://www.nngroup.com/articles/date-input/
3. PatternFly — Time picker guidelines. https://www.patternfly.org/components/date-and-time/time-picker/design-guidelines/
4. Material Design 3 — Badges accessibility. https://m3.material.io/components/badges/accessibility
5. PatternFly — Notification badge. https://www.patternfly.org/components/notification-badge/
6. W3C ARIA APG — Badge (state indicator) pattern. https://github.com/w3c/aria-practices/issues/2507
7. UX Movement — The Right Way to Design Table Status Badges. https://uxmovement.medium.com/the-right-way-to-design-table-status-badges-31f65a927dab
8. Pencil & Paper — Dashboard UX patterns. https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards
9. GlitchLabs — Admin Dashboard UX Patterns for Operational Teams. https://www.glitchlabs.app/insights/admin-dashboard-ux-patterns

---

_Last reviewed: 2026-06-11 (planning session — spec + SP5a/SP5b plans committed; execution next session)_
