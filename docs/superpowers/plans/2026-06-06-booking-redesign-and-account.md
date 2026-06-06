# Booking Redesign + Account/Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the booking workflow (month→day→duration-accurate time for hourly services; live receipt; restyled month/pets/inputs) and finish the still-pending account/auth surfaces.

**Architecture:** The booking redesign is mostly Layer-3 (a new `DayTimeline` part + repointing the hourly flow to `MonthGrid`+`DayTimeline`), backed by one new pure model util (`day-timeline-model`, TDD) and a kit `NumberStepper` (pure helper TDD). The pure Scheduler model (`schedule-selection`, `grid-runs`) is reused; the only behavior change is dropping the merged selection outline in favor of per-day outlines. Account/auth tasks compose the existing shell + kit + feedback taxonomy.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind v4 + `@base-ui/react`, two-layer CSS-var tokens, react-day-picker v9, Vitest.

---

## Constraints (every task)

- **Token law:** semantic roles only (`SEMANTIC_COLORS`); whitespace from `space.*`; type from `typeScale`. Clay = `--brand`/`--brand-strong`; done-green dot = `--status-available-foreground` + `--status-available` halo. No hex (one allowed exception: the receipt shadow tint `var(--sand-200)`).
- **Layer 2 changes are now ALLOWED for booking** (authorized) but stay pure + TDD'd. Touch `schedule-selection.ts`/`grid-runs.ts` only where a task says so, with tests updated. IO stays at the edges.
- Internal nav `<Link>` only. A11y floor (semantic HTML, AA, visible focus, keyboard, focus-trap+Esc), ≥44px targets. **Mobile parity is a per-surface build gate.**
- Copy stays `[[ ]]`. **Commit subject-line only.** Stage by name (quote paren paths). Let the pre-commit hook run (no `--no-verify`). **Do NOT push.**
- Same-commit doc rule for FRONTEND.md/DESIGN.md (called out per task).
- **Gate before each commit:** `npm run lint && npm run typecheck && npm test`; run `npm run build` before the last commit of a multi-file surface. The `payments.test.ts` flake is environmental — re-run in isolation to confirm.

## Already shipped this phase (do NOT redo; some gets reworked here)

- DONE & kept: phone-mask util (`src/lib/format-phone.ts`), `Scheduler.ClearDates`, scheduler chrome warm-up, FormField children-type fix.
- Reworked by THIS plan: clay-ring selection (→ per-day individual outline, Task R3), booking wrappers (pet chips→cards R7, quantity NumberStepper R8), booking layout (→ live receipt + sticky-centered rail + new hourly flow, R6).

## Reference: kit APIs

`Card/CardHeader/CardTitle/CardContent`, `Badge` (variants default|brand|available|booked|unavailable|destructive), `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` (`data-label` per cell), `FormField` ({label,name,hint?,error?} + input props OR children — children form now typechecks), `useConfirm()`→{confirm,dialog}, `EmptyState`/`ErrorState`, `useToast()` (`toast.add({title,description?,type?})`), `PageHeader`, `PageContainer`, `AppShell`, `accountNav`, `Button` (variants default|outline|destructive|ghost|brand, size default|sm|lg). Receipt: `quote-panel.tsx` (side-notch ticket, shipped). `centsToDollars` lives in `src/features/booking/format-money.ts`. `formatPhone` in `src/lib/format-phone.ts`.

## File structure (booking redesign)

- `src/lib/number-input.ts` (+test) — pure clamp/step/sanitize for numeric input.
- `src/components/ui/number-stepper.tsx` — kit stepper consuming `number-input`.
- `src/features/booking/day-timeline-model.ts` (+test) — pure: build start-time options for a day given open windows + duration + granularity; validate a start fits.
- `src/features/booking/_components/scheduler/day-timeline.tsx` — new Layer-3 single-day timeline (duration-height block, drag + type start).
- `src/features/booking/_components/scheduler/month-grid.tsx` — per-day selection outline (no merge) + your-booking dot.
- `src/features/booking/_components/scheduler/legend.tsx` + `index.ts` — legend on page; export `DayTimeline`.
- `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` — live receipt, sticky-centered rail, mobile bottom bar, hourly flow = MonthGrid+DayTimeline, house-sitting = MonthGrid range.
- `.../pet-assignment.tsx` — card selection.
- `.../quantity-forms.tsx` — NumberStepper.

