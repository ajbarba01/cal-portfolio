# Phase 3 — Client Account + Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the client account + booking page bodies to compose the shipped shell + kit, adopt the interaction language + feedback taxonomy, and humanize inputs — with the Scheduler getting a Layer-3 (classNames-only) restyle plus a Clear-dates affordance.

**Architecture:** Almost entirely **presentational**. No pure-logic changes except one new phone-mask util (TDD'd). The Scheduler's Layers 1–2 (`schedule-selection`, `use-schedule-selection`, `scheduler-context`, `grid-runs`, `calendar-model`) are **never edited**; only the Layer-3 `<Scheduler.*>` className surface changes, plus wiring the existing `selection.clearDays()` into a new Layer-3 control. Booking business state in `ServiceBookingClient` is preserved; only its JSX layout + feedback presentation change.

**Tech Stack:** Next.js App Router, TypeScript (strict), Tailwind v4 + `@base-ui/react`, two-layer CSS-var tokens (`globals.css` + `design-tokens.ts`), react-day-picker v9, Vitest.

---

## Constraints (apply to EVERY task)

- **Token law:** components reference semantic roles only (`SEMANTIC_COLORS` in `src/lib/design-tokens.ts`) — never hex, never a primitive. Whitespace from `space.*`; type steps from `typeScale`. The clay accent is `--brand` (fill) / `--brand-strong` (AA text); the warm green for the "done" dot is `--status-available-foreground` (= `--green-deep`) with a `--status-available` (= `--green-soft`) halo.
- **Scheduler Layers 1–2 off-limits.** Do NOT edit `grid-runs.ts`, `schedule-selection.ts`, `use-schedule-selection.ts`, `scheduler-context.tsx`, `calendar-model.ts`, or any `*.test.ts`. The pure Layer-2 tests MUST stay green.
- **Internal nav = `<Link>` only.** No raw `<a href>` for in-app routes.
- **A11y floor** re-verified per surface: semantic HTML, AA contrast, visible focus, keyboard nav (focus-trap + Esc on dialogs/drawer), ≥44px targets.
- **Mobile parity is a build gate** (see spec § Mobile parity) — each surface's phone rendering is confirmed, not assumed.
- **Copy stays `[[ ]]`-placeholdered** where copy is Cal's. **Commit subject-line only** (Conventional Commits, no body/trailer). **Stage files by name** (quote any path with parens). **Do NOT push.**
- **Same-commit doc rule:** when a task changes a documented pattern, update FRONTEND.md / DESIGN.md in that same commit (called out per task).
- **Gate before each commit:** `npm run lint` && `npm run typecheck` && `npm test` green. Run `npm run build` before the final commit of each multi-file surface. (One flaky `payments.test.ts` local-DB seed collision is environmental — if it fails, re-run it in isolation `npx vitest run src/features/payments/payments.test.ts` to confirm it's not your change.)

## Reference: kit APIs (already built — compose, don't recreate)

- `Card`, `CardHeader`, `CardTitle`, `CardContent` — `src/components/ui/card.tsx` (`bg-card border rounded-xl p-5`).
- `Badge` variant ∈ `default|brand|available|booked|unavailable|destructive` — `src/components/ui/badge.tsx`.
- `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` — `src/components/ui/table.tsx`. Pass `data-label="Col"` on every `TableCell` (drives the mobile stacked-card label).
- `FormField` — `src/components/ui/form-field.tsx`. Props `{ label, name, hint?, error?, className? }` + EITHER input props OR `children` (XOR, enforced at type level). Controlled `error` string wires `aria-describedby`.
- `useConfirm()` → `{ confirm, dialog }` — `src/components/feedback/confirm-dialog.tsx`. `await confirm({ title, description?, confirmLabel?, destructive? })` resolves boolean; render `{dialog}` once in the component.
- `EmptyState` `{ title, message?, action?, icon? }` / `ErrorState` `{ title, message?, onRetry? }` — `src/components/feedback/`.
- `useToast()` (= base-ui `Toast.useToastManager`) — `src/components/feedback/toast.tsx`; `ToastProvider` is already mounted at root (`src/app/layout.tsx`). Fire with `const toast = useToast(); toast.add({ title, description?, type: "error" | undefined })` (type `"error"` → red icon, else success check).
- `PageHeader` `{ title, subtitle?, actions? }` renders the one `<h1>` — `src/components/layout/page-header.tsx`.
- `PageContainer` `width="read"|"app"`, `AppShell`, `accountNav` — `src/components/layout/`.
- Interaction language: top-bar links → `navUnderline`; sidebar → rect via `bg-sidebar-active`; buttons deepen on hover + 1px press (the `brand` button variant uses `--brand`).

## File structure (what each touched file owns after this phase)

**Scheduler Layer-3 (classNames only + one wired control):**

- `src/features/booking/_components/scheduler/month-grid.tsx` — clay-ring selection color + bold selected day number.
- `.../week-grid.tsx` — clay-ring selection color on the time grid; warmed chrome (nav, labels, borders).
- `.../legend.tsx` — "Selected" swatch → clay ring.
- `.../scheduler.tsx` — root wrapper surface (already `bg-card`; align radius/border tokens).
- `.../booking-details-panel.tsx`, `.../selection-summary.tsx` — warmed panel chrome.
- `.../day-panel.tsx`, `.../week-actions.tsx` — warmed chrome + buttons to interaction language (admin-only; render null in booking, live-verified in Phase 4).
- `src/features/booking/_components/scheduler/clear-dates.tsx` — **NEW** Layer-3 part calling `selection.clearDays()`.
- `src/features/booking/_components/scheduler/index.ts` (or the `Scheduler` compound namespace file) — export the new `Scheduler.ClearDates`.

**Booking flow:**

- `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — two-column + sticky rail + mobile bottom bar; toast/Error/Empty feedback (retire `MessageBanner`).
- `.../quote-panel.tsx` — receipt/ticket styling.
- `.../pet-assignment.tsx` — clay selected state.
- `.../quantity-forms.tsx` — labeled stepper styling.
- `.../recurring-controls.tsx` — styled toggle.

**Account:**

- `src/app/(account)/account/page.tsx` + `_components/profile-form.tsx`, `_components/password-form.tsx` — cards, inline saved, phone mask.
- `src/app/(account)/account/pets/page.tsx` + `_components/pets-client.tsx`, `src/features/accounts/_components/pet-form.tsx` — pet cards, inline edit/add, ConfirmDialog, segmented species, branded empty.
- `src/app/(account)/account/forms/_components/forms-client.tsx` — status cards (checklist dot), FormField validation, phone mask.
- `src/app/(account)/account/bookings/page.tsx` + `_components/prepay-button.tsx` — kit Table + badges + EmptyState.

**Auth / onboarding:**

- `src/app/(account)/onboarding/page.tsx` — shell + cards + FormField + phone mask.
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` — FormField + brand button + card.

**New util:**

- `src/lib/format-phone.ts` + `src/lib/format-phone.test.ts` — phone mask (pure, TDD).

**Docs:** `docs/FRONTEND.md`, `docs/DESIGN.md` — same-commit updates.

---

## Task 1: Phone-mask util (pure, TDD)

**Files:**

- Create: `src/lib/format-phone.ts`
- Test: `src/lib/format-phone.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format-phone.test.ts
import { describe, it, expect } from "vitest";
import { formatPhone } from "./format-phone";

describe("formatPhone", () => {
  it("formats a 10-digit string progressively", () => {
    expect(formatPhone("3")).toBe("(3");
    expect(formatPhone("303")).toBe("(303)");
    expect(formatPhone("3035550")).toBe("(303) 550");
    expect(formatPhone("3035550142")).toBe("(303) 550-0142");
  });
  it("strips non-digits and caps at 10 digits", () => {
    expect(formatPhone("(303) 550-0142 ext")).toBe("(303) 550-0142");
    expect(formatPhone("30355501429999")).toBe("(303) 550-0142");
  });
  it("returns empty string for empty/no-digit input", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/format-phone.test.ts`
Expected: FAIL — `formatPhone` is not defined / module not found.

- [ ] **Step 3: Implement the util**

```ts
// src/lib/format-phone.ts
/**
 * Progressive US phone mask for display/input. Pure — strips non-digits, caps at
 * 10, and formats as "(AAA) BBB-CCCC", revealing punctuation as digits arrive.
 * Storage stays whatever the action persists; this is presentation only.
 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length === 4) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/format-phone.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-phone.ts src/lib/format-phone.test.ts
git commit -m "feat: add progressive phone-mask util"
```

---

## Task 2: Scheduler selection → thick clay ring

**Files:**

- Modify: `src/features/booking/_components/scheduler/month-grid.tsx`
- Modify: `src/features/booking/_components/scheduler/week-grid.tsx`
- Modify: `src/features/booking/_components/scheduler/legend.tsx`
- Modify: `docs/FRONTEND.md`

**Rule:** color/weight classNames only. Do NOT touch `grid-runs.ts` or any Layer-2 file. `runOutlineClasses` already emits structural border-side + rounding (no color) — keep its `width: 2` calls; the "thick clay" read comes from the brand color + a bold clay day-number (matching the approved treatment).

- [ ] **Step 1: month-grid — committed selection outline color → brand**

In `cellClasses`, the committed-selection branch currently appends `border-primary` (and `border-dashed border-primary/40` for pending-remove). Change the appended **color** utilities:

- `pendingRemove ? "border-dashed border-primary/40" : "border-primary"` → `pendingRemove ? "border-dashed border-brand/50" : "border-brand"`
- the live-add preview branch `"border-dashed border-primary/50"` → `"border-dashed border-brand/60"`

- [ ] **Step 2: month-grid — hover affordance + selected day number to clay**

- In `SchedulerDayButton`, the hover class `"hover:outline-2 hover:outline-dotted hover:outline-primary/50 hover:-outline-offset-2"` → swap `outline-primary/50` → `outline-brand/60`.
- Make the selected day number read bold clay: where the button className is composed (`cn(className, fillClassName, hoverClass)`), append a selected modifier:

  ```tsx
  isSelected && "font-bold text-brand-strong",
  ```

  (so `className={cn(className, fillClassName, hoverClass, isSelected && "font-bold text-brand-strong")}`). `isSelected` is already derived in the component.

- [ ] **Step 3: week-grid — selection outline + hover + preview color → brand**

In `visualFor` and the `WeekCell` hover class, swap every selection/preview/hover `primary` token to `brand`:

- committed: `pendingRemove ? "border-dashed border-primary/40" : "border-primary"` → `... "border-dashed border-brand/50" : "border-brand"`
- add-preview: `"border-dashed border-primary/50"` → `"border-dashed border-brand/60"`
- `WeekCell` hover: `hover:outline-primary/50` → `hover:outline-brand/60`

- [ ] **Step 4: legend — "Selected" swatch → clay ring**

In `legend.tsx` `ENTRIES`, change the Selected entry `swatchClass: "border-2 border-primary bg-transparent"` → `"border-2 border-brand bg-transparent"`.

- [ ] **Step 5: Verify gate + Layer-2 tests untouched**

Run: `npm run lint && npm run typecheck && npx vitest run src/features/booking`
Expected: PASS — all existing scheduler/grid-runs/schedule-selection tests green (proves Layers 1–2 unbroken). No `grid-runs.ts` diff in `git status`.

- [ ] **Step 6: Doc update (same commit) + commit**

In `docs/FRONTEND.md`, in the Scheduler section, add one line: selection is now a **thick clay (`--brand`) ring with a bold `--brand-strong` day number** (Layer-3), composing over the status fill. Then:

```bash
git add "src/features/booking/_components/scheduler/month-grid.tsx" "src/features/booking/_components/scheduler/week-grid.tsx" "src/features/booking/_components/scheduler/legend.tsx" docs/FRONTEND.md
git commit -m "feat(scheduler): clay-ring selection treatment"
```

---

## Task 3: Scheduler Clear-dates affordance (Layer-3, wires existing API)

**Files:**

- Create: `src/features/booking/_components/scheduler/clear-dates.tsx`
- Modify: the `Scheduler` compound namespace (where `Scheduler.MonthGrid` etc. are attached — `src/features/booking/_components/scheduler/index.ts` or the file that builds the `Scheduler` object; grep `Scheduler.MonthGrid =` / `Object.assign(Scheduler`).
- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`

- [ ] **Step 1: Create the Clear-dates part**

```tsx
// src/features/booking/_components/scheduler/clear-dates.tsx
"use client";

/**
 * Scheduler.ClearDates — Layer-3 reset control for selection. Wires the EXISTING
 * Layer-2 `selection.clearDays()` (no logic added). Renders only when something
 * is selected, so it never shows as dead chrome. Fixes the booking-month dead-end
 * where an editable:false range could only grow (scheduler-deferred-followups).
 */

import { useScheduler } from "@/features/booking/scheduler-context";
import { cn } from "@/lib/utils";

export function ClearDates({ className }: { className?: string }) {
  const { selection } = useScheduler();
  if (selection.state.selectedDays.size === 0) return null;
  return (
    <button
      type="button"
      onClick={selection.clearDays}
      className={cn(
        "text-brand-strong hover:text-brand focus-visible:ring-ring border-border hover:bg-sidebar-accent rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:outline-none active:translate-y-px",
        className,
      )}
    >
      Clear dates
    </button>
  );
}
```

- [ ] **Step 2: Attach to the compound namespace**

Find where parts are attached to `Scheduler` (e.g. `Scheduler.MonthGrid = MonthGrid;`). Import `ClearDates` and add `Scheduler.ClearDates = ClearDates;`. Mirror the existing export/type pattern exactly (if parts are typed on an interface, add `ClearDates: typeof ClearDates`).

- [ ] **Step 3: Mount it in the month-range booking branch**

In `service-booking-client.tsx`, the `mode === "month-range"` branch renders `<Scheduler> … <Scheduler.MonthGrid /> <Scheduler.SelectionSummary /> …`. Add `<Scheduler.ClearDates />` next to `SelectionSummary` (e.g. wrap both in a `flex items-center justify-between` row so the summary sits left and Clear-dates right):

```tsx
<Scheduler.MonthGrid />
<div className="mt-3 flex items-center justify-between gap-3">
  <Scheduler.SelectionSummary />
  <Scheduler.ClearDates />
</div>
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npx vitest run src/features/booking`
Expected: PASS. Manual: in the dev app on a house-sitting service, pick a range → "Clear dates" appears → click → selection clears, button disappears.

- [ ] **Step 5: Commit**

```bash
git add "src/features/booking/_components/scheduler/clear-dates.tsx" "src/features/booking/_components/scheduler/index.ts" "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx"
git commit -m "feat(scheduler): add Clear-dates reset to booking month"
```

(Adjust the namespace path in `git add` to wherever the parts are attached.)

---

## Task 4: Scheduler chrome + panels → warm tokens + interaction language

**Files:**

- Modify: `src/features/booking/_components/scheduler/scheduler.tsx`
- Modify: `src/features/booking/_components/scheduler/booking-details-panel.tsx`
- Modify: `src/features/booking/_components/scheduler/selection-summary.tsx`
- Modify: `src/features/booking/_components/scheduler/week-grid.tsx` (chrome only — nav arrows, day/time labels, grid hairlines)
- Modify: `src/features/booking/_components/scheduler/day-panel.tsx`, `.../week-actions.tsx` (admin-only; restyle for family coherence, live-verified Phase 4)

ClassNames only. Keep all status/selection logic.

- [ ] **Step 1: Root + panels surface tokens**

- `scheduler.tsx`: the wrapper `"bg-card border-border rounded-lg border p-4"` — align radius to the global `--radius` (the kit uses `rounded-xl` on cards; match by using `rounded-xl`). Keep `bg-card border-border`.
- `booking-details-panel.tsx`: the close button focus ring `focus-visible:ring-ring` is fine; ensure the panel uses `bg-card border-border rounded-xl` (currently `rounded-lg`). Title → `font-semibold`.
- `selection-summary.tsx`: keep `text-muted-foreground text-sm`; no change needed beyond confirming token usage (leave as-is if already semantic).

- [ ] **Step 2: WeekGrid chrome warm-up**

- Week-nav arrow buttons: `hover:bg-muted` → `hover:bg-sidebar-accent` (matches the 200ms warm hover standard); add `transition-colors duration-200 ease-out`.
- Day-header + time-label text already use `text-muted-foreground` / `text-foreground` — leave semantic. Grid hairlines `border-border` — leave (already semantic).

- [ ] **Step 3: Admin panels (day-panel, week-actions) buttons → interaction language**

Swap the raw primary buttons (`bg-primary text-primary-foreground … rounded px-3 py-1.5`) and outline buttons to the kit `Button` component (`import { Button } from "@/components/ui/button"`), variants `default` / `outline`, so they inherit hover-deepen + 1px press. Keep the existing `onClick`, `disabled`, and label logic verbatim. The inline feedback banners (`border-border bg-muted` / `border-destructive/30 bg-destructive/10`) stay (admin inline pattern); only the buttons change. Panels use `rounded-xl` to match cards.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck && npx vitest run src/features/booking`
Expected: PASS (no Layer-2 test touches anything here).

- [ ] **Step 5: Commit**

```bash
git add "src/features/booking/_components/scheduler/scheduler.tsx" "src/features/booking/_components/scheduler/booking-details-panel.tsx" "src/features/booking/_components/scheduler/selection-summary.tsx" "src/features/booking/_components/scheduler/week-grid.tsx" "src/features/booking/_components/scheduler/day-panel.tsx" "src/features/booking/_components/scheduler/week-actions.tsx"
git commit -m "style(scheduler): warm chrome + interaction-language buttons"
```

---

## Task 5: Booking wrappers — receipt rail, clay pets, labeled steppers, toggle

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/quote-panel.tsx`
- Modify: `.../pet-assignment.tsx`
- Modify: `.../quantity-forms.tsx`
- Modify: `.../recurring-controls.tsx`

Presentational only — props/handlers unchanged.

- [ ] **Step 1: quote-panel → receipt/ticket**

Rebuild the panel markup (keep the `preview` prop + `centsToDollars`):

```tsx
export function QuotePanel({ preview }: { preview: BookingQuotePreview }) {
  return (
    <section
      aria-label="Price estimate"
      className="bg-card text-card-foreground border-border relative rounded-xl border p-4 shadow-[0_1px_0_var(--sand-200),0_8px_20px_-14px_rgba(60,40,20,0.4)]"
    >
      <ul className="space-y-1.5">
        {preview.breakdown.lines.map((line, i) => (
          <li key={i} className="flex justify-between gap-4 text-sm">
            <span className="text-foreground/70">{line.label}</span>
            <span className="text-foreground tabular-nums">
              {centsToDollars(line.amountCents)}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-border my-3 border-t border-dashed" />
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Total
        </span>
        <span
          className="text-brand-strong text-2xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {centsToDollars(preview.finalCents)}
        </span>
      </div>
      {preview.requiresApproval && (
        <p className="text-foreground/70 mt-2 text-xs italic">
          Requires Cal&apos;s approval before it is confirmed.
        </p>
      )}
    </section>
  );
}
```

Note: `var(--sand-200)` in the shadow is a primitive used only as a shadow tint via CSS var (not a hardcoded hex); acceptable. The dashed rules + Fraunces total deliver the ticket read. (Labels use `text-foreground/70` for AA on card — NOT `muted-foreground`.)

- [ ] **Step 2: pet-assignment selected state → clay**

In the toggle button className, change the selected branch from `"border-foreground bg-secondary text-secondary-foreground"` → `"border-brand bg-clay-soft text-brand-strong"` … wait: `clay-soft` is a primitive. Use the semantic equivalent: selected = `"border-brand bg-brand/10 text-brand-strong"`; unselected stays `"border-border bg-background hover:bg-muted"`. Keep `aria-pressed`, `PetAvatar`, and the add-pet `PetForm` block unchanged.

- [ ] **Step 3: quantity-forms — labeled steppers via FormField**

Wrap each `NumberField` label/control with the kit so spacing + label styling match. Replace the bespoke `NumberField` internals to use `FormField` with `children` (the numeric `Input`), preserving `value/min/step/onChange`. Keep the `fieldset`/`legend` grouping; change `legend` to `className="col-span-full mb-2 text-sm font-medium text-foreground"`. The numeric `Input` keeps `className="w-28"` and adds `inputMode="numeric"`.

- [ ] **Step 4: recurring-controls — styled toggle**

Keep the checkbox semantics but restyle: the checkbox `accent-foreground` → `accent-[var(--brand)]`; the count `Input` keeps its props; the helper text stays `text-muted-foreground text-xs`. Wrap the count field in `FormField` (label "Number of weeks", children = the Input) for consistent spacing. (A full switch component is out of scope — YAGNI; the accent + spacing alignment is enough.)

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/quote-panel.tsx" "src/app/(marketing)/book/[serviceSlug]/_components/pet-assignment.tsx" "src/app/(marketing)/book/[serviceSlug]/_components/quantity-forms.tsx" "src/app/(marketing)/book/[serviceSlug]/_components/recurring-controls.tsx"
git commit -m "style(book): receipt quote panel, clay pet select, labeled steppers"
```

---

## Task 6: Booking page Layout B — two-column + sticky rail + mobile bottom bar + feedback

**Files:**

- Modify: `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`
- Modify: `docs/FRONTEND.md`, `docs/DESIGN.md`

Restructure JSX only — keep ALL state, handlers, `useMemo`/`useTransition`, the deferred-auth gate, and the `bookEnabled` logic verbatim.

- [ ] **Step 1: Replace the `MessageBanner` helper with kit feedback**

- Delete the local `MessageBanner` component + `MessageTone` usage. Import `useToast` (`@/components/feedback/toast`), `ErrorState`, `EmptyState`.
- Window load failure (`windowsError`) → render `<ErrorState title="Couldn’t load availability" message={windowsError} />` instead of the banner.
- `submitMsg` (booking result) → fire a toast in `handleBook`'s result handler: on success `toast.add({ title: "Booking requested", description: quote?.requiresApproval ? "Cal will review and confirm." : "You’re booked." })`; on failure `toast.add({ title: "Couldn’t book", description: <message>, type: "error" })`. Remove the bottom `submitMsg` banner block. Keep `submitDone` gating.
- `previewMsg` (quote errors) → keep inline but render via a small inline `<p role="alert" className="text-destructive text-sm">` at the rail (not a custom banner).

- [ ] **Step 2: Wrap the body in the two-column grid**

Replace the outer `<div className="flex flex-col gap-8">` with:

```tsx
<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
  <div className="flex flex-col gap-8">
    {/* sections 1–4: calendar, pets, quantities, recurring — unchanged */}
  </div>
  <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
    {/* rail: quote + Book (desktop) */}
  </aside>
</div>
```

Move sections 1–4 (calendar, pet assignment, quantities, recurring) into the left column. Move the quote section (Get quote + `QuotePanel`) and the Book section into the right `aside`.

- [ ] **Step 3: Build the rail content**

In the `aside`, render (desktop):

- A `Card`-less compact stack: the "Get quote" `Button` (variant `outline`), then `{previewMsg && <inline error>}`, then `{quote && <QuotePanel preview={quote} />}` (the receipt), then the **Book** `Button` (full width) with the existing `bookEnabled`/`handleBook`. Keep the "Get a quote first to enable booking" hint.

- [ ] **Step 4: Mobile sticky bottom bar**

Below `lg`, the `aside` is not sticky; instead add a bottom bar that shows the total + Book, pinned. Add, as the last child of the root grid (outside the `aside`), a mobile-only bar:

```tsx
<div className="bg-card border-border fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
  <div className="min-w-0">
    {quote ? (
      <span
        className="text-brand-strong text-lg"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {centsToDollars(quote.finalCents)}
      </span>
    ) : (
      <span className="text-muted-foreground text-sm">Get a quote</span>
    )}
  </div>
  <Button
    onClick={quote ? handleBook : handleGetQuote}
    disabled={!hasSelection || !petsOk || isSubmitting || isPreviewing}
  >
    {quote
      ? isSubmitting
        ? "Submitting…"
        : "Book now"
      : isPreviewing
        ? "Loading…"
        : "Get quote"}
  </Button>
</div>
```

Add `pb-24 lg:pb-0` to the root grid so the fixed bar never overlaps the last section. Add a `centsToDollars` helper (or import the one from quote-panel — extract a tiny shared `src/features/booking/format-money.ts` if cleaner; otherwise inline).

- [ ] **Step 5: Restyle numbered step headers**

The `<h2 className="mb-3 text-sm font-semibold">` step headers stay but use the eyebrow/clay treatment: `className="text-brand-strong mb-3 text-xs font-semibold tracking-wide uppercase"`. Keep the numbering text.

- [ ] **Step 6: Verify (incl. build)**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS; page count unchanged vs. baseline. Manual: desktop shows sticky rail; <`lg` shows the bottom bar; no page horizontal scroll; calendar/week-grid scroll inside their wrapper.

- [ ] **Step 7: Docs + commit**

FRONTEND.md: note the booking **two-column + sticky-rail / mobile bottom-bar** pattern and the **receipt** summary. DESIGN.md: confirm `/book/[serviceSlug]` description matches; add the "no payment-info tab; Stripe hosted checkout; saved cards = future hook" note in the booking/data section.

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" docs/FRONTEND.md docs/DESIGN.md
git commit -m "feat(book): two-column sticky-rail booking layout with kit feedback"
```

---

## Task 7: Account profile — cards, inline saved, phone mask

**Files:**

- Modify: `src/app/(account)/account/page.tsx`
- Modify: `src/app/(account)/account/_components/profile-form.tsx`
- Modify: `src/app/(account)/account/_components/password-form.tsx`

- [ ] **Step 1: page.tsx — wrap sections in Cards**

Keep the server data fetch + `PageContainer width="app"` + `PageHeader`. Replace each `<section>` with a `Card`: contact info card (`CardHeader`/`CardTitle "Contact info"` + the read-only email row + `<ProfileForm/>`), and a password `Card` (`CardTitle "Change password"` + `<PasswordForm/>`). Import `Card, CardHeader, CardTitle, CardContent`.

- [ ] **Step 2: profile-form — FormField + masked phone + inline saved**

- Replace the bespoke `Label`+`Input` blocks with `FormField` (label + input props). Keep controlled `values`/`handleChange`.
- Phone: import `formatPhone`; the phone field becomes `value={formatPhone(values.phone)}` with `onChange` storing the masked string (or raw digits — keep storing the displayed value to match current persistence; the action already accepts a string). Add `inputMode="tel"`.
- Replace the success `<p>` with an inline "Saved ✓": `{status === "success" && <span className="text-status-available-foreground text-sm font-medium">Saved ✓</span>}`. Error stays inline via `FormField error` on the relevant field OR a single `<p role="alert" className="text-destructive text-sm">`.
- Submit `Button` keeps `disabled={isPending}`.

- [ ] **Step 3: password-form — FormField**

Mirror: wrap inputs in `FormField`; keep logic. (Read the file first to preserve its action wiring.)

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(account)/account/page.tsx" "src/app/(account)/account/_components/profile-form.tsx" "src/app/(account)/account/_components/password-form.tsx"
git commit -m "style(account): profile as cards with masked phone + inline saved"
```

---

## Task 8: Account pets — cards, inline edit/add, ConfirmDialog, segmented species, branded empty

**Files:**

- Modify: `src/app/(account)/account/pets/_components/pets-client.tsx`
- Modify: `src/features/accounts/_components/pet-form.tsx`
- Modify: `src/app/(account)/account/pets/page.tsx` (only if it needs PageHeader/Container alignment — read first)

- [ ] **Step 1: pet-form — segmented species + FormField + neutral edit outline**

- Replace the radio `fieldset` with a segmented control (token-only): two `button`s in an inline-flex bordered group; selected = `bg-brand/10 text-brand-strong border-brand font-semibold`, unselected = `bg-card text-foreground`. Keep `values.species` state + `set("species", sp)`; keep accessible labels (`aria-pressed`). Targets ≥44px (`min-h-11` on the segment buttons).
- Wrap `name`/`breed`/`notes`/`photo` in `FormField`. Keep the file `ref` + upload logic. Error stays the existing `<p role="alert">` (or a `FormField error`).
- The form container outline (when used inline) must be neutral `border-border` (set by the caller in pets-client — see Step 2).

- [ ] **Step 2: pets-client — pet Cards, ConfirmDialog delete, branded empty**

- Import `useConfirm`, `EmptyState`, `Card`. Call `const { confirm, dialog } = useConfirm();` in `PetsClient`; render `{dialog}` once.
- `handleDelete` (in `PetItem`) becomes: `const ok = await confirm({ title: \`Remove ${pet.name}?\`, description: "This can’t be undone.", confirmLabel: "Remove", destructive: true }); if (!ok) return;`then the existing`deletePet`transition. (Lift`confirm`down via prop or move the confirm into`PetItem`with its own`useConfirm`— simplest: give`PetItem`its own`useConfirm()`.)
- Pet rows → `Card` (or the existing `<li>` restyled with `bg-card border-border rounded-xl border`). Edit expands in place into `<PetForm … />` inside a container with neutral `border-border` outline.
- Empty: replace the `<p>No pets added yet.</p>` with `<EmptyState title="No pets yet" message="Add the pets Cal will be caring for." icon={<PawPrint className="size-5" />} action={<Button variant="outline" onClick={() => setShowAddForm(true)}>+ Add a pet</Button>} />` (import `PawPrint` from `lucide-react`).
- Buttons (Edit/Delete) use kit `Button` (`outline` / `destructive` size `sm`).

- [ ] **Step 3: Verify (incl. keyboard)**

Run: `npm run lint && npm run typecheck`
Expected: PASS. Manual: Delete opens ConfirmDialog (Esc cancels, focus trapped; bottom-sheet on mobile); segmented species toggles by keyboard.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/account/pets/_components/pets-client.tsx" "src/features/accounts/_components/pet-form.tsx" "src/app/(account)/account/pets/page.tsx"
git commit -m "feat(account): pet cards with segmented species and confirm-delete"
```

---

## Task 9: Account forms — status cards (checklist dot), FormField validation, masked phone

**Files:**

- Modify: `src/app/(account)/account/forms/_components/forms-client.tsx`
- Modify: `docs/FRONTEND.md`

- [ ] **Step 1: Status tell → checklist dot**

In `FormCard`, replace the `{submitted ? "Completed" : "Not started"}` `<p>` with a dot+label:

```tsx
<span className="flex items-center gap-2 text-xs font-medium">
  <span
    aria-hidden="true"
    className={cn(
      "size-2.5 rounded-full",
      submitted
        ? "bg-status-available-foreground ring-status-available ring-2"
        : "border-border border-2 bg-transparent",
    )}
  />
  <span className={submitted ? "text-foreground" : "text-muted-foreground"}>
    {submitted ? "Completed" : "Not started"}
  </span>
</span>
```

(import `cn`). The completed dot = green-deep fill + green-soft halo (existing roles, theme-aware).

- [ ] **Step 2: Card chrome + FormField + masked phone**

- The form card container → `bg-card border-border rounded-xl border`; the expand body keeps the `border-t`.
- In `EmergencyFields`, wrap each `Label`+`Input` in `FormField`; phone fields (`contact_phone`, `vet_phone`) use `formatPhone` on display + `inputMode="tel"`. Add inline validation: if a phone field has <10 digits on submit attempt, pass `error="Enter a 10-digit phone number"` to that `FormField` (track a simple local `errors` object; do not change the submit action contract).
- Edit/Start/Close buttons → kit `Button` (`outline` size `sm`).

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Doc + commit**

FRONTEND.md: note the **checklist-dot** status tell (green-deep completed / hollow not-started) as the standard for form/status cards.

```bash
git add "src/app/(account)/account/forms/_components/forms-client.tsx" docs/FRONTEND.md
git commit -m "style(account): forms as checklist-dot status cards with field validation"
```

---

## Task 10: Account bookings — kit Table, badges, EmptyState

**Files:**

- Modify: `src/app/(account)/account/bookings/page.tsx`
- Modify: `src/app/(account)/account/bookings/_components/prepay-button.tsx` (read first; align to kit `Button` if not already)

- [ ] **Step 1: BookingList → kit Table**

Replace the `<ul>`/`<li>` list with `Table`:

- `TableHeader` row: `Service`, `When`, `Status`, `Total`, `` (action).
- Each booking → `TableRow` with `TableCell data-label="Service|When|Status|Total|"` (the empty-label action cell). Keep `formatDenver`, `formatDollars`, `amountOwed`.
- Status → `Badge` mapped: `confirmed|completed` → `available`/`default`, `pending_approval` → `unavailable` (or `default`), `cancelled|declined|no_show` → `destructive`. Render `b.status.replace(/_/g," ")` as the label.
- Amount owed: when `owed > 0`, show `Owed {formatDollars(owed)}` in `text-brand-strong`. Keep `<PrepayButton>` in the action cell when `showPayButton`.

- [ ] **Step 2: Empty states**

Replace the two `<p>No upcoming/past bookings.</p>` with `<EmptyState title="No upcoming bookings" message="When you book, it’ll show up here." action={<Button asChild variant="brand"><Link href="/book">Browse services</Link></Button>} />` (upcoming) and a simpler `EmptyState title="No past bookings"` (history). Import `EmptyState`, `Button`, `Link`.

- [ ] **Step 3: Verify (incl. build + mobile)**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS. Manual: below `md` the table renders as stacked labeled cards (each cell shows its `data-label`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/account/bookings/page.tsx" "src/app/(account)/account/bookings/_components/prepay-button.tsx"
git commit -m "style(account): bookings as kit table with status badges + empty states"
```

---

## Task 11: Onboarding — shell, cards, FormField, masked phone

**Files:**

- Modify: `src/app/(account)/onboarding/page.tsx`

- [ ] **Step 1: Compose shell + cards**

- Remove the hardcoded `max-w-lg` reliance: keep `PageContainer width="read"`, replace the bare `<h1>`/`<p>` with a `PageHeader title="Welcome — let’s get you set up" subtitle="Fill in your profile and emergency info before booking."` (PageHeader renders the h1).
- Wrap each `<fieldset>` (Profile / Emergency contact / Veterinarian) in a `Card` with a `CardTitle`. Keep the `legend` or fold it into `CardTitle`.

- [ ] **Step 2: FormField + masked phone**

Replace `Label`+`Input` blocks with `FormField`; phone fields (`phone`, `contact_phone`, `vet_phone`) use `formatPhone` + `inputMode="tel"`. Keep the `FormData`-based submit + `returnTo` logic verbatim. Keep the final error `<p role="alert">` and the full-width submit `Button`.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/onboarding/page.tsx"
git commit -m "style(onboarding): shell + carded form with masked phone"
```

---

## Task 12: Auth login + signup — FormField, brand button, card

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx` (read first — mirror login’s structure)

- [ ] **Step 1: login — card + FormField + brand button**

- Wrap the form in a `Card` (keep the `max-w-sm` centering wrapper or move width to the card). Replace `Label`+`Input` with `FormField`. Keep `useState` email/password + the `safeReturnTo` redirect logic verbatim.
- Submit `Button` → `variant="brand"` full width. Keep the error `<p role="alert">`. Keep the `<Link href="/signup">` (already a `<Link>`).

- [ ] **Step 2: signup — mirror login**

Apply the same structure to signup (read it first; preserve its action + any phone field → `formatPhone` if present).

- [ ] **Step 3: Verify (incl. build)**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx"
git commit -m "style(auth): carded login + signup with FormField and brand button"
```

---

## Task 13: Docs reconciliation + DEV_NOTES

**Files:**

- Modify: `docs/FRONTEND.md`, `docs/DESIGN.md` (final pass), `docs/DEV_NOTES.md` (if a saved-cards/future-hook note belongs in the backlog)

- [ ] **Step 1: Reconcile docs**

Confirm FRONTEND.md captures: clay-ring selection, booking two-column + sticky-rail + bottom-bar + receipt, checklist-dot status, branded empty states, and that account/auth bodies compose shell + feedback taxonomy. Confirm `--destructive-warm` is in the brand-token list (add if missing — carry-forward). Confirm DESIGN.md’s booking/account route notes match shipped + the saved-cards future-hook note. Update both "_Last reviewed_" footers to `2026-06-06`.

- [ ] **Step 2: Verify + commit**

Run: `npm run lint`

```bash
git add docs/FRONTEND.md docs/DESIGN.md docs/DEV_NOTES.md
git commit -m "docs: reconcile frontend + design for account + booking phase"
```

---

## Task 14: Phase verification walk (completion gate)

- [ ] **Step 1: Full automated gate**

Run: `npm run lint && npm run typecheck && npm run build && npm test`
Expected: lint/types clean; build page count unchanged; tests green (the pure scheduler Layer-2 suites included). If `payments.test.ts` fails, re-run in isolation to confirm it’s the known environmental flake, not a regression.

- [ ] **Step 2: Live ≤390px + keyboard-a11y walk (manual, in the dev app)**

Walk `/book/[serviceSlug]` (both house-sitting month + an hourly week-slot service), `/account`, `/account/pets`, `/account/forms`, `/account/bookings`, `/onboarding`, `/login`, `/signup`. Confirm on a 390px viewport AND with keyboard only:

- Booking: sticky bottom bar shows total + Book; no page h-scroll; calendar/week-grid scroll inside their wrapper; clay-ring selection reads clearly; Clear-dates works by touch + keyboard.
- ConfirmDialog (pet delete) + the mobile nav drawer: focus-trap + Esc; bottom-sheet on mobile.
- Visible focus on every interactive element; `aria-current` on active sidebar item; tables → stacked cards; toasts bottom-anchored.
- Repeat in **light AND dark**.

- [ ] **Step 3: Token-contract spot check**

`git diff --stat` since the phase start: confirm NO diff to `grid-runs.ts`, `schedule-selection.ts`, `use-schedule-selection.ts`, `scheduler-context.tsx`, `calendar-model.ts`, or any scheduler `*.test.ts`. Grep the touched files for raw hex (`#[0-9a-fA-F]{3,6}`) — expect none except documented CSS-var shadow tints.

- [ ] **Step 4: Finish**

Do NOT push (Alex batches the prod deploy). Report completion + the verification evidence; offer `superpowers:finishing-a-development-branch` if Alex wants to decide on integration.

---

## Self-review notes (author)

- **Spec coverage:** Scheduler restyle (T2, T4) + clay ring (T2) + Clear-dates (T3); booking Layout B + feedback (T6) + wrappers/receipt (T5); account profile (T7) / pets (T8) / forms (T9) / bookings (T10); onboarding (T11); auth (T12); input humanization/phone mask (T1 + applied T7/T8/T9/T11); no payment-tab note (T6/T13); mobile parity (every task + T14); docs (per-task + T13). The "drop Back-to-site" spec item is a **no-op** — `app-sidebar.tsx` already has none (verified during planning); not a task.
- **Out of scope honored:** Scheduler Layers 1–2 untouched (T2/T3/T4 are classNames + one existing-API call); no new date/time picker; saved-cards deferred.
- **Type consistency:** `selection.clearDays` (hook) used in T3; `formatPhone` signature shared T1→T7/T9/T11; kit prop shapes match the Reference section.
