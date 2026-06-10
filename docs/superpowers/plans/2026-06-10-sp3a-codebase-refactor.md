# SP3a Codebase Structure Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the feature codebase to an enforceable modular structure — public-API seams, split god files/components, a testable mutation layer, and a notifier seam — with zero functional or visual change.

**Architecture:** Foundation-first. Author decision memory, relocate misplaced modules, then lock per-feature public APIs with `eslint-plugin-boundaries`, then perform internal splits behind the locked seams, then extract the action/mutation layer and notifier seam. Every step is behavior-preserving and guarded by the existing test suite + `tsc` strict + the new boundary lint.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Vitest · ESLint 9 flat config · `eslint-plugin-boundaries`.

**Source spec:** [docs/superpowers/specs/2026-06-10-sp3a-codebase-refactor-design.md](../specs/2026-06-10-sp3a-codebase-refactor-design.md). Findings owned: A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 (register §SP3).

---

## Standing rules for every task

- **Behavior-preserving.** No functional or visual change. If a change alters a test's expected value, stop — that means behavior changed; escalate per WORKFLOW.md.
- **Gates per task:** `npm run typecheck` (tsc strict) + `npm run lint` + the task's named test command must all pass before commit. Per [handoff-gate-scoping], gate on the task's relevant test files, not a blanket `vitest run`; the full suite + integration tests run in the execution session (local Supabase stack up — `npx supabase status`).
- **Commits:** Conventional Commits, **subject line only** (AGENTS.md constitution — no body, no trailers). Husky/lint-staged will reformat + run tsc on commit; re-stage if it modifies files.
- **Same-commit doc rule:** a task that moves/adds/deletes files updates the relevant doc in the same commit.
- Work on `main`, no worktree unless asked.

---

## Task 1: Decision memory scaffold (A10)

Creates `CONTEXT.md` (domain glossary) and `docs/adr/` with the first ADR. Later tasks append ADRs as decisions land.

**Files:**

- Create: `CONTEXT.md`
- Create: `docs/adr/0001-feature-boundary-architecture.md`
- Create: `docs/adr/README.md`

- [ ] **Step 1: Write `CONTEXT.md`** — domain glossary the `improve-codebase-architecture` skill consumes.