---

## Task R1: Pure numeric-input helper (TDD)

**Files:** Create `src/lib/number-input.ts`; Test `src/lib/number-input.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { sanitizeIntInput, clampToStep } from "./number-input";

describe("sanitizeIntInput", () => {
  it("strips non-digits and leading zeros", () => {
    expect(sanitizeIntInput("03")).toBe("3");
    expect(sanitizeIntInput("0")).toBe("0");
    expect(sanitizeIntInput("01a2")).toBe("12");
    expect(sanitizeIntInput("")).toBe("");
  });
});
describe("clampToStep", () => {
  it("clamps to min/max and snaps to step", () => {
    expect(clampToStep(7, { min: 0, max: 10, step: 1 })).toBe(7);
    expect(clampToStep(-3, { min: 0, max: 10, step: 1 })).toBe(0);
    expect(clampToStep(99, { min: 0, max: 10, step: 1 })).toBe(10);
    expect(clampToStep(17, { min: 0, max: 60, step: 15 })).toBe(15);
    expect(clampToStep(23, { min: 0, max: 60, step: 15 })).toBe(30);
  });
  it("supports fractional steps", () => {
    expect(clampToStep(1.3, { min: 0.25, max: 8, step: 0.25 })).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/lib/number-input.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** Pure helpers for sanitized numeric inputs (no leading zeros, clamp, step-snap). */
export function sanitizeIntInput(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d === "") return "";
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? "" : String(n);
}
export function clampToStep(
  value: number,
  opts: { min: number; max: number; step: number },
): number {
  const { min, max, step } = opts;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  // guard fp drift
  const fixed = Math.round(snapped * 1e6) / 1e6;
  return Math.min(max, Math.max(min, fixed));
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/lib/number-input.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/number-input.ts src/lib/number-input.test.ts
git commit -m "feat: add pure numeric-input sanitize + clamp helpers"
```

---

## Task R2: NumberStepper kit component

**Files:** Create `src/components/ui/number-stepper.tsx`

Build a controlled stepper consuming Task R1. Contract:

```ts
interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number; // default 0
  max?: number; // default 999
  step?: number; // default 1
  unit?: string; // e.g. "min", "hr"
  ariaLabel: string;
  id?: string;
}
```

- [ ] **Step 1: Implement** — `"use client"`. Layout: inline-flex bordered group, ~`h-11` (≥44px); a `−` button (`type=button`, `aria-label="Decrease {ariaLabel}"`), a center editable text `<input inputMode="decimal">` showing `value` + `unit`, a `+` button. Buttons use `bg-secondary hover:bg-clay-soft`-style tokens (`bg-muted hover:bg-accent text-brand-strong`), ≥44px wide. On `−`/`+`: `onChange(clampToStep(value ∓ step, {min,max,step}))`. On input change: keep raw local string via `sanitizeIntInput` (allow a single decimal point for fractional steps — strip with `replace(/[^\d.]/g,"")` instead of `sanitizeIntInput` when `step < 1`); on **blur**, parse → `clampToStep` → `onChange` (empty → `min`). Disable `−` at `min`, `+` at `max`. Focus-visible ring via `focus-visible:ring-2 ring-ring`. Import `clampToStep` (and `sanitizeIntInput` for integer mode) from `@/lib/number-input`.

- [ ] **Step 2: Verify** — `npm run lint && npm run typecheck`. (Presentational; logic is covered by R1.)

- [ ] **Step 3: Commit**

```bash
git add "src/components/ui/number-stepper.tsx"
git commit -m "feat(ui): add NumberStepper component"
```

---

## Task R3: MonthGrid — per-day selection outline + your-booking dot

**Files:** Modify `src/features/booking/_components/scheduler/month-grid.tsx`, `legend.tsx`

- [ ] **Step 1: Per-day individual outline (drop merge)**

