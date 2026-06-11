# SP3b Plan A — Codebase deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the three duplication findings SP3a's review deferred (A14 shared slot-validation, A16 redundant re-parse, A13 shared booking-scheduler hook) with zero functional or visual change.

**Architecture:** Behavior-preserving consolidation, internal to the booking feature behind its locked public API (no cross-feature surface change). Lowest-risk extractions first (A14, A16 — small, well-covered cores), then the larger A13 hook generalization guarded by the existing integration tests plus a new characterization test for the thin-covered path. Every step is guarded by the existing suite + `tsc` strict + the boundary lint.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Vitest · ESLint 9 + `eslint-plugin-boundaries`.

**Source spec:** [docs/superpowers/specs/2026-06-10-sp3b-system-ia-primitives-design.md](../specs/2026-06-10-sp3b-system-ia-primitives-design.md). Findings owned (Plan A): A13, A14, A16 (register §SP3).

---

## Standing rules for every task

- **Behavior-preserving.** No functional or visual change. If a change alters a test's expected value, stop — behavior changed; escalate per WORKFLOW.md `## Handoff log`.
- **Gates per task:** `npm run typecheck` (tsc strict) + `npm run lint` (boundary gate) + the task's named test command must all pass before commit. Per [handoff-gate-scoping], gate on the task's relevant test files, not a blanket `vitest run`; the full suite + integration tests run in the execution session (local Supabase stack up — `npx supabase status`).
- **Commits:** Conventional Commits, **subject line only** (AGENTS.md constitution — no body, no trailers, no internal codenames in the subject). Husky/lint-staged reformats + runs tsc on commit; re-stage if it modifies files.
- **Same-commit doc rule:** a task that changes a documented decision updates the relevant doc (ADR) in the same commit.
- Work on `main`, no worktree unless asked.

---

## Task 1: Shared slot validation (A14)

The `SettingsRow → BookingRuleSettings` mapping and the guard/window check pairing are duplicated across `create-core.ts`, `edit-core.ts` (×2 — `editBookingCore` and its near-clone `previewEditCore`), and `reschedule-core.ts`. Extract two helpers into `booking-service-shared.ts`; the four cores call them. This removes the edit-vs-preview drift risk that `previewEditCore` exists to guard against.

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts` (add `toRuleSettings` + `validateSlot`)
- Modify: `src/features/booking/create-core.ts`
- Modify: `src/features/booking/edit-core.ts`
- Modify: `src/features/booking/reschedule-core.ts`
- Test: existing `src/features/booking/booking-service.test.ts`, `edit-booking.test.ts`, `reschedule-booking.test.ts`, `cancellation.test.ts` (unchanged — they assert the cores' external behavior, which must stay identical)

- [ ] **Step 1: Read the four cores and confirm the duplicated blocks**

Read `create-core.ts`, `edit-core.ts`, `reschedule-core.ts`. In each, locate (a) the `BookingRuleSettings` object literal built from `settings.*` (in create-core this is lines ~94–99: `bookingOpenMinute`/`bookingCloseMinute`/`minLeadTimeHours`/`hardMaxAdvanceDays`), and (b) the per-occurrence pairing of `passesGuards(slot, ruleSettings, now)` + `fitsWindow(slot, openWindows)`. Note each core's surrounding policy flags + warning strings + early-return reasons — those must stay verbatim.

- [ ] **Step 2: Add `toRuleSettings` + `validateSlot` to `booking-service-shared.ts`**

`fitsWindow` and `passesGuards` are already exported from `./availability` and re-exported by shared. Add, after the existing re-exports:

```ts
import type { SettingsRow } from "./booking-repository";

/**
 * Maps a settings row to the BookingRuleSettings the guard checks consume.
 * Single source of truth — previously rebuilt inline in 4 cores (A14).
 */
