# SP5a — Admin operational surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every operational admin surface Cal-friendly — humanized settings, the SP4 payment/dispute/debt data surfaced, forms/pets via shared profile-scoped components (closing AD2), bookings IA model A (a dual-view hub + paint-only availability on one unified `<Scheduler>` calendar + cancel-by-blocking with actor-aware full refund), structured Services pricing, Reviews polish, and the booking flow modularized into one `<BookingFlow>` — with no schema changes and no-show removed from the UI.

**Architecture:** Behavior-preserving on the data layer except two contained changes (a `holiday_dates` add/remove admin action; an actor-aware `fullRefund` path in `cancel-core`). Everything else composes existing primitives (`Scheduler`, `FormCard`, `PetForm`, `PetAssignment`, `useConfirm`, `useToast`, `Badge`, `Select`, `Input`) per the committed mockups in [`docs/superpowers/mockups/sp5/`](../mockups/sp5/NOTES.md). Pure logic (time converters, filter predicates, refund computation, pricing-config field mapping) is extracted and unit-tested; presentational wiring is verified by render/characterization tests + the manual `verify` walk.

**Tech Stack:** Next.js App Router, TypeScript strict, `@base-ui/react` + shadcn-style components, Tailwind semantic tokens, Vitest (+ jsdom for hooks/components), Supabase (local stack), lucide-react.

**Spec:** [`2026-06-11-sp5-admin-design.md`](../specs/2026-06-11-sp5-admin-design.md). **Visual contract:** the mockup named per task.

**Standing rules for every task:** tokens only (no hardcoded colour/spacing); lucide icons (no emoji); AA contrast re-verified; mobile parity (table→cards / bottom-sheet / drawer per [FRONTEND.md](../../FRONTEND.md)); commit messages are **subject-line only**, Conventional Commits, **no body/trailers/Co-Authored-By**, no phase/codename. Gate each task: `npm run typecheck` (or `tsc --noEmit`) + `npm run lint` clean before commit.

---

## File map

- **Settings:** `src/app/(admin)/admin/settings/_components/settings-client.tsx` (rewrite controls); new `src/components/ui/time-picker.tsx` + `src/lib/time-of-day.ts` (+ test).
- **Premium days:** new `src/features/admin/premium-days-actions.ts` (add/remove a date in `settings.holiday_dates`); Availability day-actions + Settings pointer.
- **Client detail:** `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`; new payment-pill helpers in `src/features/payments/` (+ test); shared form/pet viewers (see Task 3).
- **Shared form/pet viewers:** extract from `src/app/(account)/account/forms/_components/forms-client.tsx` + `.../pets/_components/pets-client.tsx` into `src/features/accounts/_components/` consumed by both zones.
- **Availability:** `src/app/(admin)/admin/availability/_components/availability-client.tsx` + `busy-side-panel.tsx`.
- **Bookings hub:** `src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx` (rewrite onto `<Scheduler>`); new shared `booking-row.tsx`; new `src/features/admin/bookings-view.ts` (filter/search/isolate predicates + test).
- **Clients index:** `src/app/(admin)/admin/clients/_components/clients-index-client.tsx`; new `src/features/admin/clients-view.ts` (filter predicates + comparators + test).
- **Booking flow:** new `src/features/booking/_components/booking-flow.tsx` consumed by `ServiceBookingClient` + `AdminCreateBookingClient` + the edit client; `src/features/booking/cancel-core.ts` (actor-aware refund) + test.
- **Services:** `src/app/(admin)/admin/services/_components/services-client.tsx`; new `src/features/admin/pricing-config-fields.ts` (per-type field ↔ JSON map + test).
- **Reviews:** `src/app/(admin)/admin/reviews/_components/reviews-client.tsx`.
- **Seed:** `scripts/db-seed/scenarios/admin-demo.ts` (+ `payment-states.ts`).

> Confirm exact paths at execution time (`Glob`/`Grep`) — the file map reflects the 2026-06-11 tree.

---

## Task 1: Time-of-day converter + `<TimePicker>` (AD3 foundation)

**Files:**

- Create: `src/lib/time-of-day.ts`, `src/lib/time-of-day.test.ts`
- Create: `src/components/ui/time-picker.tsx`

