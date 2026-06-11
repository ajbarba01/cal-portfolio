# SP5 admin overhaul — design notes (complete)

> Captured live during the SP5 planning session (2026-06-11, senior-designer + maintainer Alex, via the superpowers visual companion). The mockups in this folder are the **visual contract** a later execution session reads; this file is the decision log behind them. Formal spec: `docs/superpowers/specs/2026-06-11-sp5-admin-design.md`; plans: `docs/superpowers/plans/2026-06-11-sp5a-*.md` + `2026-06-11-sp5b-*.md`. **Design phase complete — every admin surface covered.**

## Scope & decomposition

- **Split SP5a / SP5b.** **SP5a** = operational surfaces, **no new schema**. **SP5b** = awareness layer (AD5 badges + dashboard), now **no new schema either** (AD1 re-routed — see below).
- **Every admin surface gets a Cal-friendly _functional-UX_ pass** (maintainer override of "findings-only") — best UI to surface each power. Deep sitewide cohesion stays SP6.
- **AD4 (cancel-reason → cancellation email) deferred** to the grill-required cancellation-fee/debt spec.
- **AD7 (inquiry popup) already shipped** → prune at DoD, no work.
- **AD1 (series conflicts) RE-ROUTED out of SP5** → the **Recurring workflow rework** (grill-required interleaved item). Maintainer's model: conflicts are a **booking-time, client-side** concern — first-come-first-served (whoever books a slot first holds it; it's simply unavailable to the next booker), and a new recurring series whose occurrences conflict makes the **client** reschedule those occurrences at booking time. **Cal never needs a conflict inbox.** Enforcing this is a recurring-engine change (today the roll cron lazily materializes future occurrences, which is how a slot gets taken out from under a series), so it belongs to the recurring rework, not an admin surface. `series_conflicts` table + Cal-facing resolver **dropped**. `AttentionCounts.flaggedConflicts` stays unwired/0 until the rework defines it.
- **No-show removed.** SP5 removes it from all admin UI (client-detail, availability moderation, bookings hub) + the "No-Show Charge %" settings control, and unwires `markNoShow`. Backend rip-out (`markNoShow`, `no_show_charge_pct` column, `no_show` debit reason) deferred to the debt spec (don't half-rip a debit reason historical rows reference).

## Cross-cutting

- **Fidelity:** lucide icons (never emojis), reuse existing primitives (Input search, Badge, Select, useConfirm, useToast, Dialog, Scheduler, FormCard, PetForm, PetAssignment), AA contrast **re-verified per surface** (explicit DoD line on every UI task). Tokens are law.
- **Confirm popups** = `useConfirm` ConfirmDialog (alertdialog; centered desktop / bottom-sheet mobile; focus-trap).
- **Calendars unified onto `<Scheduler>`** — Bookings page drops its hand-rolled month grid for `<Scheduler.MonthGrid>` (inspect/read mode). One calendar everywhere.
- **Booking flow modularized** — extract one `<BookingFlow>` (the stepped layout) from the public `ServiceBookingClient`; public + admin-create + admin-edit all consume it via their own hook + header/footer slots. Public stays behavior-preserving; SP6's U1/U2 flow fixes then land once.

## Industry validation (cited in spec)

- Form humanization — Eleken time-picker, NN/G date-input, PatternFly time-picker.
- Notification badges — Material 3, PatternFly, W3C ARIA (aria-label conveys count, sr-only text, aria-live, restraint).
- Table status badges — UX Movement (colour **+** icon, reserve red for serious/time-sensitive, don't over-colour).
- Attention dashboard — Pencil & Paper, GlitchLabs (task-centric "what needs attention/action/context", proactive surfacing).

---

## SP5a surfaces

### Settings — AD3 (mockups: ad3-settings-direction, time-control)

- Clock-time pickers for open/close: **option A — hour / minute / AM-PM Select-trio** on the base-ui Select primitive (token-styled, no new dep; reused for reminder-lead-time + any clock field). Stored as minutes internally.
- Units beside every number ($, %, miles, days, hours). Plain-language group headings. **Advanced collapse** for origin lat/lng, road factor, avg speed.
- **"No-Show Charge %" control removed** (no-show gone). No functionality otherwise lost.

### Premium days (mockups: holiday-on-availability, availability-full)

- **Rename "holiday" → "Premium days"** (label only; storage stays `settings.holiday_dates` / `holiday_surcharge_cents`; no migration).
- **Date-editor moves to the Availability calendar** (mark a day ★ Premium → writes `holiday_dates`); the **rate** stays in Settings + a pointer. No YYYY-MM-DD textarea.
- **SP6 note:** client booking calendar gets a matching ★ premium-day legend state.

### Client detail (mockups: client-payment-surface, client-detail-rest-v2, forms-pets-reuse)

- **Payment surfaced** (SP4 data): payment pills (Paid / Unpaid / Partially refunded / Refunded — icon **and** colour); **retained-half line** ("Refunded $X · kept $Y"); **dispute = the single red alert** (ringed card + "⚠ Disputed · needs response" + Stripe deep-link). Red reserved for disputes only. Humanized status + debit reasons.
- **Forms → reuse account `FormCard`** (collapsible per-form viewer), profile-scoped — kills the raw JSON dump.
- **Pets → reuse `PetItem` + `PetForm`** + a collapse (identity in header, detail behind toggle). **AD2 fixed by construction** — admin add/edit-pet is the shared `PetForm` bound to the target client.
- **Kiche** → toggle + one-line explanation. **Onboarding** → existing settable **pill-style Select**.
- **No-show button removed** from the bookings section.

### Availability (mockups: availability-full, block-cancel-v2, model-a-surfaces)

- **Paint-only re: bookings** — booked cells = read-only inspect (who/what/when/pets + status + "Manage on Bookings →" / "View client →"). No moderation list.
- **Time-paint kept** — single-day `WeekGrid`/`DayTimeline` for partial-day windows.
- **Premium toggle** beside Set-window / Mark-unavailable in the day actions.
- **Cancel-by-blocking** — marking booked time unavailable pops a `useConfirm` popup naming the affected booking(s) + the refund, then cancels + blocks inline. Empty time blocks silently.

### Cancellation refund semantics

- **Cal-initiated / manual cancel = 100% refund**; **client late-cancel = the `late_cancel_refund_pct` policy.** `cancel-core` today ignores actor → SP5 adds a **contained actor-aware rule** (admin/manual → full refund). Broader debt/fee mechanics stay in the debt spec.
- **Block-cancel = one batch, one shared reason** (when AD4 reason lands, deferred) — a "Cal unavailable" preset across all affected bookings; individual cancels get their own.

### Bookings hub — IA **model A** (mockups: bookings-ia-options, model-a-surfaces, model-a-refined, bookings-hub-v2, bookings-calendar-v4)

- **The management hub** (all moderation here + client-detail; not on availability).
- **Dual view Calendar ⇄ List**, one shared filter bar (Status dropdown + client search). **Inline actions in every row** — Approve/Decline/Cancel (Cancel → confirm) + Edit (link); **shared booking-row-with-actions component** across both views.
- **Calendar view = full-width vertical stack:** month grid → read-only **day timeline** (real booking times, `Scheduler.DayTimeline`) → day list. Click a timeline block **isolates** that booking in the list ("Show all" restores).
- **Search greys context** — days / timeline-blocks with no match are hatched/greyed; matches pop. Status filter behaves the same.

### Clients index (mockup: clients-index)

- Light pass: **quick-filter chips** (Owing / Needs onboarding / Active) + **sortable columns**. Keep existing `Input` search, pill-style onboarding Select, lucide icons.
- **Open decision (out of SP5):** manual client creation (profiles decoupled from auth) → a later feature session, not a surfacing pass.

### Create-on-behalf + edit-booking (mockups: create-on-behalf, bookingflow-modular)

- **Unify onto the shared `<BookingFlow>`** (above). Admin create = public flow + "for {client}" header + force-confirm footer. **AD2 fixed** via the shared profile-scoped PetForm in `PetAssignment`.
- **Edit-booking already shared** (`useEditBooking` handles client + admin via an `admin?` prop; no separate admin component) — just consumes `<BookingFlow>` + theme.

### Services + Reviews (mockup: services-reviews)

- **Services:** replace the raw-JSON `pricing_config` textarea with **structured price fields generated per pricing type** (per-type field sets, like the forms pattern). Requires-approval / Active → toggles. **Edit-only kept** (no create/delete in SP5).
- **Reviews:** status pills, filter tabs (All/Pending/Published/Rejected), rendered stars, Publish/Reject. Light pass.

### Inquiries

- **Unchanged** — AD7 shipped. SP5's only inquiries touch is the `newInquiries` badge count (SP5b).

---

## SP5b — awareness layer (mockups: sp5b-attention, dashboard-v2)

- **AD5 nav badges** — wire real `AttentionCounts` (`pendingApprovals`, `newInquiries`; `flaggedConflicts` stays 0/unwired). Gold for "do something". aria-label carries the count; restraint to avoid fatigue.
- **Dashboard redesign** — drop the bare stat-number grid. **"Needs your attention"** = actionable task rows (icon + what + context + action link: approvals, new inquiries, clients owing, reviews to moderate); "All caught up ✓" when empty. **"Today" read-only timeline** (`Scheduler.DayTimeline`) → click a booking → opens it on the Bookings page.
- **SP6 note:** sidebar nav should use lucide icons (cohesion item, not SP5b).

---

## Mockup index (latest per surface = highest -vN)

- `ad3-settings-direction.html` · `time-control.html` — Settings
- `holiday-on-availability.html` · `availability-full.html` — Premium days + Availability
- `client-payment-surface.html` · `client-detail-rest-v2.html` · `forms-pets-reuse.html` — Client detail
- `block-cancel-v2.html` — cancel-by-blocking (full refund, shared reason)
- `bookings-ia-options.html` · `model-a-surfaces.html` · `model-a-refined.html` · `bookings-hub-v2.html` · `bookings-calendar-v4.html` — Bookings IA + hub
- `clients-index.html` — Clients
- `create-on-behalf.html` · `bookingflow-modular.html` — Create/edit booking
- `services-reviews.html` — Services + Reviews
- `sp5b-attention.html` · `dashboard-v2.html` — Dashboard + nav badges (dashboard-v2 is current; sp5b-attention's conflict panel is superseded by the AD1 re-route)