export function toRuleSettings(settings: SettingsRow): BookingRuleSettings {
  return {
    bookingOpenMinute: settings.booking_open_minute,
    bookingCloseMinute: settings.booking_close_minute,
    minLeadTimeHours: settings.min_lead_time_hours,
    hardMaxAdvanceDays: settings.hard_max_advance_days,
  };
}

/**
 * Runs the two slot-availability checks for one occurrence. Callers keep their
 * own policy-aware warning/early-return logic; this only consolidates the
 * guard + window pairing so create/edit/preview/reschedule cannot drift.
 * `openWindows` is the value `repo.getOpenWindows(now)` returns (the type
 * `fitsWindow` already accepts).
 */
export function validateSlot(
  slot: { startsAt: Date; endsAt: Date },
  ruleSettings: BookingRuleSettings,
  openWindows: Parameters<typeof fitsWindow>[1],
  now: Date,
): { guardsOk: boolean; windowOk: boolean } {
  return {
    guardsOk: passesGuards(slot, ruleSettings, now),
    windowOk: fitsWindow(slot, openWindows),
  };
}
```

(`SettingsRow` is already imported as a type in shared — confirm and avoid a duplicate import.)

- [ ] **Step 3: Repoint `create-core.ts`**

Replace the inline `ruleSettings` literal with `const ruleSettings = toRuleSettings(settings);` (import `toRuleSettings` from `./booking-service-shared`). In the guard loop, replace the inline `passesGuards(...)` call and in the window loop the inline `fitsWindow(...)` call with `validateSlot(...)` reads — preserving the exact existing `policy.skipHoursLeadGuards` / `policy.skipWindowFit` branches, warning strings, and `unavailable` return reasons. Behavior identical.

- [ ] **Step 4: Repoint `edit-core.ts` (both `editBookingCore` and `previewEditCore`)**

Apply the same substitution in both functions. Both now build `ruleSettings` via `toRuleSettings` and run the checks via `validateSlot` — eliminating the verbatim duplication between the edit twin and its preview. Keep each function's existing result/return shape unchanged.

- [ ] **Step 5: Repoint `reschedule-core.ts`**

Same substitution. Preserve its warning/return text.

- [ ] **Step 6: Verify gates**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS
Run: `npm run test -- src/features/booking/booking-service.test.ts src/features/booking/edit-booking.test.ts src/features/booking/reschedule-booking.test.ts src/features/booking/cancellation.test.ts` → Expected: PASS (identical assertions)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract shared booking slot validation helpers"
```

---

## Task 2: Drop the redundant create-core re-parse (A16)

`computeBookingArtifacts` already runs `createBookingInputSchema.safeParse(rawInput)` and discards the parsed `input`, forcing `create-core.ts:88` to re-run `createBookingInputSchema.parse(rawInput)` to recover `userId`/`startsAt`/`endsAt`. Surface the parsed input on the artifacts bundle so create-core reads it instead of re-parsing. Removes redundant validation + divergence risk.

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts` (`BookingQuoteArtifacts` + `computeBookingArtifacts`)
- Modify: `src/features/booking/create-core.ts`
- Test: existing `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Add `input` to `BookingQuoteArtifacts`**

In `booking-service-shared.ts`, add a field to the `BookingQuoteArtifacts` interface (after `service`/`settings`):

```ts
/**
 * The validated + coerced create input (schema output: startsAt/endsAt are
 * Dates). Surfaced so create-core reuses it instead of re-parsing (A16).
 */
input: z.output<typeof createBookingInputSchema>;
```

- [ ] **Step 2: Populate it in `computeBookingArtifacts`**

`computeBookingArtifacts` already has `const input = parseResult.data;` (the coerced output). Add `input,` to the returned `artifacts` object literal (alongside `service`, `settings`, …).

- [ ] **Step 3: Read it in `create-core.ts`**