```markdown
# Domain context

> Glossary of the booking domain vocabulary. Keep terms here in sync with the names used in `src/features/*`. Architecture decisions live in `docs/adr/`.

## Core entities

- **Booking** — a single confirmed service occurrence (walk / overnight / etc.) for a client. DB row in `bookings`; status machine in `features/booking/state-machine.ts`.
- **Series** — a recurring booking template that rolls future occurrences via the series-roll cron (`features/booking/series-cron.ts`); honors `skipped_starts` (RFC 5545-style exceptions).
- **Quote** — server-derived price for a prospective booking; pure computation in `features/pricing`. Never client-trusted.
- **Onboarding** — the new-client intake (profile, pets, address, emergency contacts) gating booking. Lives in `features/accounts`.
- **Debt / debit** — money a client owes (e.g. late-cancel retained fee); blocks re-booking until settled.
- **Meet-greet** — an introductory booking type; admin-tracked via upcoming list.

## Server-derived invariants (do not move client-side)

- Pricing, approval requirement, pet counts, and all booking gates are computed server-side in `computeBookingArtifacts` / pricing. See DESIGN.md.

## Module ownership

- `features/<domain>/index.ts` is the **only** importable surface of a feature from outside it (enforced by `eslint-plugin-boundaries`). See ADR-0001.
```

- [ ] **Step 2: Write `docs/adr/README.md`**

```markdown
# Architecture Decision Records

Short records of consequential architecture decisions. One file per decision, numbered. Format: Context → Decision → Consequences. Append a new ADR when a decision changes how the codebase is structured; never edit a superseded ADR's decision — add a new one that supersedes it.
```

- [ ] **Step 3: Write `docs/adr/0001-feature-boundary-architecture.md`**

```markdown
# ADR-0001: Feature-boundary architecture with enforced public APIs

## Context

`src/features/<domain>/` folders were flat with no public/private distinction. Cross-feature imports reached internal files (accounts→booking internals, admin→booking/payments/pricing internals; booking↔pricing coupled through internals). Boundaries eroded silently because nothing enforced them (finding A3).

## Decision

Each feature exposes its public surface via `src/features/<domain>/index.ts`. Cross-feature imports resolve only through that index. Enforced with `eslint-plugin-boundaries` `entry-point` rule (feature elements: allow `index.ts` only), wired into the lint gate. Within a feature, files import each other freely. Feature→feature cycles are permitted by the allow-list where they already exist (e.g. booking↔admin via the scheduler); breaking cycles is out of scope for SP3a (behavior-preserving) and noted for later.

## Consequences

- Refactors inside a feature can't break external consumers as long as `index.ts` is stable.
- A new cross-feature dependency is a deliberate act (add the export to `index.ts`).
- Initial cost: authoring index files + rewriting cross-feature imports to them.
```

- [ ] **Step 4: Commit**

```bash
git add CONTEXT.md docs/adr
git commit -m "docs: add CONTEXT glossary and ADR scaffold"
```

---

## Task 2: Cross-feature moves to correct homes (A4, A8)

Relocate misplaced modules **before** seams lock, so the boundary allow-list is declared against correct ownership. Each move is `git mv` + rewrite of every importer + tests green. All moves are within-repo path changes; no logic edits.

**Files (move):**

- `src/features/admin/client-balance.ts` (+ `client-balance.test.ts`) → `src/features/payments/`
- `src/features/admin/admin-guard.ts` → `src/lib/admin-guard.ts`
- `src/features/admin/admin-session.ts` → `src/lib/admin-session.ts`
- `src/features/admin/meet-greet-upcoming.ts` (+ `meet-greet-upcoming.test.ts`) → `src/features/booking/`
- `src/features/forms/emergency-schema.ts` → `src/features/accounts/emergency-schema.ts`
- `src/features/forms/registry.ts` → `src/features/accounts/form-registry.ts`
- Delete: `src/features/forms/` (empty after moves)
- Modify: `AGENTS.md` ("Layout" section) — same commit

- [ ] **Step 1: Move client-balance → payments**

```bash
git mv src/features/admin/client-balance.ts src/features/payments/client-balance.ts
git mv src/features/admin/client-balance.test.ts src/features/payments/client-balance.test.ts
```

Then update every importer. Find them:

Run: `npm run lint 2>$null; grep -rn "admin/client-balance" src`
For each hit, change the import path `@/features/admin/client-balance` → `@/features/payments/client-balance`.

- [ ] **Step 2: Move admin-guard + admin-session → lib**

```bash
git mv src/features/admin/admin-guard.ts src/lib/admin-guard.ts
git mv src/features/admin/admin-session.ts src/lib/admin-session.ts
```

Update importers. Known cross-feature importers (from audit): `src/features/inquiries/inquiry-actions.ts` (`assertActorIsAdmin` from admin-guard, `getActorOrRedirect` from admin-session). Find all:

Run: `grep -rn "features/admin/admin-guard\|features/admin/admin-session" src`
Change each `@/features/admin/admin-guard` → `@/lib/admin-guard` and `@/features/admin/admin-session` → `@/lib/admin-session`.

- [ ] **Step 3: Move meet-greet-upcoming → booking**

```bash
git mv src/features/admin/meet-greet-upcoming.ts src/features/booking/meet-greet-upcoming.ts
git mv src/features/admin/meet-greet-upcoming.test.ts src/features/booking/meet-greet-upcoming.test.ts
```

Run: `grep -rn "admin/meet-greet-upcoming" src`
Change each `@/features/admin/meet-greet-upcoming` → `@/features/booking/meet-greet-upcoming`.

- [ ] **Step 4: Inline forms into accounts (A8)**

```bash
git mv src/features/forms/emergency-schema.ts src/features/accounts/emergency-schema.ts
git mv src/features/forms/registry.ts src/features/accounts/form-registry.ts
```

Update the three known importers:

- `src/features/accounts/onboarding-form.ts`: `@/features/forms/emergency-schema` → `@/features/accounts/emergency-schema`
- `src/features/accounts/onboarding-action.ts`: `@/features/forms/emergency-schema` → `@/features/accounts/emergency-schema`
- `src/features/accounts/account-actions.ts`: `@/features/forms/registry` → `@/features/accounts/form-registry`

Verify none remain: `grep -rn "features/forms" src` → expect no output. Then the folder is empty (Git removed the moved files); confirm and remove any leftover:

Run: `ls src/features/forms 2>$null` → if empty/absent, done.

- [ ] **Step 5: Update AGENTS.md Layout section**

In `AGENTS.md`, the "Layout" line describes `src/features/<domain>/` and `src/lib/` generically — no per-file paths (no-code-as-doc rule). The moves don't change those generic responsibilities, so no edit is expected. Only edit if a moved module contradicts a stated responsibility; otherwise leave AGENTS.md untouched and this step is a no-op.

- [ ] **Step 6: Verify gates**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS (no unresolved imports)
Run: `npm run test -- src/features/payments/client-balance.test.ts src/features/booking/meet-greet-upcoming.test.ts` → Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: relocate balance, auth guards, meet-greet, and forms to correct features"
```

---

## Task 3: Public-API seams + boundary enforcement (A3)

Add `index.ts` to each feature, install + configure `eslint-plugin-boundaries`, rewrite cross-feature imports through indexes, wire the lint gate. The lint is the spec: iterate until `npm run lint` is green.

**Files:**

- Create: `src/features/{booking,admin,accounts,payments,pricing,notifications,inquiries,gallery,reviews}/index.ts`
- Modify: `eslint.config.mjs`
- Modify: `package.json` (devDependencies via install)
- Modify: cross-feature import sites (rewrite to indexes)
- Create: append ADR note (already ADR-0001 from Task 1; no new file)

- [ ] **Step 1: Install the plugin + TS resolver**

```bash
npm install -D eslint-plugin-boundaries eslint-import-resolver-typescript
```

- [ ] **Step 2: Seed each feature's `index.ts`**

Create `index.ts` re-exporting the symbols other features consume. Seed list derived from the audit's cross-feature import graph — start here, then let lint reveal the rest (Step 5). Pattern (booking shown; mirror for each feature, re-exporting only what is consumed cross-feature):

```ts
// src/features/booking/index.ts — public API of the booking feature.
export { createBooking, rescheduleBooking } from "./actions";
export { cancelBookingCore } from "./booking-service";
export { createSupabaseBookingRepository } from "./booking-repository";
export type { OnboardingStatus, BookingStatusDb } from "./booking-repository";
export {
  denverMidnight,
  denverDayKey,
  denverMinutesSinceMidnight,
  fitsWindow,
} from "./availability";
export type { BookingRuleSettings, TimeRange } from "./availability";
export { transition } from "./state-machine";
export { useAvailability } from "./use-availability";
export { useBusyRanges } from "./use-busy-ranges";
export { hourlySchedulerData } from "./hourly-scheduler-data";
export { BOOK_WALK_CAPABILITIES } from "./schedule-capabilities";
export type { SchedulerCapabilities } from "./schedule-capabilities";
export type { ScheduleSelectionState } from "./schedule-selection";
export type { PublicBusyRange } from "./busy-ranges";
export { safeReturnTo } from "./return-to";
export { Scheduler } from "./_components/scheduler";
export type {
  SchedulerData,
  SchedulerCallbacks,
  BusyBlock,
} from "./_components/scheduler";
// meet-greet-upcoming moved in via Task 2:
export * from "./meet-greet-upcoming";
```

Seed lists for the other features (cross-feature consumers, from the audit graph):

- `pricing/index.ts`: `parsePricingConfig` (config-schemas); `quote` (quote); `deriveApproval` (distance) + distance helpers booking uses; `defaultGeocoder` (geocoding/zip-centroid-geocoder); `type Geocoder` (geocoding/geocoder); `type PricingType, QuoteInput, QuoteBreakdown, WalkConfig` (types).
- `payments/index.ts`: `type PaymentGateway` (types); `StripeGateway` (stripe-gateway); `export * from "./client-balance"` (moved in Task 2).
- `notifications/index.ts`: `ResendMailer` (resend-mailer); `sendBookingConfirmation` (send-booking-emails). (Notifier interface added in Task 8.)
- `accounts/index.ts`: `type Pet, PetInput` (account-actions); `PetForm` (\_components/pet-form).
- `admin/index.ts`: the availability/overnight actions consumed by `booking/scheduler-context.tsx`; `type ConflictBooking` (overnight-actions / availability-actions); `type SetOvernightNightsResult` (overnight-actions).
- `inquiries/index.ts`: `submitInquiryCore` (inquiry-actions).
- `gallery/index.ts`, `reviews/index.ts`: export the symbols `src/app/**` imports from them (find with `grep -rn "features/gallery\|features/reviews" src/app`).

- [ ] **Step 3: Configure `eslint.config.mjs`**

Replace the file with the boundary-aware config:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "components", pattern: "src/components/**" },
        {
          type: "feature",
          pattern: "src/features/*",
          mode: "folder",
          capture: ["family"],
        },
      ],
      // Co-located tests may reach internals; they ship with their feature.
      "boundaries/ignore": ["**/*.test.ts", "**/*.test.tsx"],
    },
    rules: {
      // Cross-feature imports must enter through the feature's index.ts.
      "boundaries/entry-point": [
        2,
        {
          default: "disallow",
          rules: [
            { target: ["feature"], allow: "index.ts" },
            { target: ["lib", "components", "app"], allow: "**" },
          ],
        },
      ],
      // Allow all element-type pairings (cycles permitted per ADR-0001);
      // entry-point above is the real gate.
      "boundaries/element-types": [2, { default: "allow" }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

- [ ] **Step 4: Verify boundary resolution works**

Run: `npm run lint` → it should now flag cross-feature imports that hit internal files (e.g. `admin/availability-actions.ts` importing `@/features/booking/booking-service`).
Expected: lint reports `boundaries/entry-point` errors. If instead it reports the `@/` alias as unresolvable, the TS resolver isn't picking up `tsconfig` paths — confirm `tsconfig.json` has `paths: { "@/*": ["./src/*"] }` and that `eslint-import-resolver-typescript` is installed; re-run.

- [ ] **Step 5: Rewrite cross-feature imports through indexes (iterate to green)**

For each `boundaries/entry-point` error, change the offending import from the deep path to the feature index, adding the symbol to that feature's `index.ts` if missing. Examples:

- `admin/availability-actions.ts`: `import { cancelBookingCore } from "@/features/booking/booking-service"` → `from "@/features/booking"`.
- `notifications/completion-cron.ts`: `import { transition } from "@/features/booking/state-machine"` → `from "@/features/booking"`.
- `accounts/_components/meet-greet-scheduler.tsx`: collapse its many `@/features/booking/*` imports to `@/features/booking`.
- `booking/scheduler-context.tsx`: `@/features/admin/availability-actions` + `@/features/admin/overnight-actions` → `@/features/admin`.

Repeat `npm run lint` → fix next error → until green. Every newly-needed symbol gets added to the exporting feature's `index.ts`.

- [ ] **Step 6: Verify gates**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS (zero boundary errors)
Run: `npm run test` → Expected: PASS (full suite; run in execution session with local stack up)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: add per-feature public APIs and enforce boundaries with eslint"
```

---

## Task 4: Split booking-service.ts into per-concern cores (A1)

`booking-service.ts` (1,513 lines) is already organized into contiguous concern sections. Extract each into its own file; leave `booking-service.ts` as a thin re-export barrel so existing intra-feature importers (and `booking/index.ts`) are untouched. Pure relocation of existing code — no logic edits.

**Files:**

- Create: `src/features/booking/booking-service-shared.ts` (shared `BookingServiceDeps`, input schemas, shared types)
- Create: `src/features/booking/quote-core.ts` (`computeBookingQuoteCore`, `BookingQuotePreview`, `PreviewResult`)
- Create: `src/features/booking/create-core.ts` (`createBookingCore`, `CreateBookingResult`, `CreateBookingInput`)
- Create: `src/features/booking/reschedule-core.ts` (`rescheduleBookingCore`, `RescheduleBookingResult`, `RescheduleBookingInput`)
- Create: `src/features/booking/cancel-core.ts` (`cancelBookingCore`, `CancelDeps`, `CancelBookingResult`, `CancelBookingInput`)
- Create: `src/features/booking/admin-actions-core.ts` (`grantFullRefundCore`, `markNoShowCore`, `settleDebtCore`, `AdminBookingResult`)
- Create: `src/features/booking/edit-core.ts` (`editBookingCore`, `buildEditQuoteInput`, `previewEditCore`, `EditBookingPatch`, `EditBookingInput`, `EditQuoteInput`, `EDITABLE_STATUSES`, `EditBookingResult`, `PreviewEditResult`)
- Modify: `src/features/booking/booking-service.ts` → re-export barrel
- Test: existing `booking-service.test.ts`, `reschedule-booking.test.ts`, `cancellation.test.ts`, `edit-booking.test.ts`, `edit-booking.integration.test.ts` (unchanged — they import from `booking-service`, which still re-exports everything)

- [ ] **Step 1: Extract shared deps + schemas**

Move the shared declarations (`BookingServiceDeps`, the zod input schemas `createBookingInputSchema`/`cancelBookingInputSchema`, and any helper used by ≥2 cores) into `booking-service-shared.ts`. Export them. The cores import from `./booking-service-shared`.

- [ ] **Step 2: Extract each core file**

For each core file above, move the corresponding section (functions + types listed) verbatim from `booking-service.ts`. Update intra-file imports to pull shared items from `./booking-service-shared` and pricing/payments from their indexes (`@/features/pricing`, `@/features/payments`). Do one core, run `npm run typecheck`, then the next — keeps errors localized.

- [ ] **Step 3: Convert `booking-service.ts` to a barrel**

After all sections are moved, `booking-service.ts` becomes:

```ts
// Re-export barrel. Per-concern cores live in *-core.ts (see ADR/CONTEXT).
export * from "./booking-service-shared";
export * from "./quote-core";
export * from "./create-core";
export * from "./reschedule-core";
export * from "./cancel-core";
export * from "./admin-actions-core";
export * from "./edit-core";
```

This preserves every existing `from "@/features/booking/booking-service"` and `from "./booking-service"` import unchanged.

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run test -- src/features/booking/booking-service.test.ts src/features/booking/reschedule-booking.test.ts src/features/booking/cancellation.test.ts src/features/booking/edit-booking.test.ts` → Expected: PASS (identical assertions, now against split files)
Run: `npm run lint` → Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: split booking-service into per-concern cores"
```

---

## Task 5: Extract shared scheduler cell primitive (A7)

`week-grid.tsx` (821), `month-grid.tsx` (787), `day-timeline.tsx` (651) duplicate cell render + selection-interaction logic. Extract a shared cell primitive + selection hook each grid composes. **Output must be pixel-identical** — verified by manual visual check, since there is no snapshot suite.

**Files:**

- Create: `src/features/booking/_components/scheduler/grid-cell.tsx` (presentational cell primitive)
- Create: `src/features/booking/_components/scheduler/use-cell-selection.ts` (shared pointer/selection interaction hook)
- Modify: `week-grid.tsx`, `month-grid.tsx`, `day-timeline.tsx` to compose the primitive + hook
- Test: existing `grid-runs.test.ts`, `schedule-selection.test.ts`, `calendar-model.test.ts` guard the underlying models

- [ ] **Step 1: Identify the duplicated cell render + interaction**

Read the three grid files. Locate the common cell markup (the per-slot cell with run-edge classes from `grid-runs`) and the common pointer-down/enter/up selection handlers (driving `schedule-selection`). These are the extraction targets.

- [ ] **Step 2: Write the primitive + hook (no behavior change)**

`grid-cell.tsx` renders one cell given props (state class, run-edge flags, children, handlers). `use-cell-selection.ts` encapsulates the pointer interaction returning the handlers the grids currently inline. Copy the existing logic verbatim into these units — same class strings, same handler bodies.

- [ ] **Step 3: Compose in each grid, deleting the inlined duplicate**

Replace the inlined cell markup/handlers in each grid with the primitive + hook. Do one grid, typecheck, visually compare, then the next.

- [ ] **Step 4: Verify gates + visual parity**

Run: `npm run typecheck` → Expected: PASS
Run: `npm run test -- src/features/booking/grid-runs.test.ts src/features/booking/schedule-selection.test.ts src/features/booking/calendar-model.test.ts` → Expected: PASS
Run: `npm run lint` → Expected: PASS
Manual: in the execution session, run the app (`npm run dev`, port 3001 if 3000 busy), open `/book/walk`, exercise week/month/day views with the `busy-week` seed — selection drag, run edges, busy blocks must look and behave identically. (Invoke `frontend-design` skill before touching the markup, per repo UI rule — confirms no visual regression.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract shared scheduler cell primitive and selection hook"
```

---

## Task 6: Extract client god-component state (A5)

`service-booking-client.tsx` (765), `edit-booking-client.tsx` (740), `admin-create-booking-client.tsx` (628) mix state machines + side effects + layout. Extract state into hooks/reducers, leaving thin presentational components. Behavior-preserving; guarded by the existing integration tests.

**Files:**

- Create: `src/features/booking/_components/use-service-booking.ts` (state/reducer + effects for service-booking-client)
- Create: `src/features/booking/_components/use-edit-booking.ts`
- Create: `src/features/admin/_components/use-admin-create-booking.ts`
- Modify: the three `*-client.tsx` to consume their hook
- Test: `edit-booking.integration.test.ts`, `admin-create-booking.integration.test.ts` (existing — guard the flows)

- [ ] **Step 1: Map each component's state + effects**

For one component at a time, identify: the `useState`/`useReducer` state, the derived values, the effect side effects, and the event handlers. These move to the hook; JSX stays in the component.

- [ ] **Step 2: Extract the hook (verbatim logic)**

Create the `use-*.ts` hook returning `{ state, handlers, derived }` the component needs. Move the logic unchanged. The component calls the hook and renders — no logic in the component beyond wiring props to JSX.

- [ ] **Step 3: Verify gates per component**

After each component:
Run: `npm run typecheck` → Expected: PASS
Run: `npm run lint` → Expected: PASS
Run (after edit + admin-create extractions, execution session, stack up): `npm run test -- src/features/booking/edit-booking.integration.test.ts src/features/booking/admin-create-booking.integration.test.ts` → Expected: PASS

- [ ] **Step 4: Manual parity check**

Execution session: walk the book-a-walk flow, edit-booking flow, and admin create-on-behalf flow on `admin-demo` seed — identical behavior. (Invoke `frontend-design` before altering the component shells.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract booking client component state into hooks"
```

---

## Task 7: Server-action mutation layer (A6)

~20 server actions interleave auth + repo construction + logic + `revalidatePath` + result mapping. Establish the pattern with one worked conversion, then apply it across the actions. Each conversion keeps the action's external contract identical.

**Files (representative; repeat the pattern for each action file):**

- Create: `src/features/booking/mutations/` — one testable mutation per action (e.g. `create-booking.mutation.ts`)
- Create: `src/features/booking/revalidation.ts` — centralized path/tag invalidation map
- Modify: `src/features/booking/actions.ts` (and `admin/*-actions.ts`, `accounts/*-action*.ts`, `inquiries/inquiry-actions.ts`) — actions become thin adapters
- Test: `src/features/booking/mutations/create-booking.mutation.test.ts` (new — proves the extracted mutation is unit-testable without the action runtime)

- [ ] **Step 1: Define the pattern + centralized revalidation**

Create `revalidation.ts`:

```ts
import { revalidatePath } from "next/cache";

// Single source of truth for what each mutation invalidates.
export const revalidate = {
  booking: () => {
    revalidatePath("/account/bookings");
    revalidatePath("/admin/bookings");
  },
  // add one entry per mutation concern as actions are converted
} as const;
```

- [ ] **Step 2: Write the failing test for the extracted mutation (TDD for the new seam)**

```ts
// src/features/booking/mutations/create-booking.mutation.test.ts
import { describe, it, expect } from "vitest";
import { createBookingMutation } from "./create-booking.mutation";

describe("createBookingMutation", () => {
  it("delegates to the core and returns its result without touching Next runtime", async () => {
    const fakeDeps = {
      /* injected repo/gateway/clock/user stubs mirroring BookingServiceDeps */
    };
    const result = await createBookingMutation(fakeDeps /* valid input */);
    expect(result.ok).toBe(true);
  });
});
```

Run: `npm run test -- src/features/booking/mutations/create-booking.mutation.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Extract `createBookingMutation`**