In `cellClasses`, the selection `outline` currently uses `runOutlineClasses(selEdge,…)` to merge adjacent days. Replace the **selected** branch so each selected day gets its own closed clay box, independent of neighbors:

```ts
let outline = "";
if (state.selectedDays.has(dayKey)) {
  outline = "border-2 border-brand rounded-lg";
} else if (previewMode !== "remove" && previewDays.size > 0) {
  const prevEdge = previewEdgeMap.get(dayKey);
  if (prevEdge) outline = "border-2 border-dashed border-brand/60 rounded-lg";
}
```

Remove the now-unused `selEdgeMap`/`runOutlineClasses` import usage **for selection** if nothing else needs it (leave `runFillRounding`/fill grouping as-is — status fills still merge). Keep the bold selected number `isSelected && "font-bold text-brand-strong"`.

- [ ] **Step 2: Your-booking dot**

Add a `myBookings: Set<string>` (dayKeys) to `SchedulerData`/context (Layer-1 prop), defaulting to empty. In the DayButton, when `data.myBookings?.has(dayKey)`, render a small dot:

```tsx
{
  hasMyBooking && (
    <span
      aria-hidden
      className="bg-status-available-foreground absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full"
    />
  );
}
```

Thread `myBookings` from the consumer (service-booking-client passes the client's existing booking day-keys for this service; empty for guests). Add `myBookings?: Set<string>` to the `SchedulerData` type in `scheduler-context.tsx` (additive, optional — no break).

- [ ] **Step 3: Legend on page + dot entry**

In `legend.tsx`, update the Selected swatch to `border-2 border-brand` (already clay) and ADD an entry `{ label: "Your booking", swatchClass: "bg-status-available relative" }` with a dot pseudo — simpler: render that swatch as a green tile with an inner dot span. Keep the legend list markup; the consumer renders `<Scheduler.Legend />` outside any card (handled in R6).

- [ ] **Step 4: Verify (Layer-2 tests still pass)**

`npm run lint && npm run typecheck && npx vitest run src/features/booking` → PASS. `git status`: `schedule-selection.ts`/`grid-runs.ts` may be unchanged (we only changed Layer-3 + an additive context type). If you edited `scheduler-context.tsx` types only (additive), that's fine.

- [ ] **Step 5: Commit**

```bash
git add "src/features/booking/_components/scheduler/month-grid.tsx" "src/features/booking/_components/scheduler/legend.tsx" "src/features/booking/scheduler-context.tsx"
git commit -m "feat(scheduler): per-day selection outline + your-booking dots"
```

---

## Task R4: Pure day-timeline model (TDD)

**Files:** Create `src/features/booking/day-timeline-model.ts`; Test `…day-timeline-model.test.ts`

Pure helpers the `DayTimeline` renders from. Reuse existing `TimeRange`/`fitsWindow` from `availability.ts` where possible (import, don't duplicate).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { startOptions, blockSpan } from "./day-timeline-model";

// windows expressed as minutes-since-midnight [openMinute, closeMinute)
describe("startOptions", () => {
  it("lists valid start minutes that fit duration inside a window, on the granularity grid", () => {
    // window 9:00–11:00 (540–660), duration 60, granularity 30
    expect(
      startOptions({
        windows: [[540, 660]],
        durationMin: 60,
        granularityMin: 30,
      }),
    ).toEqual([540, 570, 600]); // 9:00, 9:30, 10:00 (last that fits 60m before 660)
  });
  it("excludes starts where the block would overrun the window", () => {
    expect(
      startOptions({
        windows: [[540, 615]],
        durationMin: 60,
        granularityMin: 15,
      }),
    ).toEqual([540]); // only 9:00 fits a 60m block before 10:15
  });
  it("handles multiple windows", () => {
    expect(
      startOptions({
        windows: [
          [540, 600],
          [720, 780],
        ],
        durationMin: 30,
        granularityMin: 30,
      }),
    ).toEqual([540, 570, 720, 750]);
  });
});
describe("blockSpan", () => {
  it("returns start/end minutes for a chosen start + duration", () => {
    expect(blockSpan(540, 75)).toEqual({ startMin: 540, endMin: 615 });
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/features/booking/day-timeline-model.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
/** Pure model for the single-day booking timeline. Minutes-since-midnight. */
export type MinuteWindow = [openMinute: number, closeMinute: number];

export function startOptions(args: {
  windows: MinuteWindow[];
  durationMin: number;
  granularityMin: number;
}): number[] {
  const { windows, durationMin, granularityMin } = args;
  const out: number[] = [];
  for (const [open, close] of windows) {
    // first granularity-aligned start >= open
    const first = Math.ceil(open / granularityMin) * granularityMin;
    for (let s = first; s + durationMin <= close; s += granularityMin) {
      if (s >= open) out.push(s);
    }
  }
  return out.sort((a, b) => a - b);
}

export function blockSpan(
  startMin: number,
  durationMin: number,
): {
  startMin: number;
  endMin: number;
} {
  return { startMin, endMin: startMin + durationMin };
}
```

- [ ] **Step 4: Run, verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/day-timeline-model.ts src/features/booking/day-timeline-model.test.ts
git commit -m "feat(booking): pure day-timeline start-options model"
```

---

## Task R5: DayTimeline Layer-3 component

**Files:** Create `src/features/booking/_components/scheduler/day-timeline.tsx`; Modify `index.ts` (export `Scheduler.DayTimeline`)

Single-day vertical timeline for hourly booking. **Contract + behavior** (presentational; logic from R4 + existing context):

- [ ] **Step 1: Build the component to this spec**
  - Reads `useScheduler()`: `selection.state.selectedDays` (the one picked day, from MonthGrid single-select), `data.windows`, `data.busy`, `capabilities.intervalMinutes` (= service duration), `data.now`.
  - Derive the picked dayKey (first of `selectedDays`); if none, render a muted prompt "Pick a day above." If present, header shows the Denver date + the duration label (e.g. "1h 15m").
  - Convert that day's open windows + busy to minute-windows; call `startOptions({windows, durationMin: intervalMinutes, granularityMin})` (granularity constant = 15). Render a vertical timeline: hour ticks on the left; shaded **available** bands (`bg-status-available/50`); the user's selection as a **duration-height** clay block (`bg-brand text-brand-foreground`) positioned at the chosen start; ghost slots at each valid start on hover.
  - Selecting a start: dispatch `selection.beginGridDrag(\`${dayKey}@${startMin}\`)`(reuses the existing single-cell gridDraft mechanism the consumer already reads). Provide a **"start at" text input** (type a time → parse to minutes → snap via nearest valid`startOptions`entry → same dispatch). Reject starts not in`startOptions` (disable/no-op).
  - Pixel height per minute is a layout constant (e.g. `px-per-min = 0.9`); block height = `durationMin * pxPerMin`.
  - Touch: block draggable within the track (pointer handlers mirror the existing grid drag pattern — no `setPointerCapture`; window pointerup listener; cleanup on unmount). Targets ≥44px where tappable.
  - Token-only colors; focus-visible rings; `aria-label` on the start input and the block.

- [ ] **Step 2: Export** — in `index.ts`, `import { DayTimeline } from "./day-timeline";` and add `DayTimeline,` to the `Object.assign`.

- [ ] **Step 3: Verify** — `npm run lint && npm run typecheck && npx vitest run src/features/booking` → PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/features/booking/_components/scheduler/day-timeline.tsx" "src/features/booking/_components/scheduler/index.ts"
git commit -m "feat(scheduler): single-day duration-accurate time picker"
```

---

## Task R6: service-booking-client — new flow, live receipt, sticky-centered rail

**Files:** Modify `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`; `docs/FRONTEND.md`, `docs/DESIGN.md`

Preserve ALL business state/handlers and the deferred-auth gate (as in the prior layout task). Changes:

- [ ] **Step 1: Hourly flow → MonthGrid + DayTimeline**
  - For `mode === "week-slots"` (hourly), render `<Scheduler.MonthGrid />` (day pick) followed (stacked) by `<Scheduler.DayTimeline />`, plus `<Scheduler.Legend />` and `<Scheduler.BookingDetailsPanel />`. Remove `<Scheduler.WeekGrid />` from the booking path. The capability stays `daySelection:"single"`, `intervalMinutes` = service duration; `weekNavigable` can be false now (month nav replaces week nav).
  - `onSelectionChange` already maps `gridDraft` ("dayKey@minute") → `selectedSlot` — keep it; it now receives the DayTimeline's start.
  - House-sitting (`month-range`) unchanged (MonthGrid range + ClearDates row + SelectionSummary).
  - Move `<Scheduler.Legend />` and the selection summary OUTSIDE the Scheduler card so they sit on the page (per #5).

- [ ] **Step 2: Live receipt (remove Get-quote)**
  - Delete the "Get a price estimate" section + the `handleGetQuote` button. Add a debounced effect-free recompute: on any change to the booking inputs, call `previewQuote` via the existing transition. Implement WITHOUT `useEffect` setState (repo bans set-state-in-effect): use a `useDeferredValue` over a serialized inputs key OR trigger `startPreviewing(previewQuote…)` from each onChange handler (pet/qty/recurring/selection) through a single `requestQuote()` helper that debounces with a `setTimeout` ref. Keep `quote`/`previewMsg` state. Guests included (previewQuote is public).
  - Rail content: `{previewMsg && inline error}`, `{quote && <QuotePanel preview={quote} />}` (receipt), then **Book** button (existing `handleBook` + deferred-auth gate); show a muted "Select a day and time to see your price" when no quote yet.

- [ ] **Step 3: Sticky-centered rail + mobile bottom bar**
  - Grid: `grid gap-8 pb-24 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:pb-0`.
  - Rail `<aside className="lg:sticky lg:top-6 lg:flex lg:min-h-[calc(100dvh-6rem)] lg:items-center">` with the receipt block inside (centers vertically; if it overflows, `lg:items-start` fallback via `max-h`/overflow — keep simple: `lg:self-start` when tall).
  - Mobile bottom bar (last grid child, `lg:hidden fixed inset-x-0 bottom-0 z-30 … pb-[max(0.75rem,env(safe-area-inset-bottom))]`): live total (`centsToDollars(quote.finalCents)` or "—") + **Book** (`handleBook`).

- [ ] **Step 4: Wire pet cards** — pet assignment uses the restyled card component (Task R7); pass through unchanged props.

- [ ] **Step 5: Verify (build)** — `npm run lint && npm run typecheck && npm run build` → PASS, 28 pages. Manual: hourly service shows month→day-timeline→live receipt; house-sitting shows range; desktop sticky-centered rail; mobile bottom bar; no page h-scroll.

- [ ] **Step 6: Docs + commit**

FRONTEND.md: booking day-timeline (duration-height) vs admin week-grid; per-day clay outline + your-booking dot; live-receipt sticky-centered rail + mobile bottom bar; `NumberStepper`. DESIGN.md: booking flow (hourly month→day→time; house-sitting range; live quote; gate unchanged).

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" docs/FRONTEND.md docs/DESIGN.md
git commit -m "feat(book): month-day-time flow with live receipt and centered rail"
```

---

## Task R7: Pet assignment — cards

**Files:** Modify `src/app/(marketing)/book/[serviceSlug]/_components/pet-assignment.tsx`

- [ ] **Step 1:** Replace each toggle `<button>` chip with a card: `flex items-center gap-3 rounded-xl border p-3 min-h-11 text-left w-full sm:w-auto sm:flex-1`; selected = `border-brand bg-brand/10 text-brand-strong`, else `border-border bg-card hover:bg-muted`. Inside: `PetAvatar` (size ~38), a column with `font-semibold` name + `text-muted-foreground text-xs` breed, and a trailing check indicator (`size-5 rounded-full border-2`; when selected `bg-brand text-brand-foreground` with a `<Check/>`). Keep `aria-pressed`, the `toggle` handler, `eligible` filter, and the add-pet `PetForm` block. Layout the list as `flex flex-wrap gap-2`.

- [ ] **Step 2: Verify** — `npm run lint && npm run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/pet-assignment.tsx"
git commit -m "style(book): pet selection as cards"
```

---

## Task R8: Quantity forms — NumberStepper

**Files:** Modify `src/app/(marketing)/book/[serviceSlug]/_components/quantity-forms.tsx`

- [ ] **Step 1:** Replace the `NumberField` (FormField + numeric Input) with the kit `NumberStepper` (Task R2). Map each field: house-sitting `cantBeLeftAloneDays` (min 0, step 1), `walkMinutesPerDay` (min 0, step 15, unit "min"), `holidayDays` (min 0, step 1); hours services `hours` (min 0.25, step 0.25, unit "hr"). Pass `ariaLabel` = the field label. Keep the `fieldset`/`legend` grouping and the `onChange` wiring into `QuantityState`. Remove the now-unused `FormField`/`Input` imports if fully replaced.

- [ ] **Step 2: Verify** — `npm run lint && npm run typecheck`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/quantity-forms.tsx"
git commit -m "style(book): quantity fields use NumberStepper"
```

---

## Task R9: Spacing/alignment audit (#1)

**Files:** Modify booking + scheduler presentational files as needed (`service-booking-client.tsx`, `month-grid.tsx` wrapper, `day-timeline.tsx`, `quantity-forms.tsx`).

- [ ] **Step 1:** Audit and fix, using `space.*` only: center the `MonthGrid` calendar within its container (`mx-auto` on the calendar block / justify the grid); consistent vertical rhythm between calendar ↔ summary ↔ legend (`gap-4`/`space-y` from the scale, not ad-hoc margins); house-sitting "Details" fields aligned (consistent label/control columns via the stepper + `gap`); step headings share one eyebrow style. No arbitrary `mt-[..]`/`gap-[..]` values.

- [ ] **Step 2: Verify (build)** — `npm run lint && npm run typecheck && npm run build`. Manual: even spacing, centered calendar, aligned details, light+dark.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx" "src/features/booking/_components/scheduler/month-grid.tsx" "src/features/booking/_components/scheduler/day-timeline.tsx" "src/app/(marketing)/book/[serviceSlug]/_components/quantity-forms.tsx"
git commit -m "style(book): spacing and alignment audit pass"
```

---

## Task A1: Account profile — cards, inline saved, masked phone

**Files:** Modify `src/app/(account)/account/page.tsx`, `_components/profile-form.tsx`, `_components/password-form.tsx`

- [ ] **Step 1:** `page.tsx` — wrap the contact-info section and password section each in `Card` (`CardTitle` "Contact info" / "Change password"); keep the read-only email row + `PageHeader`.
- [ ] **Step 2:** `profile-form.tsx` — replace `Label`+`Input` blocks with `FormField`; phone field displays `formatPhone(values.phone)` + `inputMode="tel"`; success → inline `<span className="text-status-available-foreground text-sm font-medium">Saved ✓</span>` (replace the `<p>`); errors inline. Keep the action + transition.
- [ ] **Step 3:** `password-form.tsx` — read it, wrap inputs in `FormField`, keep logic.
- [ ] **Step 4: Verify** — `npm run lint && npm run typecheck`.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(account)/account/page.tsx" "src/app/(account)/account/_components/profile-form.tsx" "src/app/(account)/account/_components/password-form.tsx"
git commit -m "style(account): profile cards with masked phone + inline saved"
```

---

## Task A2: Account pets — cards, ConfirmDialog, segmented species, branded empty

**Files:** Modify `src/app/(account)/account/pets/_components/pets-client.tsx`, `src/features/accounts/_components/pet-form.tsx`, `src/app/(account)/account/pets/page.tsx` (read first)

- [ ] **Step 1:** `pet-form.tsx` — replace the species radio `fieldset` with a segmented control (two `button`s, inline-flex bordered, `min-h-11`; selected `bg-brand/10 text-brand-strong border-brand font-semibold`, `aria-pressed`); keep `values.species`/`set`. Wrap `name`/`breed`/`notes`/`photo` in `FormField` (children form for the file input). Keep upload logic + the inline error.
- [ ] **Step 2:** `pets-client.tsx` — import `useConfirm`, `EmptyState`, `Card`, `Button`, `PawPrint`. In `PetItem` add `const { confirm, dialog } = useConfirm();` render `{dialog}`; `handleDelete` first `await confirm({ title: \`Remove ${pet.name}?\`, description: "This can’t be undone.", confirmLabel: "Remove", destructive: true })`; bail if false. Pet rows → `Card`(or`<li>`with`bg-card border-border rounded-xl border`); inline edit container uses neutral `border-border`. Edit/Delete → kit `Button` (`outline`/`destructive` `sm`). Empty → `<EmptyState title="No pets yet" message="Add the pets Cal will be caring for." icon={<PawPrint className="size-5" />} action={<Button variant="outline" onClick={() => setShowAddForm(true)}>+ Add a pet</Button>} />`.
- [ ] **Step 3: Verify** — `npm run lint && npm run typecheck`. Manual: ConfirmDialog focus-trap+Esc, bottom-sheet on mobile.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/account/pets/_components/pets-client.tsx" "src/features/accounts/_components/pet-form.tsx" "src/app/(account)/account/pets/page.tsx"
git commit -m "feat(account): pet cards with segmented species and confirm-delete"
```

---

## Task A3: Account forms — checklist-dot status cards, FormField validation, masked phone

**Files:** Modify `src/app/(account)/account/forms/_components/forms-client.tsx`, `docs/FRONTEND.md`

- [ ] **Step 1:** Replace the status `<p>` with a checklist dot: `<span className="flex items-center gap-2 text-xs font-medium">` + dot span (`size-2.5 rounded-full`; completed `bg-status-available-foreground ring-2 ring-status-available`, else `border-2 border-border bg-transparent`) + label (`text-foreground` / `text-muted-foreground`). Import `cn`.
- [ ] **Step 2:** Form card → `bg-card border-border rounded-xl border`; `EmergencyFields` wrap each input in `FormField`; phone fields use `formatPhone` + `inputMode="tel"`; add inline validation: <10 digits on submit → `error="Enter a 10-digit phone number"` on that FormField (local `errors` object; don't change the action). Buttons → kit `Button`.
- [ ] **Step 3: Verify** — `npm run lint && npm run typecheck`.
- [ ] **Step 4: Docs + commit** — FRONTEND.md: checklist-dot status tell standard.

```bash
git add "src/app/(account)/account/forms/_components/forms-client.tsx" docs/FRONTEND.md
git commit -m "style(account): forms as checklist-dot cards with field validation"
```

---

## Task A4: Account bookings — kit Table, badges, EmptyState

**Files:** Modify `src/app/(account)/account/bookings/page.tsx`, `_components/prepay-button.tsx` (read first)

- [ ] **Step 1:** Replace the `<ul>` list with `Table`: header `Service | When | Status | Total | (action)`; each booking a `TableRow` with `TableCell data-label="…"` per column. Keep `formatDenver`/`formatDollars`/`amountOwed`. Status → `Badge` (`confirmed|completed`→`available`/`default`, `pending_approval`→`unavailable`, `cancelled|declined|no_show`→`destructive`), label `status.replace(/_/g," ")`. Owed `> 0` → `text-brand-strong`. `PrepayButton` in the action cell when `showPayButton`.
- [ ] **Step 2:** Empty → `<EmptyState title="No upcoming bookings" message="When you book, it’ll show up here." action={<Button asChild variant="brand"><Link href="/book">Browse services</Link></Button>} />` (upcoming) and `EmptyState title="No past bookings"` (history). Import `EmptyState`, `Button`, `Link`.
- [ ] **Step 3: Verify (build)** — `npm run lint && npm run typecheck && npm run build`. Manual: table → stacked cards below `md`.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/account/bookings/page.tsx" "src/app/(account)/account/bookings/_components/prepay-button.tsx"
git commit -m "style(account): bookings table with status badges + empty states"
```

---

## Task A5: Onboarding — shell, cards, FormField, masked phone

**Files:** Modify `src/app/(account)/onboarding/page.tsx`

- [ ] **Step 1:** Keep `PageContainer width="read"`; replace the bare `<h1>`/`<p>` with `PageHeader title="Welcome — let’s get you set up" subtitle="Fill in your profile and emergency info before booking."`. Wrap each `<fieldset>` (Profile / Emergency contact / Veterinarian) in a `Card` with `CardTitle`.
- [ ] **Step 2:** Replace `Label`+`Input` with `FormField`; phone fields (`phone`,`contact_phone`,`vet_phone`) use `formatPhone` + `inputMode="tel"`. Keep the `FormData` submit + `returnTo` logic. Full-width submit `Button`.
- [ ] **Step 3: Verify** — `npm run lint && npm run typecheck`.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/onboarding/page.tsx"
git commit -m "style(onboarding): shell + carded form with masked phone"
```

---

## Task A6: Auth login + signup — FormField, brand button, card

**Files:** Modify `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` (read first)

- [ ] **Step 1:** `login` — wrap form in `Card`; `Label`+`Input` → `FormField`; submit `Button` `variant="brand"` full width; keep email/password state + `safeReturnTo` redirect + the `<Link href="/signup">`.
- [ ] **Step 2:** `signup` — mirror; preserve its action + any phone field → `formatPhone`.
- [ ] **Step 3: Verify (build)** — `npm run lint && npm run typecheck && npm run build`.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx"
git commit -m "style(auth): carded login + signup with FormField and brand button"
```

---

## Task Z1: Docs reconciliation + verification walk

**Files:** `docs/FRONTEND.md`, `docs/DESIGN.md`, `docs/DEV_NOTES.md`

- [ ] **Step 1:** Reconcile docs: confirm FRONTEND.md captures the booking day-timeline, per-day outline + your-booking dot, live-receipt centered rail + mobile bar, NumberStepper, checklist-dot, account/auth on shell + feedback taxonomy; `--destructive-warm` in brand-token list. DESIGN.md booking + account route notes match shipped; saved-cards future hook noted. Update `_Last reviewed_` footers to `2026-06-06`.
- [ ] **Step 2: Full gate** — `npm run lint && npm run typecheck && npm run build && npm test` green (page count unchanged; verify the `payments.test.ts` flake in isolation if it trips).
- [ ] **Step 3: Live ≤390px + keyboard-a11y walk** — `/book/[serviceSlug]` hourly (month→day-timeline→live receipt, duration block drag + type start, your-booking dots) AND house-sitting (range + ClearDates); `/account`, `/account/pets` (ConfirmDialog), `/account/forms`, `/account/bookings` (table→cards), `/onboarding`, `/login`, `/signup`. Confirm sticky-centered rail (desktop) / pinned bottom bar (mobile), visible focus + keyboard operability of the timeline + stepper, no page h-scroll, light + dark.
- [ ] **Step 4: Commit + finish**

```bash
git add docs/FRONTEND.md docs/DESIGN.md docs/DEV_NOTES.md
git commit -m "docs: reconcile frontend + design for booking redesign and account"
```

Do NOT push. Offer `superpowers:finishing-a-development-branch`.

---

## Self-review notes (author)

- **Spec coverage:** #1 R9; #2 R6; #3 R5/R6; #4 R1/R2/R8; #5 R3 (+R6 legend-on-page); #6 R4/R5; #7 R6; #8 R7; #9 R3/R5/R6 (target mockup-B). Account/auth A1–A6. Docs Z1.
- **Layer-2:** only additive `myBookings` context type + Layer-3 swaps; the duration logic is a NEW pure util (R4) — existing `schedule-selection`/`grid-runs` tests stay green; no edits to those pure files required by this plan.
- **Type consistency:** `clampToStep`/`sanitizeIntInput` (R1) used by R2/R8; `startOptions`/`blockSpan` (R4) used by R5; `formatPhone`/`centsToDollars` shared; kit prop shapes per Reference.
- **Carry-forward honored:** prior clay-ring/booking-wrapper/layout commits are reworked by R3/R6/R7/R8, not duplicated.