Replace `const input = createBookingInputSchema.parse(rawInput);` (line ~88) with `const input = result.artifacts.input;`. Remove the now-unused `createBookingInputSchema` import from `create-core.ts` if nothing else uses it (lint will flag it).

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS (no unused import)
Run: `npm run test -- src/features/booking/booking-service.test.ts` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: reuse parsed booking input from quote artifacts"
```

---

## Task 3: Shared booking-scheduler hook (A13)

`use-service-booking.ts`, `use-edit-booking.ts`, `use-admin-create-booking.ts` are ~90% duplicated. Extract the common scheduler substrate into a `useBookingScheduler` primitive; each existing hook becomes a thin wrapper passing its preview/submit callbacks + gating. This is a discovery-heavy refactor — the exact shared boundary is found by diffing the three. **Behavior-preserving; the highest-risk task in this plan — TDD-guard it.**

**Files:**

- Read: `src/app/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts`
- Read: `src/app/(account)/account/bookings/[id]/edit/_components/use-edit-booking.ts`
- Read: `src/app/(admin)/admin/clients/[clientId]/book/_components/use-admin-create-booking.ts`
- Create: `src/features/booking/use-booking-scheduler.ts` (the shared substrate hook) + export from `src/features/booking/index.client.ts`
- Create: `src/app/(marketing)/book/[serviceSlug]/_components/use-service-booking.characterization.test.tsx`
- Modify: the three `use-*.ts` hooks to consume `useBookingScheduler`
- Test: existing `src/features/booking/edit-booking.integration.test.ts`, `src/features/booking/admin-create-booking.integration.test.ts`

- [ ] **Step 1: Diff the three hooks; map the shared substrate vs the deltas**

Read all three. Confirm the shared substrate (present near-verbatim in all three): local date helpers (`pad`/`localDayKey`/`localDateFromKey`), `buildCapabilities`, stable `now`, busy/availability wiring (`useAvailability`/`useBusyRanges`/`busyRanges` mapping), `schedulerData` memo, `stay` derivation + `startsAt`/`endsAt`/`nights`, the debounce timer ref + cleanup effect, the latest-ref pattern (`buildInputRef`/`canQuoteRef` + sync effect), `requestQuote` (400 ms), and `onSelectionChange` (the month-range vs week-slots branch incl. the `"dayKey@minute"` cell parsing). Confirm the per-hook **deltas**: the submit handler (`createBooking` vs `editBooking`/preview vs `createBookingForClient`), auth/`forceConfirm` gating, result-message helpers, and return-shape extras (step labels, admin force-confirm checkbox, edit initial-slot pre-selection).

- [ ] **Step 2: Write a characterization test for the service-booking path FIRST**

This path is the thinnest-covered (edit + admin-create have integration tests; service-booking does not). Pin its current behavior before extracting. Create `use-service-booking.characterization.test.tsx` using `@testing-library/react`'s `renderHook` (follow the existing hook-test style in the repo — grep an existing `renderHook` test for the import + setup pattern). Assert the load-bearing invariants:

```tsx
// Pseudocode shape — fill stubs by reading the hook's input types + repo test helpers.
import { renderHook, act } from "@testing-library/react";
import { useServiceBooking } from "./use-service-booking";