Move the auth-independent logic out of `createBooking` in `actions.ts` into `mutations/create-booking.mutation.ts`: it takes injected deps + parsed input, calls `createBookingCore`, returns the domain result. No `revalidatePath`, no `auth()` inside. Fill the test's `fakeDeps`/input with concrete stubs so it compiles and passes.

Run: `npm run test -- src/features/booking/mutations/create-booking.mutation.test.ts` → Expected: PASS.

- [ ] **Step 4: Make the action a thin adapter**

`createBooking` in `actions.ts` now: authenticate (current user) → construct real deps (repo/gateway) → parse input → `await createBookingMutation(deps, input)` → `revalidate.booking()` → map to the action's result union. External signature/return unchanged.

Run: `npm run typecheck` → PASS. Run: `npm run test -- src/features/booking/booking-service.test.ts` → PASS.

- [ ] **Step 5: Apply the pattern to the remaining actions**

Repeat Steps 3–4 for the other actions (`rescheduleBooking`, `cancelBooking`, `editBooking`, `createBookingForClient`, `grantFullRefund`, `markNoShow`, `settleDebt`, and the admin/accounts/inquiries actions). Each: extract a testable mutation, thin the action, centralize its revalidation entry. Convert + verify one at a time. (Scope note: if an action's revalidation/auth is trivial and extraction adds no testability, leave it and note why — YAGNI; don't churn for uniformity.)

