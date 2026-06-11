# SP5 admin overhaul — design notes (running)

> Captured live during the SP5 planning session (2026-06-11, senior-designer + maintainer Alex via visual companion). Source of truth for the formal spec (`docs/superpowers/specs/2026-06-11-sp5-admin-design.md`) + the SP5a/SP5b plans. Mockups in this folder are the visual contract a later execution session reads. **WIP — design dialogue ongoing; sections below append as decisions land.**

## Scope & decomposition (maintainer grilling)

- **Split SP5a / SP5b** (precedent 3a/3b, 4a/4b). **SP5a** = operational surfaces, **no new schema** (settings, client-detail incl. SP4 payment/dispute/debt, availability, bookings hub, clients index, create-on-behalf + AD2, edit-booking, services, reviews, inquiries). **SP5b** = awareness layer, **new mechanism** (AD5 attention-count wiring + nav badges, AD1 series-conflict persistence + surface, dashboard "needs attention").
- **Every admin surface gets a Cal-friendly _functional-UX_ pass** (maintainer override of "findings-only") — best UI to surface each power to Cal. Deep sitewide cohesion stays SP6.
- **AD4 (cancel-reason → cancellation email) deferred in full** to the grill-required cancellation-fee/debt spec (overlaps that domain; cancellation email doesn't exist yet, SP4b deferred it to SP6).
- **AD7 (inquiry preview+popup) already shipped** (admin inquiries-client: preview cards + bottom-sheet popup + Email/Text/Resolve/View-client). → **prune at DoD, don't build.**
- **No-show removed.** SP5 removes it from all admin UI (client-detail button, availability moderation, bookings hub) + the "No-Show Charge %" settings control, and unwires `markNoShow`. The **backend rip-out** (drop `markNoShow`, `no_show_charge_pct` column, `no_show` debit reason) is a **debt-model** change → deferred to the debt spec (don't half-rip a debit reason historical rows may reference).

## Cross-cutting

- **Global fidelity:** lucide icons (never emojis), reuse existing primitives (Input search, Badge, Select, useConfirm, useToast, Dialog, Scheduler), AA contrast **re-verified per surface** (explicit DoD line on every UI task). Tokens are law.
- **Confirm popups** = the `useConfirm` ConfirmDialog (alertdialog; centered desktop / bottom-sheet mobile; focus-trap).
- **Calendars unified onto `<Scheduler>`** — the Bookings page drops its hand-rolled month grid for `<Scheduler.MonthGrid>` (inspect/read mode); Availability already uses it. One calendar component everywhere.

## AD3 — Settings (mockups: ad3-settings-direction, time-control)

- Humanized controls: **clock-time pickers** for open/close (control **option A** — hour / minute / AM-PM **Select-trio** on the existing base-ui Select primitive; fully token-styled, no new dep; reused for reminder-lead-time + any clock field). Stored as minutes internally; Cal sees clock time.
- **Units beside every number** ($, %, miles, days, hours). Plain-language group headings ("When can clients book?").
- **Advanced collapse** for rarely-touched internals (origin lat/lng, road factor, avg speed).
- No functionality lost.

## Premium days (mockups: holiday-on-availability, availability-full)

- **Rename "holiday" → "Premium days"** — label only; storage stays `settings.holiday_dates` / `holiday_surcharge_cents` (internals Cal never sees; no migration).
- **Date-editor moves to the Availability calendar** — mark a day ★ Premium (writes `holiday_dates`); the **rate** stays in Settings (+ a pointer). No YYYY-MM-DD textarea.
- **SP6 note:** client booking calendar gets a matching ★ "premium day" legend state so clients see surcharge days while booking.

## Client detail (mockups: client-payment-surface, client-detail-rest-v2, forms-pets-reuse)

- **Payment surfaced** (SP4 data): payment pills (Paid / Unpaid / Partially refunded / Refunded — icon **and** colour, not colour alone); **retained-half line** ("Refunded $X · kept $Y"); **dispute = the single red alert** (ringed card + "⚠ Disputed · needs response" + deep-link to Stripe) — red reserved for disputes only (alert-fatigue). Humanized status + debit reasons.
- **Forms → reuse the account `FormCard`** (collapsible per-form viewer), profile-scoped — kills the raw `JSON.stringify` dump. Any form type displays.
- **Pets → reuse `PetItem` + `PetForm`** with a collapse added (identity in header, detail behind toggle). **AD2 fixed by construction** — admin add/edit-pet is the shared `PetForm` bound to the target client, so it structurally can't bind to the wrong profile.
- **Kiche** → real toggle + one-line explanation. **Onboarding** → the existing settable **pill-style Select** (`OnboardingStatusSelect`).

## Availability (mockups: availability-full, block-cancel-v2, model-a-surfaces)

- **Paint-only re: bookings** (IA model A) — booked cells are context; clicking a booked cell = **read-only inspect** (who/what/when/pets + status) with "Manage on Bookings →" / "View client →". No moderation list here.
- **Time-paint kept** — single-day `WeekGrid`/`DayTimeline` for partial-day windows stays.
- **Premium toggle** sits beside Set-window / Mark-unavailable in the day actions.
- **Cancel-by-blocking** — marking booked time unavailable pops a confirm naming the affected booking(s) + the refund, then cancels + blocks inline. Empty time blocks silently.

## Cancellation refund semantics

- **Cal-initiated / manual cancel = 100% refund** (Cal's backing out; client not penalised). **Client late-cancel = the `late_cancel_refund_pct` policy.** Today `cancel-core` ignores actor → SP5 adds a **contained actor-aware rule** (admin/manual → full refund). Broader debt/fee mechanics stay in the debt spec.
- **Block-cancel = one batch, one shared reason** (when AD4 reason lands, deferred) — likely a "Cal unavailable" preset applied to all affected bookings; individual cancels get their own reason.

## Bookings hub — IA **model A** (mockups: bookings-ia-options, model-a-surfaces, bookings-hub-v2, bookings-calendar-v4)

- **The management hub.** All moderation lives here + client-detail (not on availability).
- **Dual view: Calendar ⇄ List**, one shared filter bar (Status dropdown + client search). **Inline actions in every row** — Approve/Decline/Cancel (Cancel → confirm) + Edit (link); **shared booking-row-with-actions component** across both views.
- **Calendar view = full-width vertical stack:** month grid → read-only **day timeline** (real booking times, reuses `Scheduler.DayTimeline`) → day's booking list. Clicking a timeline block **isolates** that booking in the list ("Show all" restores).
- **Search greys the calendar + timeline** — days/timeline-blocks with no match are hatched/greyed (context kept, matches pop). Status filter behaves the same.

## Clients index (mockup: clients-index)

- Light pass (already a responsive table→cards w/ search + inline onboarding). Add **quick-filter chips** (Owing / Needs onboarding / Active — "Owing" mirrors the dashboard count) + **sortable columns**. Keep the existing `Input` search, pill-style onboarding Select, lucide icons.
- **Open decision:** manual client creation (for phone clients who never self-register) — in or out of SP5? (parked as post-program idea; raised again.)

## Still to design

- Create-on-behalf flow (AD2 context), edit-booking (admin), services CRUD, reviews moderation, inquiries sign-off, SP5b (dashboard attention + AD5 nav badges + AD1 conflict surface).

## Mockup index

Open any in a browser. Latest version per surface is the highest `-vN` suffix.

- `ad3-settings-direction.html` · `time-control.html` — Settings
- `holiday-on-availability.html` · `availability-full.html` — Premium days + Availability
- `client-payment-surface.html` · `client-detail-rest-v2.html` · `forms-pets-reuse.html` — Client detail
- `block-cancel-v2.html` — cancel-by-blocking (full refund, shared reason)
- `bookings-ia-options.html` · `model-a-surfaces.html` · `model-a-refined.html` · `bookings-hub-v2.html` · `bookings-calendar-v4.html` — Bookings IA + hub
- `clients-index.html` — Clients