describe("useServiceBooking (characterization)", () => {
  it("derives no selection initially and disables booking", () => {
    const { result } = renderHook(() =>
      useServiceBooking(/* minimal valid input */),
    );
    expect(result.current.hasSelection).toBe(false);
    expect(result.current.bookEnabled).toBe(false);
  });

  it("onSelectionChange keeps a stable identity across re-render (no render-loop)", () => {
    const { result, rerender } = renderHook(() =>
      useServiceBooking(/* same input */),
    );
    const first = result.current.onSelectionChange;
    rerender();
    expect(result.current.onSelectionChange).toBe(first);
  });

  it("week-slots selection of a 'dayKey@minute' cell derives startsAt", () => {
    const { result } = renderHook(() =>
      useServiceBooking(/* week-slots service */),
    );
    act(() => {
      result.current.onSelectionChange({
        gridDraft: new Set(["2026-07-01@540"]),
        selectedDays: new Set(),
      } as never);
    });
    expect(result.current.hasSelection).toBe(true);
  });
});
```

Run: `npm run test -- src/app/(marketing)/book/[serviceSlug]/_components/use-service-booking.characterization.test.tsx` → Expected: PASS against the CURRENT (pre-extraction) hook. (If a stub assumption is wrong, fix the test to match real current behavior — it is a characterization snapshot, not a spec.)

- [ ] **Step 3: Extract `useBookingScheduler`**

Create `src/features/booking/use-booking-scheduler.ts`. Move the shared substrate verbatim. Recommended parameterization (refine against the real diff):

```ts
export interface UseBookingSchedulerConfig {
  service: {
    slug: string;
    pricingType: PricingType;
    defaultDurationMin?: number;
  };
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  initialSelection: { start?: string; end?: string; petIds: string[] };
  myBookingDayKeys: string[];
  /** Injected quote preview — service path passes previewQuote; admin its own. */
  preview: (input: BuildInput) => Promise<PreviewResult>;
  /** True when a server quote should be requested (auth/ready gating differs per caller). */
  canQuote: boolean;
}

export interface UseBookingSchedulerReturn {
  mode: "week-slots" | "month-range";
  capabilities: SchedulerCapabilities;
  schedulerData: SchedulerData;
  range: DateRange | undefined;
  stay: StayValidation | null;
  startsAt: Date | null;
  endsAt: Date | null;
  nights: number | null;
  hasSelection: boolean;
  quote: BookingQuotePreview | null;
  previewMsg: UserMessage | null;
  isPreviewing: boolean;
  // controlled scheduler inputs (quantities/pets/recurring) + their setters
  quantities: QuantityState;
  selectedPetIds: string[];
  recurringOn: boolean;
  occurrenceCount: number;
  onSelectionChange: (state: ScheduleSelectionState) => void; // MUST stay useCallback([mode])
  requestQuote: () => void; // MUST keep the 400 ms debounce
  buildSelectionInput: () => BuildInput; // wrapper composes submit from this
  onQuantitiesChange: (s: QuantityState) => void;
  onPetIdsChange: (ids: string[]) => void;
  onRecurringOnChange: (on: boolean) => void;
  onOccurrenceCountChange: (n: number) => void;
}
```

**Hard invariants to preserve verbatim** (SP3a regression history — do not "clean up"): `onSelectionChange` MUST remain `useCallback` with deps `[mode]` (an unstable identity re-fires `Scheduler`'s `useEffect` subscription → spurious `setState`/`requestQuote`, render-loop risk — the exact bug fixed in SP3a commit `99040d4`); the live-quote debounce MUST stay 400 ms via the timer ref; the latest-ref sync MUST stay a ref-only effect (no setState — repo eslint bans set-state-in-effect). Types come from `@/features/booking/index.client` (the client entry, per SP3a's ADR-0002 client/server split) — keep these hooks on the client entry. Export `useBookingScheduler` from `index.client.ts`.

- [ ] **Step 4: Reparameterize the three wrapper hooks**

Rewrite each `use-*.ts` to call `useBookingScheduler(config)` and add only its deltas: its submit handler (composed from `buildSelectionInput()`), its auth/`forceConfirm` gating, its result-message mapping, and its return-shape extras (step labels / force-confirm checkbox / edit initial-slot). Each wrapper's PUBLIC return shape (consumed by its `*-client.tsx`) stays identical — the components are untouched. Do one hook, typecheck, then the next.

- [ ] **Step 5: Verify gates + parity**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS (boundaries: hooks stay on `index.client`)
Run: `npm run test -- src/app/(marketing)/book/[serviceSlug]/_components/use-service-booking.characterization.test.tsx` → Expected: PASS (same assertions, now against the reparameterized hook)
Run (execution session, stack up): `npm run test -- src/features/booking/edit-booking.integration.test.ts src/features/booking/admin-create-booking.integration.test.ts` → Expected: PASS
Manual (execution session, `frontend-design` invoked before touching any markup — but this task touches none): walk book-a-walk, edit-booking, and admin create-on-behalf on `admin-demo` seed at desktop **and** mobile — selection→quote, debounce feel, force-confirm, edit pre-selection identical to pre-extraction.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: extract shared booking-scheduler hook"
```