- [ ] **Step 6: Append ADR-0002**

Create `docs/adr/0002-action-mutation-split.md` (Context: actions mixed concerns / A6; Decision: action = adapter, mutation = injected-deps testable function, revalidation centralized; Consequences: mutations unit-testable, revalidation auditable).

- [ ] **Step 7: Verify gates + commit**

Run: `npm run typecheck` + `npm run lint` + `npm run test` (execution session) → Expected: PASS.

```bash
git add -A
git commit -m "refactor: extract testable mutation layer from server actions"
```

---

## Task 8: Notifier seam (A11)

Extract inline email sends behind a `Notifier` interface; default impl is a thin pass-through to the existing Resend senders (zero behavior change). Document the deferred outbox as an ADR.

**Files:**

- Create: `src/features/notifications/notifier.ts` (the `Notifier` interface + event types)
- Create: `src/features/notifications/resend-notifier.ts` (default impl delegating to existing `send-booking-emails` / `resend-mailer`)
- Create: `src/features/notifications/notifier.test.ts`
- Modify: `src/features/notifications/index.ts` (export `Notifier`, `ResendNotifier`)
- Modify: call sites that send email inline — `booking/actions.ts` (or its new mutations), `admin/approval-actions.ts`, `notifications/completion-cron.ts` — to call the notifier
- Create: `docs/adr/0003-notifier-seam.md`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/notifications/notifier.test.ts
import { describe, it, expect, vi } from "vitest";
import { ResendNotifier } from "./resend-notifier";