- [ ] **Step 1: Write the failing test** (`time-of-day.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { minutesToClock, clockToMinutes } from "./time-of-day";

describe("time-of-day", () => {
  it("splits minutes-since-midnight into 12h parts", () => {
    expect(minutesToClock(390)).toEqual({
      hour12: 6,
      minute: 30,
      meridiem: "AM",
    });
    expect(minutesToClock(0)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "AM",
    });
    expect(minutesToClock(720)).toEqual({
      hour12: 12,
      minute: 0,
      meridiem: "PM",
    });
    expect(minutesToClock(1320)).toEqual({
      hour12: 10,
      minute: 0,
      meridiem: "PM",
    });
  });
  it("round-trips", () => {
    for (const m of [0, 1, 390, 719, 720, 721, 1320, 1439]) {
      const c = minutesToClock(m);
      expect(clockToMinutes(c.hour12, c.minute, c.meridiem)).toBe(m);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/lib/time-of-day.test.ts`) — "minutesToClock is not a function".

- [ ] **Step 3: Implement** (`time-of-day.ts`)

```ts
export type Meridiem = "AM" | "PM";
export interface Clock {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

export function minutesToClock(total: number): Clock {
  const h24 = Math.floor(total / 60);
  const minute = total % 60;
  const meridiem: Meridiem = h24 < 12 ? "AM" : "PM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, meridiem };
}

export function clockToMinutes(
  hour12: number,
  minute: number,
  meridiem: Meridiem,
): number {
  const base = hour12 % 12; // 12 -> 0
  const h24 = meridiem === "PM" ? base + 12 : base;
  return h24 * 60 + minute;
}
```

- [ ] **Step 4: Run it — expect PASS.**

- [ ] **Step 5: Build `<TimePicker>`** (`time-picker.tsx`) — a controlled component: props `{ value: number; onChange: (minutes: number) => void; label: string; id: string }`. Renders three token-styled base-ui `Select`s (hour 1–12, minute in 5-min steps, AM/PM) seeded from `minutesToClock(value)`, calling `onChange(clockToMinutes(...))`. Each Select has an `aria-label`; the group is wrapped in a labeled `fieldset`/`Label`. Match the `time-control.html` mockup (option A). No new dependency — reuse the existing `Select` in `src/components/ui/`.

- [ ] **Step 6: Typecheck + lint, then commit.**

```bash
git add src/lib/time-of-day.ts src/lib/time-of-day.test.ts src/components/ui/time-picker.tsx
git commit -m "feat: add time-of-day converter and TimePicker"
```

---

## Task 2: Settings humanized controls (AD3)

**Files:**

- Modify: `src/app/(admin)/admin/settings/_components/settings-client.tsx`

**Visual contract:** `mockups/sp5/ad3-settings-direction.html`.

- [ ] **Step 1:** Replace the open/close minute number inputs with `<TimePicker>` (Task 1), bound to `openMinute`/`closeMinute` state (still submitted as integers to `updateSettings`). Verify the existing settings integration test (if any) still passes; otherwise add a small render test asserting the picker shows "6:30 AM" for `booking_open_minute=390`.

- [ ] **Step 2:** Replace bare number inputs with unit-suffixed inputs (a small local `UnitField` wrapping the existing `Input` with a trailing unit span): `%` for `late_cancel_refund_pct` / `recurring_discount_pct`; `miles` for the distance thresholds; `days` for the horizons; `hours` for lead/refund-cutoff/reminder; `$` (dollars↔cents) for `holiday_surcharge_cents`. Plain-language `fieldset` legends per the mockup ("When can clients book?", "Cancellations").

- [ ] **Step 3:** Move origin lat/lng, road factor, avg speed into an **Advanced** `<details>` collapse (native `<details>`/`<summary>` styled with tokens), collapsed by default.

- [ ] **Step 4: Remove the "No-Show Charge %" control** entirely and the holiday-dates `<textarea>` block (dates move to Availability, Task 5). Leave `no_show_charge_pct` out of the submitted payload (the column stays in DB; backend rip-out is the debt spec). Add a one-line pointer where holidays were: "Premium days are set on the Availability calendar." (lucide `CalendarDays` + link).

- [ ] **Step 5:** Manual check on the local stack (`npm run dev`): open `/admin/settings`, confirm times render as clock pickers, units show, Advanced collapses, no No-Show field, save round-trips (the converter keeps the stored minutes identical).