---

## Task 4: ADR for the deepening decisions

Record the shared-slot-validation + shared-scheduler-hook decisions, continuing SP3a's decision-memory discipline. (SP3a left the ADR sequence at 0004 — confirm the highest existing number in `docs/adr/` and use the next.)

**Files:**

- Create: `docs/adr/000N-booking-core-and-scheduler-deduplication.md` (N = next number after the highest in `docs/adr/`)

- [ ] **Step 1: Confirm the next ADR number**

Run: `Get-ChildItem docs/adr` (or read the dir) → note the highest `NNNN-` prefix; use the next.

- [ ] **Step 2: Write the ADR**

```markdown
# ADR-000N: Booking core + scheduler deduplication

## Context

SP3a relocated booking logic into per-concern cores and per-component hooks behavior-preservingly, but could not consolidate duplication it moved verbatim (its DoD was no-behavior-change). The fresh review logged A14 (the `SettingsRow→BookingRuleSettings` map + guard/window pairing duplicated across create/edit/preview/reschedule cores), A16 (`create-core` re-parsing input `computeBookingArtifacts` already parsed), and A13 (three ~90%-duplicated booking-scheduler hooks).

## Decision

- `toRuleSettings()` + `validateSlot()` live in `booking-service-shared` (the "≥2 cores" home); all four cores call them. `previewEditCore` and `editBookingCore` now run the same `validateSlot`, removing the WYSIWYG drift risk.
- `computeBookingArtifacts` surfaces its parsed `input` on `BookingQuoteArtifacts`; cores reuse it instead of re-parsing.
- A `useBookingScheduler` primitive owns the scheduler substrate (selection→time derivation, availability/busy wiring, debounced preview, cell parsing); `use-service-booking` / `use-edit-booking` / `use-admin-create-booking` are thin wrappers supplying preview/submit/gating deltas. Load-bearing invariants (onSelectionChange `useCallback([mode])` stability, 400 ms debounce, ref-only latest-input sync) are preserved verbatim.

## Consequences

- A fix to slot validation, quote debounce, or cell parsing is made once, not 2–4×.
- The shared hook is the single place future scheduler behavior changes land.
- Wrappers stay free to diverge on submit/gating without copying the substrate.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr
git commit -m "docs: record booking core and scheduler dedup decisions"
```

---

## Definition of done (Plan A)

- A13, A14, A16 consolidated; behavior-preserving.
- `npm run typecheck` + `npm run lint` (boundary gate) green; named test files green; full suite shows **no new failures** vs the SP3a baseline (the 7 pre-existing shared-DB isolation failures documented in the SP3a plan Handoff log are not regressions).
- ADR committed; spec's Plan A scope satisfied.
- Findings A13/A14/A16 pruned from the register at the SP3b DoD (Plan B's wrap task owns the prune so both plans' findings clear together).

---

## Handoff log

(Append blocking criticals here during execution; resolve before Plan A DoD.)

- 2026-06-10 · Task 1 (A14) · Minor deviation: `validateSlot` NOT extracted/used. The four cores do not share a clean guard/window pairing — each gates `passesGuards`/`fitsWindow` behind its own policy flags (`skipHoursLeadGuards`/`skipWindowFit`), short-circuits between them, fetches `openWindows` lazily, and `editBookingCore` vs `previewEditCore` diverge intentionally on warning-vs-silent admin-skip. A combined runner would change behavior (eager fetch / lost short-circuit / lost divergence), violating the behavior-preserving rule. Shipped only `toRuleSettings` (the genuinely clean dedup; removes the settings-literal drift the preview twin risked). ADR (Task 4) reflects this. Behavior-preserving; named tests 67/67 pass.

---

_Last reviewed: 2026-06-10_