describe("ResendNotifier", () => {
  it("routes a booking-confirmation event to the booking-confirmation sender", async () => {
    const send = vi.fn();
    const notifier = new ResendNotifier({ sendBookingConfirmation: send });
    await notifier.notify({ type: "booking_confirmed", booking: /* minimal fixture */ });
    expect(send).toHaveBeenCalledOnce();
  });
});
```

Run: `npm run test -- src/features/notifications/notifier.test.ts` → Expected: FAIL.

- [ ] **Step 2: Define the interface**

```ts
// src/features/notifications/notifier.ts
export type NotificationEvent =
  | { type: "booking_confirmed"; booking: BookingConfirmedPayload }
  | { type: "booking_cancelled"; booking: BookingCancelledPayload };
// payload types mirror the args the existing send-booking-emails functions take.

export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
```

- [ ] **Step 3: Implement `ResendNotifier`**

Delegates each event type to the existing sender (`sendBookingConfirmation` etc.) — same calls currently made inline. Accept the senders via constructor injection (so the test can stub them).

Run: `npm run test -- src/features/notifications/notifier.test.ts` → Expected: PASS.

- [ ] **Step 4: Replace inline sends with the notifier**

At each inline send site, construct/inject a `ResendNotifier` and call `notifier.notify({ type, ... })` instead of calling the sender directly. Behavior identical (same email, same data).

- [ ] **Step 5: Append ADR-0003**

`docs/adr/0003-notifier-seam.md`: Context (inline email sends, no seam for future notification system / A11); Decision (`Notifier` interface, `ResendNotifier` default pass-through, **outbox table deferred** — document its intended shape: `notification_outbox` row written in the same tx as the mutation, drained by a worker, enabling retries; not built in SP3a); Consequences (single injection point; full system is a post-program project).

- [ ] **Step 6: Verify gates + commit**

Run: `npm run typecheck` + `npm run lint` + `npm run test -- src/features/notifications/notifier.test.ts` → PASS. Full suite in execution session.

```bash
git add -A
git commit -m "refactor: introduce notifier seam over inline email sends"
```

---

## Task 9: Type-suppression cleanup (A9)

Five suppressions. Three are `no-unused-vars` (fixable). Two are `no-img-element` already justified inline — confirm and leave.

**Files:**

- Modify: `src/features/pricing/geocoding/zip-centroid-geocoder.ts:28`
- Modify: `src/features/pricing/config-schemas.test.ts:51,91,121`
- Modify: `src/features/booking/_components/scheduler/month-grid.tsx:180`
- Confirm (no change): `src/features/accounts/_components/photo-crop-field.tsx:183,232`, `src/features/booking/_components/pet-avatar.tsx:34`

- [ ] **Step 1: Fix the `no-unused-vars` suppressions**

For each of `zip-centroid-geocoder.ts:28`, `config-schemas.test.ts` (3 sites), `month-grid.tsx:180`: read the suppressed line. Either remove the genuinely-unused variable, or if it's an intentionally-ignored destructure/param, prefix with `_` (which `@typescript-eslint/no-unused-vars` ignores by default) and delete the `eslint-disable` comment.

- [ ] **Step 2: Confirm the two `no-img-element` suppressions are documented**

`photo-crop-field.tsx` (object-URL crop source) and `pet-avatar.tsx` (signed dynamic URLs) already carry justification comments explaining why `next/image` doesn't fit. Leave as-is; no change needed (they document a real library limitation per A9's "fix or document").

- [ ] **Step 3: Verify gates + commit**

Run: `npm run lint` → Expected: PASS (three fewer disables).
Run: `npm run typecheck` → Expected: PASS.
Run: `npm run test -- src/features/pricing/config-schemas.test.ts` → Expected: PASS.

```bash
git add -A
git commit -m "refactor: resolve unused-var lint suppressions"
```

---

## Task 10: Definition-of-done wrap

Prune resolved findings, finalize docs, run full verification, request review.

**Files:**

- Modify: `docs/superpowers/specs/2026-06-10-audit-findings.md` (remove A1, A3, A4, A5, A6, A7, A8, A9, A10, A11 from §SP3; note A2, A12 remain → SP3b)
- Modify: `docs/superpowers/HANDOFF.md` (Progress row SP3 → split state; Session log line)
- Modify: `CONTEXT.md` / `AGENTS.md` if any final reality drifted

- [ ] **Step 1: Full verification (execution session, local stack up)**

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS (boundary gate green)
Run: `npm run test` → PASS (full suite incl. integration)
Manual `verify`: walk key client + admin flows on `admin-demo` + `busy-week` seeds — no behavior/visual change vs pre-SP3a.

- [ ] **Step 2: Prune the findings register**

Remove the A1/A3/A4/A5/A6/A7/A8/A9/A10/A11 rows from the §SP3 table; add a one-line note that A2 (confirm-dialog) + A12 (onboarding IA/nav) carry forward to SP3b. Update the register's `_Last reviewed_` footer.

- [ ] **Step 3: Update HANDOFF.md**

Progress table: mark SP3a DONE, SP3b as next. Append a Session log line: `2026-06-10 · SP3a · executed (subagent-driven): cross-feature moves, enforced feature boundaries, booking-service split, scheduler primitive, client-state hooks, mutation layer, notifier seam, suppression cleanup, CONTEXT+ADRs; behavior-preserving, all gates green.`

- [ ] **Step 4: Request fresh-session code review**

Per repo policy (author never grades itself), arrange `/code-review` from a fresh session over the SP3a diff. Resolve any criticals in this plan's `## Handoff log` before declaring SP3a done.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: close out sp3a foundations and prune resolved findings"
```

---

## Handoff log

(Append blocking criticals here during execution; resolve before SP3a DoD.)

- **2026-06-10 · BLOCKING (Task 3 regression) · feature barrels poison the client bundle; `next build` fails.** After Task 3, `npm run build` fails with 6 Turbopack errors: `You're importing a module that depends on "server-only" ... cannot be imported from a Client Component`. Pre-existing? No — the feature `index.ts` barrels only exist as of Task 3, so the offending chains could not exist before. typecheck + lint + per-task vitest are all green; only `next build` catches it.
  - **Root cause.** Task 3 collapsed client components' deep cross-feature imports to the feature barrel (`@/features/<x>`). Those barrels re-export BOTH client-safe symbols (components/hooks/types) AND `server-only` modules. `import "server-only"` is a side-effect import that defeats tree-shaking, so any client component importing the barrel (for a client-safe symbol) drags the server-only module into the browser bundle.
  - **Poisoned chains (all 6 errors reduce to these):**
    - `account/bookings/_components/prepay-button.tsx` → `@/features/payments` → `stripe-gateway.ts` (`server-only`; also pulls `@/lib/supabase/service.ts`).
    - `accounts/_components/meet-greet-scheduler.tsx` → `@/features/booking` → `booking-form-data.ts` (`server-only`).
    - `booking/_components/pet-assignment.tsx` → `@/features/accounts` → (re-exports meet-greet-scheduler) → `@/features/booking` → `booking-form-data.ts`.
  - **Why a single barrel can't fix it both ways.** Removing the server-only modules from the index unblocks clients but breaks SERVER cross-feature consumers (e.g. `admin/clients-actions.ts` needs `StripeGateway` from payments; `api/cron/series-roll` needs booking server modules) — they'd have to deep-import, which the boundary rule forbids. So client and server need _different_ surfaces. This contradicts ADR-0001's single-`index.ts` decision.
  - **Recommended fix (option A).** Give each mixed feature a second declared entry point: keep `index.ts` as the full/server surface; add a client-safe entry (`index.client.ts`) exporting only client-safe symbols; repoint the ~3 client components at it; add the client entry to the `boundaries/entry-point` allow-list; amend ADR-0001 to record two entry points (server `index.ts` + client `index.client.ts`). Standard Next.js feature-folder pattern; behavior-preserving; keeps the boundary gate. Alternatives: (B) relax the boundary rule so client components may deep-import specific client-safe modules (weakens the seam); (C) move server-only modules behind a `server/` subpath excluded from the index (bigger churn). **Awaiting maintainer decision before implementing — it amends ADR-0001.** Tasks 6–10 paused; Tasks 1–5 are committed and individually green.