- [ ] **Step 6: Typecheck + lint, commit.**

```bash
git add src/app/\(admin\)/admin/settings/_components/settings-client.tsx
git commit -m "feat: humanize admin settings controls"
```

---

## Task 3: Shared profile-scoped Forms + Pets viewers (closes AD2)

**Files:**

- Create: `src/features/accounts/_components/form-card.tsx` (extracted from `forms-client.tsx`), `src/features/accounts/_components/pet-list.tsx` (extracted from `pets-client.tsx`)
- Modify: the two account clients to consume the extracts (behavior-preserving); export from `src/features/accounts/index.client.ts`

- [ ] **Step 1: Characterization test** — before moving anything, add a jsdom render test (`// @vitest-environment jsdom`) for the account `FormsClient` asserting it shows the form label + "Completed" status for an existing response and toggles open on the Edit/Start button. Run it green against the current code.

- [ ] **Step 2:** Extract the presentational `FormCard` (header label + status pill + open/close toggle + the per-key field sets) into `form-card.tsx`, accepting props `{ formKey, existing, onSubmit }` so the submit action is injected (account passes `submitForm`; admin passes an admin on-behalf submit scoped to the target client). Extract the `PetItem` + add/edit `PetForm` composition into `pet-list.tsx` accepting `{ pets, onAdd, onEdit, onDelete }` (collapse added: identity in header, detail behind a `<details>`/toggle per `forms-pets-reuse.html`). Re-point `FormsClient`/`PetsClient` at the extracts.

- [ ] **Step 3:** Run the characterization test (+ full account suite) — expect PASS (behavior-preserving).

- [ ] **Step 4: Commit.**

```bash
git add src/features/accounts
git commit -m "refactor: extract shared form and pet viewers"
```

---

## Task 4: Client detail — payment/dispute/debt + forms/pets + Kiche/onboarding

**Files:**

- Create: `src/features/payments/payment-display.ts` + `.test.ts` (pure pill/label helpers)
- Modify: `src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx`

**Visual contract:** `client-payment-surface.html`, `client-detail-rest-v2.html`, `forms-pets-reuse.html`.

