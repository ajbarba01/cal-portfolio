# Phase 3 — Client Account + Booking (design overhaul)

> Spec for the fifth cycle of the design overhaul (umbrella roadmap:
> `~/.claude/plans/ok-sure-lets-try-splendid-plum.md`, Phase 3). Phases 0, 1,
> Shell-Unification, and 2 are DONE on local `main` (unpushed). This spec owns the
> **what + why**; the implementation plan (next, via `writing-plans`) owns the how.

## Goal

Redesign the **client account + booking** page bodies — still functional
wireframes (ad-hoc `max-w-*`, raw inputs, minimal styling) sitting inside the
already-polished shell — so they compose the shipped shell + component kit, adopt
the interaction language + feedback taxonomy, and humanize every client-facing
input. The Scheduler is the centerpiece and gets a **Layer-3 restyle only** per
the FRONTEND.md three-layer contract.

Surfaces in scope:

- `/book/[serviceSlug]` — the Scheduler booking flow + its client wrappers.
- `(account)`: `/account` (profile), `/account/pets`, `/account/forms`,
  `/account/bookings`.
- `/onboarding` — first-time gate (profile + emergency form).
- `(auth)`: `/login`, `/signup` form bodies.

## Constraints honored (not restated — see the docs)

- Scheduler **Layers 1–2 are off-limits**; Layer 3 = classNames only (FRONTEND.md
  three-layer contract). The one exception below (Clear-dates) only wires an
  existing Layer-2 API into a Layer-3 control.
- Two-layer tokens; components reference semantic roles only; whitespace from
  `space.*`; type from `typeScale`. No hardcoded color.
- Internal nav = `<Link>` only. A11y floor (semantic HTML, AA contrast, visible
  focus, keyboard nav incl. focus-trap + Esc). **Mobile parity is a per-surface
  acceptance criterion** — explicit mobile pattern stated for each surface.
- Copy stays `[[ ]]`-placeholdered (Colorado-only rules, DESIGN.md). TS strict,
  no `any`. Commit subject-line only. Same-commit doc rule for FRONTEND.md /
  DESIGN.md. Do **not** push (`main` auto-deploys to prod; Alex batches the push).

## Design decisions (locked in brainstorm, visual companion)

### A. Scheduler restyle — Layer-3 only, **thick clay-ring selection**

- Swap classNames on the compound parts (`Scheduler.MonthGrid`,
  `Scheduler.WeekGrid`, `Scheduler.DayPanel`, `Scheduler.SelectionSummary`,
  `Scheduler.WeekActions`, `Scheduler.Legend`, `Scheduler.BookingDetailsPanel`)
  to the warm token system + interaction language. Layers 1–2 untouched.
- **Selection emphasis (Alex feedback): selection = a thick `--brand` clay ring**,
  replacing the charcoal `border-primary` outline. The selection still _composes
  over_ the status fill (the show-through principle stays intact — availability
  green/blue/gray reads underneath). Applied identically in the **week-slot time
  grid** for consistency. The `Legend` "Selected" swatch updates to the clay ring.
- Status fills stay as the existing semantic `--status-*` roles (green available /
  blue booked / gray unavailable — reconciled to the warm base already). Chrome
  warmed: week-nav arrows + hover, day/time-label text, grid hairlines, calendar
  wrapper border, `BookingDetailsPanel` + `SelectionSummary` panel surfaces →
  card/border tokens; focus rings → brand. Buttons follow the interaction language
  (deepen on hover, 1px press).
- **One functional addition (not pure classNames):** a **"Clear dates"** affordance
  on the booking **month** flow. Rationale: `BOOK_HOUSE_SITTING` is `editable:false`,
  so `DayPanel`/`WeekActions` (which own clear) render null and the range path can
  only _grow_ the contiguous set — a user who picks the wrong range is stuck
  (recorded in the `scheduler-deferred-followups` memory). The control wires to the
  **existing** `selection.clearDays()` Layer-2 API; no Layer-2 logic changes. All
  other deferred scheduler minors stay deferred.

### B. Booking page `/book/[serviceSlug]` — **Layout B (two-column + sticky summary)**

Chosen over single-column (A) and guided stepper (C). C was rejected: it fights the
"browse availability freely before signing in" deferred-auth model.

- **Desktop:** two columns. Left = the booking steps (calendar → pets → details →
  recurring). Right = a **sticky summary rail** holding the live quote breakdown +
  total + approval note + **Book** button, kept in view while the left column
  scrolls.
- **Mobile:** single column; the rail collapses to a **sticky bottom action bar**
  (estimated price + Book pinned, safe-area aware) so Book is never a scroll away.
- Restyle the client wrappers (presentational only; business state in
  `ServiceBookingClient` is untouched): `quote-panel` (itemized estimate → rail
  card), `pet-assignment` (pet cards with avatars + selected = clay), `quantity-forms`
  (unit-suffixed steppers / checkboxes), `recurring-controls` (toggle + count).
  Numbered step headers move to the type scale.
- **Feedback:** retire the bespoke `MessageBanner`. Validation/affordance errors
  render inline; the submit/booking result (off-screen) fires a **toast**;
  load/availability failure → `ErrorState`; empty/unavailable → `EmptyState`. The
  deferred-auth gate (guest/un-onboarded → `/login`|`/onboarding` with `returnTo`)
  and `createBooking` backstop are **unchanged**.