- **2026-06-10 · Minor (pre-existing, non-blocking) · full-suite test baseline.** `npm run test` (full suite, shared local Supabase DB) reports 7 failing tests across 3 files: `booking/booking-service.test.ts`, `booking/admin-create-booking.integration.test.ts`, `admin/admin.test.ts`. These are **pre-existing**, not SP3a regressions — proven three ways: (1) Task 3 implementer reproduced identical failures by stashing all SP3a changes; (2) on a fresh DB (`npx supabase db reset`) each file passes in isolation **except** `admin/admin.test.ts`, which has 2 failures even in isolation — a stale inquiry fixture (`submitInquiryCore` expects `{ok:true}` but schema now returns `"Phone is required"`) and a flaky `updateServiceCore` `beforeAll` `listServices` call right after reset; (3) `git diff 01c12d4..HEAD` for `admin.test.ts` and `inquiries/inquiry-actions.ts` shows **import-line changes only, zero logic**. Root cause: integration tests are not DB-isolated and accumulate state across a full-suite run (exclusion constraint `no_same_class_overlap`, inquiry rate-limit), plus a stale inquiry-schema fixture predating SP3a. **Gating consequence:** per the plan standing rule + `[handoff-gate-scoping]`, per-task NAMED test files (run on a fresh DB) are the real gate; the blanket `npm run test` is unreliable as a pass/fail gate here. Task 10's "full suite PASS" should be read as "no NEW failures vs this baseline." Fixing test isolation + the inquiry fixture is out of SP3a scope (behavior-preserving) — flag for a later test-hardening SP.

---

_Last reviewed: 2026-06-10_