- [ ] **Step 1: Failing test** (`payment-display.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { paymentPill, retainedHalfLabel } from "./payment-display";

describe("payment-display", () => {
  it("maps status to pill label + tone", () => {
    expect(paymentPill("partially_refunded").label).toBe("Partially refunded");
    expect(paymentPill("paid").tone).toBe("paid");
  });
  it("renders retained-half from cents", () => {
    expect(retainedHalfLabel({ finalCents: 20000, refundedCents: 10000 })).toBe(
      "Refunded $100.00 · kept $100.00",
    );
    expect(
      retainedHalfLabel({ finalCents: 20000, refundedCents: 0 }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `payment-display.ts` — `paymentPill(status)` → `{ label, tone }` over the `BookingPaymentStatus` union (`unpaid|paid|partially_refunded|refunded`); `retainedHalfLabel({finalCents,refundedCents})` → string or null; a `disputeLabel(disputeStatus)` helper. Tones map to existing status tokens; dispute is the only one using `--destructive`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Wire client-detail:** per-booking row shows `paymentPill` (icon+colour via `Badge`), the retained-half line when present, and — when `disputed_at` is set — a ringed card + a `⚠ Disputed · {status}` destructive pill + an external link to the Stripe dashboard (`https://dashboard.stripe.com/test/payments/{intentId}`). Humanize `booking.status` + `debit.reason` via small label maps. **Remove the No-show button.** Replace the Forms `<pre>` JSON dump with the shared `FormCard` (Task 3) scoped to this client; replace the Pets section with the shared `pet-list` (Task 3) wired to the profile-scoped `PetForm`. Kiche → a token toggle + one explanatory line; onboarding stays the `OnboardingStatusSelect` pill.
- [ ] **Step 6:** Manual check: a seeded partially-refunded booking shows the retained-half line; a disputed payment shows the alert; forms render as labeled rows; adding a pet lands on this client.
- [ ] **Step 7: Typecheck + lint, commit.**

```bash
git add src/features/payments/payment-display.ts src/features/payments/payment-display.test.ts "src/app/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"
git commit -m "feat: surface payments disputes and shared forms on client detail"
```

---

## Task 5: Premium days on the Availability calendar

**Files:**

- Create: `src/features/admin/premium-days-actions.ts` (+ test) — `setPremiumDay(dateKey, on)` reads `settings.holiday_dates`, adds/removes the `YYYY-MM-DD`, writes back via the service client (admin-gated, same pattern as `updateSettings`).
- Modify: `availability-client.tsx` (day-action + legend), Settings pointer (done in Task 2).

- [ ] **Step 1: Failing test** for the pure list edit (`premium-days.test.ts`): a helper `togglePremiumDate(dates: string[], key: string, on: boolean)` → sorted unique list. Cover add, remove, idempotent add, remove-absent.
- [ ] **Step 2: Run — FAIL.** **Step 3:** implement the pure helper; the action wraps it. **Step 4: Run — PASS.**
- [ ] **Step 5:** Add a "★ Premium day" toggle to the Availability day-actions (beside Set-window / Mark-unavailable), calling `setPremiumDay`; reflect membership with the ★ treatment on month cells + a Legend entry. Per `availability-full.html`. Optimistic update consistent with the existing window/night optimistic layers.
- [ ] **Step 6: Typecheck + lint, commit.**

```bash
git add src/features/admin/premium-days-actions.ts src/features/admin/premium-days.test.ts "src/app/(admin)/admin/availability/_components/availability-client.tsx"
git commit -m "feat: mark premium days on the availability calendar"
```

---

## Task 6: Actor-aware cancellation refund

**Files:**

- Modify: `src/features/booking/cancel-core.ts` + its test; thread an actor/`fullRefund` flag from `cancelBooking` (admin path) — confirm the call sites in `client-detail-client.tsx`, `availability-client.tsx`, `bookings-calendar-client.tsx`.

- [ ] **Step 1: Failing test** — extend `cancel-core` tests: a Cal-initiated cancel of a soon, fully-prepaid booking refunds **100%**; a client late-cancel of the same booking refunds `late_cancel_refund_pct`. Assert the computed `refundCents`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3:** Add a `fullRefund: boolean` (or `actor: "admin" | "client"`) parameter to the refund computation; when set, `refundCents = paidCents` regardless of timing. Default preserves current client behavior. The admin server action passes `fullRefund: true`.
- [ ] **Step 4: Run — PASS** (+ full payments/booking suite green).
- [ ] **Step 5: Commit.**

```bash
git add src/features/booking/cancel-core.ts src/features/booking/*cancel*.test.ts
git commit -m "feat: full refund on admin-initiated cancellation"
```

---

## Task 7: Bookings view predicates + shared booking row

**Files:**

- Create: `src/features/admin/bookings-view.ts` + `.test.ts` (filter by status, match client query, group by day, isolate-by-id)
- Create: `src/app/(admin)/admin/bookings/_components/booking-row.tsx` (shared row + inline actions)

- [ ] **Step 1: Failing test** (`bookings-view.test.ts`) — `filterBookings(rows, {status, query})` (humanized statuses, reuse `matchesClientQuery`), `daysWithMatch(rows, query)` → set of day keys that have a match (for the calendar hatch), `isolate(rows, id)`.
- [ ] **Step 2: Run — FAIL. Step 3:** implement pure predicates. **Step 4: Run — PASS.**
- [ ] **Step 5:** Build `booking-row.tsx`: props `{ booking, onApprove, onDecline, onCancel, pending }` rendering client + service + readable time + status `Badge` + payment pill (Task 4 helper) + inline Approve/Decline (pending only) + Edit link + Cancel (→ `useConfirm`). Mobile = stacked card. Per `bookings-hub-v2.html`.
- [ ] **Step 6: Commit.**

```bash
git add src/features/admin/bookings-view.ts src/features/admin/bookings-view.test.ts "src/app/(admin)/admin/bookings/_components/booking-row.tsx"
git commit -m "feat: add bookings view predicates and shared booking row"
```

---

## Task 8: Bookings hub — dual view on the unified `<Scheduler>`

**Files:**

- Modify: `src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx` (rewrite)

**Visual contract:** `bookings-calendar-v4.html`, `bookings-hub-v2.html`.

- [ ] **Step 1:** Add a `view: "calendar" | "list"` segmented toggle + the shared filter bar (humanized status `Select` + client `Input` search) driving both views via Task 7 predicates.
- [ ] **Step 2: List view** — flat chronological list of filtered bookings using `booking-row` (Task 7), paginated, mobile stacked.
- [ ] **Step 3: Calendar view** — replace the hand-rolled month grid with `<Scheduler.MonthGrid>` (a read/inspect capabilities preset; confirm `ADMIN`/`BOOKING` presets or add a minimal `INSPECT` preset that mounts MonthGrid + DayTimeline without paint). Vertical stack: month → read-only `<Scheduler.DayTimeline>` for the selected day → the day's `booking-row` list. Clicking a timeline block isolates that booking in the list (`isolate`, "Show all" restores).
- [ ] **Step 4: Search greys context** — non-matching days render hatched (a `data-` flag + token style), non-matching timeline blocks greyed, via `daysWithMatch`/`filterBookings`.
- [ ] **Step 5:** Manual `verify`: filter "all pending", search a client, toggle Calendar/List, click a timeline block to isolate; desktop + mobile + breakpoint.
- [ ] **Step 6: Typecheck + lint, commit.**

```bash
git add "src/app/(admin)/admin/bookings/_components/bookings-calendar-client.tsx"
git commit -m "feat: dual-view bookings hub on the shared scheduler"
```

---

## Task 9: Availability — paint-only + cancel-by-blocking

**Files:**

- Modify: `availability-client.tsx`, `busy-side-panel.tsx`

**Visual contract:** `availability-full.html`, `block-cancel-v2.html`, `model-a-surfaces.html`.

- [ ] **Step 1:** Remove the duplicate Bookings list + `BusySidePanel` moderation. Booked-cell click → read-only inspect (`Scheduler.BookingDetailsPanel`) with "Manage on Bookings →" + "View client →" links. Delete `markNoShow` usage here.
- [ ] **Step 2: Cancel-by-blocking** — when `setWindowUnavailable`/day-block targets time with bookings, pre-resolve the affected bookings (from `initialBusy`) and route through `useConfirm` listing each + the **full** refund amount (Task 6), then on confirm cancel each (admin full-refund) and apply the block; empty time blocks silently (current behavior).
- [ ] **Step 3:** Manual `verify`: blocking a booked day prompts with the booking(s) + full refund, then clears + blocks; blocking empty time is silent.
- [ ] **Step 4: Typecheck + lint, commit.**

```bash
git add "src/app/(admin)/admin/availability/_components/availability-client.tsx" "src/app/(admin)/admin/availability/_components/busy-side-panel.tsx"
git commit -m "feat: availability paint-only with cancel-by-blocking"
```

---

## Task 10: Booking flow modularization (`<BookingFlow>`)

**Files:**

- Create: `src/features/booking/_components/booking-flow.tsx`
- Modify: `ServiceBookingClient` (public), `AdminCreateBookingClient`, the edit client — each becomes a thin wrapper.

- [ ] **Step 1: Characterization test** — add/confirm a jsdom render test of the public `ServiceBookingClient` covering the step structure (calendar, pets section for pet-aware, quantities, quote panel). Run green on current code (the SP3b `use-service-booking.characterization.test.tsx` is the model).
- [ ] **Step 2:** Extract the shared stepped layout into `BookingFlow` accepting a flow-state object (the common subset of the three hooks' returns) + `header` and `quoteFooter` slots. Re-point `AdminCreateBookingClient` (header = "for {client}", footer = force-confirm) and `ServiceBookingClient` (header = auth/returnTo, no footer) and the edit client at it.
- [ ] **Step 3:** Run the characterization test + full booking suite — expect PASS (public behavior-preserving). Verify `next build`.
- [ ] **Step 4: Commit.**

```bash
git add src/features/booking/_components/booking-flow.tsx "src/app/(marketing)/book/[serviceSlug]/_components" "src/app/(admin)/admin/clients/[clientId]/book/_components" "src/app/(account)/account/bookings/[id]/edit/_components"
git commit -m "refactor: unify booking flow into one component"
```

---

## Task 11: Services structured pricing editor

**Files:**

- Create: `src/features/admin/pricing-config-fields.ts` + `.test.ts`
- Modify: `services-client.tsx`

**Visual contract:** `services-reviews.html`.

- [ ] **Step 1: Failing test** — `pricingFields(pricingType, config)` → an ordered list of `{ key, label, kind: "cents"|"int"|"minutes", value }`, and `fieldsToConfig(pricingType, fields)` → the JSON object. Cover each pricing type present in the codebase (grep `pricing_config` / the `PricingType` union; one case per type).
- [ ] **Step 2: Run — FAIL. Step 3:** implement the per-type field maps from the actual `pricing_config` schemas (read `src/features/pricing`); guard unknown keys by passing them through untouched. **Step 4: Run — PASS.**
- [ ] **Step 5:** Replace the JSON `<textarea>` with structured labeled inputs from `pricingFields` (dollars for cents, plain for ints/minutes); approval/active → token toggles; on save, `fieldsToConfig` rebuilds the object for `updateService`. Edit-only.
- [ ] **Step 6: Commit.**

```bash
git add src/features/admin/pricing-config-fields.ts src/features/admin/pricing-config-fields.test.ts "src/app/(admin)/admin/services/_components/services-client.tsx"
git commit -m "feat: structured pricing editor for services"
```

---

## Task 12: Clients index filters + sort; Reviews polish

**Files:**

- Create: `src/features/admin/clients-view.ts` + `.test.ts`
- Modify: `clients-index-client.tsx`, `reviews-client.tsx`

**Visual contracts:** `clients-index.html`, `services-reviews.html`.

- [ ] **Step 1: Failing test** (`clients-view.test.ts`) — `applyClientFilter(rows, "owing"|"needs_onboarding"|"active"|"all")` predicates + `sortClients(rows, key, dir)` comparators (name, balance, bookings).
- [ ] **Step 2: Run — FAIL. Step 3:** implement. **Step 4: Run — PASS.**
- [ ] **Step 5:** Clients index — add quick-filter chips + sortable headers using the predicates; keep the existing `Input` search + `OnboardingStatusSelect` pill.
- [ ] **Step 6:** Reviews — status `Badge` pills + filter tabs (All/Pending/Published/Rejected) + lucide star rendering + Publish/Reject (keep `moderateReview`).
- [ ] **Step 7: Typecheck + lint, commit.**

```bash
git add src/features/admin/clients-view.ts src/features/admin/clients-view.test.ts "src/app/(admin)/admin/clients/_components/clients-index-client.tsx" "src/app/(admin)/admin/reviews/_components/reviews-client.tsx"
git commit -m "feat: clients index filters and reviews moderation polish"
```

---

## Task 13: Seed extension

**Files:**

- Modify: `scripts/db-seed/scenarios/admin-demo.ts` (+ `payment-states.ts` if states live there)

- [ ] **Step 1:** Extend `admin-demo` so the new surfaces have data to show: a partially-refunded booking (SP4b model), a disputed payment (set `disputed_at` + `dispute_status`), at least one premium day in `settings.holiday_dates`, a multi-pet client with a submitted form, a client owing a balance, and ≥2 pending-approval bookings. Reuse SP2 factories; local-URL guard already enforced.
- [ ] **Step 2: Run** `npm run db:seed -- admin-demo` against the local stack — expect idempotent success; spot-check the surfaces in the browser.
- [ ] **Step 3: Commit.**

```bash
git add scripts/db-seed
git commit -m "test: seed admin-demo states for new admin surfaces"
```

---

## Final gates + close-out (after all tasks)

- [ ] `npm run typecheck` · `npm run lint` (0 errors) · `npx vitest run` (the SP5a unit/characterization tests green; the 7 known pre-existing shared-DB isolation failures documented in prior plans are not new) · `next build`.
- [ ] Manual `verify` walk (desktop + mobile + breakpoint) of every changed surface against its mockup; confirm no raw internals remain, no no-show anywhere, payments/disputes/retained-half visible, AD2 add-pet lands on the right client.
- [ ] Fresh-session `/code-review` (author never grades itself). Address findings.
- [ ] Prune **AD2, AD3** + the SP4 payment-polish note from the findings register (done in the planning commit's register edit if resolved; otherwise at DoD).
- [ ] Update HANDOFF Progress + Session log.

## Handoff log

(append blockers/deviations during execution)