### C. Account zone (compose `AppShell` + `PageHeader` + kit)

- **`/account` (profile):** contact-info card + change-password card. Email stays
  read-only (from `auth.users`). Save shows an inline "Saved ✓" (routine in-place
  save, not a toast). Phone masked.
- **`/account/pets`:** pet **cards** (avatar via `PetAvatar`, name/species/breed/
  notes). **Edit expands the row in place** into the pet form; **Add** is the same
  form (name, **dog/cat segmented select**, breed, notes, **photo upload /
  dropzone**). **Delete routes through `ConfirmDialog`** (centered desktop /
  bottom-sheet mobile). Edit/Add card outline = neutral `--border` (matches the
  forms edit treatment — Alex feedback: keep editing outlines consistent, not clay).
- **`/account/forms`:** each form is a **status card** (Completed / Not started) that
  **expands in place** to edit; fields grouped by legend; `FormField` **inline
  validation** at the field. Registry-driven so future service forms (e.g. Walk)
  drop into the same card pattern.
- **`/account/bookings`:** the kit **Table** (→ stacked labeled cards below `md`),
  status **badges** (confirmed / pending_approval / completed / …), amount-owed +
  **Pay** (`PrepayButton`). Friendly `EmptyState` for no upcoming / no history.
- **Sidebar (`AppShell`):** **drop the "Back to site" affordance** — the global
  `SiteHeader` (full marketing nav + account menu) renders on every zone after
  shell-unification, so it is redundant. Footer keeps identity + sign-out.
- **No payment-info tab.** Card entry happens in **Stripe hosted checkout** at pay
  time (PCI-safe; we store no card data). Sidebar stays Profile · Pets · Forms ·
  Bookings. A saved-cards tab (Stripe SetupIntents + vault) is noted as a **future
  hook**, out of MVP scope (sits with the deferred deposit system).

### D. Auth + onboarding

- `/login`, `/signup`, `/onboarding` form bodies adopt `FormField`, masked phone,
  friendly inline validation, and the `brand` button. `/onboarding` drops its
  hardcoded `max-w-lg` and composes the shell/`PageContainer`. The auth flow and
  the `returnTo` deferred-auth round-trip logic are **unchanged**.

### E. Cross-cutting (Standard 6 — human inputs; feedback taxonomy)

- **Inputs humanized:** phone masks on every phone field (profile, onboarding's
  profile + emergency-contact + vet, and the emergency form); numeric ZIP; friendly
  validation via `FormField`. **No new time/date
  picker** — the booking flow uses the Scheduler grid, not a standalone picker, so
  pickers stay **deferred to Phase 4** (admin) per the roadmap.
- **Feedback taxonomy** applied across all surfaces: inline field errors · toast for
  off-screen results · `ConfirmDialog` for destructive actions · `ErrorState` /
  `EmptyState` for load/empty (no raw "Failed to load …" / bare strings).

## Mobile parity (explicit per surface)

- **Booking:** two-column → single column; summary rail → **sticky bottom action
  bar** (price + Book, safe-area). Calendar/week-grid already horizontally
  scroll-contained; verify no page h-scroll. Targets ≥44px.
- **Account profile/forms:** cards stack; grouped fields go single-column; segmented
  select stays tappable ≥44px.
- **Pets:** Delete `ConfirmDialog` = **bottom-sheet**; inline edit/add forms stack.
- **Bookings:** Table → **stacked labeled cards** (kit behavior).
- **Auth/onboarding:** single-column forms full-width; buttons full-width.

## Out of scope

- Scheduler Layers 1–2 logic; all `scheduler-deferred-followups` minors **except**
  the booking-month Clear-dates wiring.
- Phase 4 admin surfaces + admin input humanization; standalone time/date pickers.
- Saved-cards / payment-method management; the deposit-system policy.
- Copy authoring (stays `[[ ]]`).

## Verification (the phase completion gate)

- Automated gate green: `npm run lint`, `npm run typecheck`, `npm run build`
  (page count unchanged), `npm test` (the pure Scheduler Layer-2 utils keep
  passing — restyle must not touch them; the one flaky `payments.test.ts` local-DB
  seed collision is environmental — confirm any failure reproduces in isolation
  before chasing).
- Phase-2-carryforward **live ≤390px + keyboard-a11y walk**, now spanning the
  booking + account + auth routes: focus-trap + Esc on `ConfirmDialog`, the mobile
  drawer, and any inspector; visible focus; `aria-current`; light **and** dark; no
  horizontal scroll; Book reachable via the sticky bar on mobile.
- Token-contract check: the restyle introduces **no** hardcoded colors and **no**
  Layer-1/Layer-2 scheduler edits (selection-ring + Clear-dates are the only
  scheduler changes; Clear-dates calls the existing `clearDays()`).

## Docs to update (same-commit rule)

- **FRONTEND.md:** note the Scheduler selection treatment is now the **clay ring**
  (Layer-3), the booking two-column + sticky-rail / mobile bottom-bar pattern, and
  that the account/auth bodies compose the shell + feedback taxonomy. Add
  `--destructive-warm` to the brand-token list if still missing (carry-forward).
- **DESIGN.md:** confirm the booking flow + account route descriptions match the
  shipped composition; record "no payment-info tab; Stripe hosted checkout; saved
  cards = future hook."

---

_Last reviewed: 2026-06-06_
