# Client Self-Service Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in client edit/reschedule their own unpaid, upcoming booking in place from `/account/bookings`, with a live re-quote and clear locked states — reusing the P1 mutation spine, no new booking rules.

**Architecture:** A dedicated route `/account/bookings/[id]/edit` renders a focused `EditBookingClient` orchestrator that reuses the booking-flow leaf components (`<Scheduler>`, `PetAssignment`, `QuantityForm`, `QuotePanel`) seeded from the existing booking. A read-only `previewEdit` action mirrors `editBookingCore`'s merge+re-quote (shared via an extracted `buildEditQuoteInput`) so the live preview equals what Save commits. A pure `clientCanEditBooking` predicate gates both the route and the bookings-table affordance.

**Tech Stack:** Next.js App Router (server + client components), TypeScript strict, Supabase (service-role reads), Vitest (pure unit tests), Tailwind + the Trail design tokens.

**Spec:** [`docs/superpowers/specs/2026-06-10-client-self-service-edit-design.md`](../specs/2026-06-10-client-self-service-edit-design.md)

**Repo rules:** work on `main`, no worktree; commit messages subject-line only (Conventional Commits, no body/trailer/internal identifiers); design tokens only (no hardcoded color); TS strict, no `any`. Gate each task on its **own** unit-test file (`npx vitest run <file>`), never a full `vitest run` (booking integration tests need a local Supabase reset).

---

## File Structure

**Create:**

- `src/features/booking/quantity-state-from-quote-inputs.ts` — pure inverse of `quantitiesToRecord`.
- `src/features/booking/quantity-state-from-quote-inputs.test.ts`
- `src/features/booking/client-can-edit.ts` — pure editability predicate.
- `src/features/booking/client-can-edit.test.ts`
- `src/features/booking/preview-edit.ts` — `previewEdit` server action.
- `src/app/(account)/account/bookings/[id]/edit/page.tsx` — edit route (server).
- `src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx` — orchestrator.
- `src/app/(account)/account/bookings/_components/edit-cell.tsx` — table Edit/locked cell (client island).

**Move (Task 3):** `pet-assignment.tsx`, `quantity-forms.tsx`, `quote-panel.tsx` from `src/app/(marketing)/book/[serviceSlug]/_components/` → `src/features/booking/_components/`.

**Modify:**

- `src/features/booking/booking-service.ts` — extract `buildEditQuoteInput`; add `previewEditCore` + `PreviewEditResult`.
- `src/features/booking/booking-service.test.ts` — `previewEditCore` tests.
- `src/features/booking/_components/quote-panel.tsx` (after move) — optional delta props.
- `src/app/(account)/account/bookings/page.tsx` — render the Edit cell on upcoming rows.
- `src/app/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx` + `…/book/[serviceSlug]/page.tsx` — update import paths after the move.
- `docs/DESIGN.md` — note the component relocation + the client-edit route/state-machine touchpoint.

---

## Task 1: `quantityStateFromQuoteInputs` (pure inverse of `quantitiesToRecord`)

Seeds the edit form's quantity inputs from a stored `quote_inputs` jsonb. Inverse of `quantitiesToRecord` in `quantity-forms.tsx` (house-sitting → add-ons; hours-based → `{ hours }`; meet-greet → `{}`).

**Files:**

- Create: `src/features/booking/quantity-state-from-quote-inputs.ts`
- Test: `src/features/booking/quantity-state-from-quote-inputs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { quantityStateFromQuoteInputs } from "./quantity-state-from-quote-inputs";
import { quantitiesToRecord } from "@/features/booking/_components/quantity-forms";

describe("quantityStateFromQuoteInputs", () => {
  it("round-trips house_sitting add-ons (nights ignored, derived from range)", () => {
    const state = {
      type: "house_sitting" as const,
      qty: { cantBeLeftAloneDays: 2, walkMinutesPerDay: 30, holidayDays: 1 },
    };
    const record = quantitiesToRecord(state, 4);
    expect(quantityStateFromQuoteInputs("house_sitting", record)).toEqual(
      state,
    );
  });

  it("defaults missing house_sitting add-ons to 0", () => {
    expect(
      quantityStateFromQuoteInputs("house_sitting", { nights: 3 }),
    ).toEqual({
      type: "house_sitting",
      qty: { cantBeLeftAloneDays: 0, walkMinutesPerDay: 0, holidayDays: 0 },
    });
  });

  it("round-trips hours-based services", () => {
    for (const type of ["walk", "check_in", "training"] as const) {
      const state = { type, qty: { hours: 2 } };
      const record = quantitiesToRecord(state, null);
      expect(quantityStateFromQuoteInputs(type, record)).toEqual(state);
    }
  });

  it("defaults hours to 1 when absent", () => {
    expect(quantityStateFromQuoteInputs("walk", {})).toEqual({
      type: "walk",
      qty: { hours: 1 },
    });
  });

  it("maps meet_greet to the empty quantity state", () => {
    expect(quantityStateFromQuoteInputs("meet_greet", {})).toEqual({
      type: "meet_greet",
      qty: {},
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: FAIL — `quantityStateFromQuoteInputs` is not defined. (The import path `@/features/booking/_components/quantity-forms` assumes Task 3's move has run; if running Task 1 first, import from `@/app/(marketing)/book/[serviceSlug]/_components/quantity-forms` and update after Task 3.)

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure inverse of `quantitiesToRecord` — rebuilds a `QuantityState` from a
 * stored `quote_inputs` jsonb so the edit form can seed its inputs. `nights`
 * (house-sitting) is intentionally ignored here: it is re-derived from the
 * selected date range, exactly as the create flow does.
 */
import type { PricingType } from "@/features/pricing/types";
import type { QuantityState } from "@/features/booking/_components/quantity-forms";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function quantityStateFromQuoteInputs(
  pricingType: PricingType,
  quoteInputs: unknown,
): QuantityState {
  const q = (quoteInputs ?? {}) as Record<string, unknown>;
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: {
          cantBeLeftAloneDays: num(q.cantBeLeftAloneDays, 0),
          walkMinutesPerDay: num(q.walkMinutesPerDay, 0),
          holidayDays: num(q.holidayDays, 0),
        },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: num(q.hours, 1) } };
    case "walk":
      return { type: "walk", qty: { hours: num(q.hours, 1) } };
    case "training":
      return { type: "training", qty: { hours: num(q.hours, 1) } };
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/quantity-state-from-quote-inputs.ts src/features/booking/quantity-state-from-quote-inputs.test.ts
git commit -m "feat: derive quantity state from stored quote inputs"
```

---

## Task 2: `clientCanEditBooking` predicate (pure, tested)

One pure function gating both the route and the table. Editable iff: upcoming + status ∈ {pending_approval, confirmed} + `paidCents === 0` + outside the cancellation cutoff + service ≠ meet-greet. Each blocked case returns a `reason` that maps to inline copy.

**Files:**

- Create: `src/features/booking/client-can-edit.ts`
- Test: `src/features/booking/client-can-edit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { clientCanEditBooking, type EditabilityInput } from "./client-can-edit";

const HOURS = 48;
const base = (over: Partial<EditabilityInput> = {}): EditabilityInput => ({
  status: "confirmed",
  startsAt: new Date("2026-07-01T17:00:00Z"),
  paidCents: 0,
  serviceSlug: "dog-walk",
  ...over,
});
const now = new Date("2026-06-20T12:00:00Z"); // well before cutoff

describe("clientCanEditBooking", () => {
  it("allows an upcoming, unpaid, confirmed, non-meet-greet booking", () => {
    expect(clientCanEditBooking(base(), now, HOURS)).toEqual({
      editable: true,
    });
  });

  it("allows pending_approval", () => {
    expect(
      clientCanEditBooking(base({ status: "pending_approval" }), now, HOURS),
    ).toEqual({ editable: true });
  });

  it("blocks meet-greet with reason meet_greet (highest precedence)", () => {
    expect(
      clientCanEditBooking(
        base({ serviceSlug: "meet-greet", paidCents: 100 }),
        now,
        HOURS,
      ),
    ).toEqual({ editable: false, reason: "meet_greet" });
  });

  it("blocks terminal/non-editable statuses with reason status", () => {
    for (const status of [
      "completed",
      "cancelled",
      "declined",
      "no_show",
    ] as const) {
      expect(clientCanEditBooking(base({ status }), now, HOURS)).toEqual({
        editable: false,
        reason: "status",
      });
    }
  });

  it("blocks a paid booking with reason paid", () => {
    expect(clientCanEditBooking(base({ paidCents: 4500 }), now, HOURS)).toEqual(
      {
        editable: false,
        reason: "paid",
      },
    );
  });

  it("blocks inside the cancellation cutoff with reason cutoff", () => {
    const insideCutoff = new Date("2026-06-30T00:00:00Z"); // < 48h before 07-01 17:00Z
    expect(clientCanEditBooking(base(), insideCutoff, HOURS)).toEqual({
      editable: false,
      reason: "cutoff",
    });
  });

  it("treats a past booking as cutoff (now far past start)", () => {
    const after = new Date("2026-07-02T00:00:00Z");
    expect(clientCanEditBooking(base(), after, HOURS)).toEqual({
      editable: false,
      reason: "cutoff",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/client-can-edit.test.ts`
Expected: FAIL — `clientCanEditBooking` not defined.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure client-editability predicate for a booking. Used by BOTH the edit route
 * guard and the bookings-table affordance so they never diverge. Precedence is
 * deliberate: meet-greet → status → paid → cutoff. The cutoff branch also
 * naturally covers past bookings (now is far beyond start − cutoff window).
 */
import type { BookingStatusDb } from "@/features/booking/booking-repository";

export const MEET_GREET_SLUG = "meet-greet";

export interface EditabilityInput {
  status: BookingStatusDb;
  startsAt: Date;
  paidCents: number;
  serviceSlug: string;
}

export type EditabilityReason = "meet_greet" | "status" | "paid" | "cutoff";

export type Editability =
  | { editable: true }
  | { editable: false; reason: EditabilityReason };

const EDITABLE_STATUSES: BookingStatusDb[] = ["pending_approval", "confirmed"];

export function clientCanEditBooking(
  booking: EditabilityInput,
  now: Date,
  cancellationFullRefundHours: number,
): Editability {
  if (booking.serviceSlug === MEET_GREET_SLUG) {
    return { editable: false, reason: "meet_greet" };
  }
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { editable: false, reason: "status" };
  }
  if (booking.paidCents > 0) {
    return { editable: false, reason: "paid" };
  }
  const cutoffMs =
    booking.startsAt.getTime() - cancellationFullRefundHours * 60 * 60 * 1000;
  if (now.getTime() > cutoffMs) {
    return { editable: false, reason: "cutoff" };
  }
  return { editable: true };
}

/** Inline copy for a locked row / route redirect reason. */
export function editLockCopy(reason: EditabilityReason): string {
  switch (reason) {
    case "meet_greet":
      return "Reschedule your meet & greet from onboarding.";
    case "status":
      return "This booking can no longer be changed.";
    case "paid":
      return "Paid — contact Cal to make changes.";
    case "cutoff":
      return "Inside 48h — contact Cal.";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/client-can-edit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/client-can-edit.ts src/features/booking/client-can-edit.test.ts
git commit -m "feat: add client booking editability predicate"
```

---

## Task 3: Relocate shared leaf components into `features/booking`

Move the three reusable booking-form leaf components out of the marketing route so both create and edit consume one copy. Pure move — no behavior change.

**Files:**

- Move: `src/app/(marketing)/book/[serviceSlug]/_components/{pet-assignment,quantity-forms,quote-panel}.tsx` → `src/features/booking/_components/`
- Modify import sites + `docs/DESIGN.md`

- [ ] **Step 1: Move the files (preserve git history)**

```bash
git mv "src/app/(marketing)/book/[serviceSlug]/_components/pet-assignment.tsx" src/features/booking/_components/pet-assignment.tsx
git mv "src/app/(marketing)/book/[serviceSlug]/_components/quantity-forms.tsx" src/features/booking/_components/quantity-forms.tsx
git mv "src/app/(marketing)/book/[serviceSlug]/_components/quote-panel.tsx" src/features/booking/_components/quote-panel.tsx
```

- [ ] **Step 2: Find every import site**

Run: `npx grep` is unavailable; use ripgrep:

```bash
rg -n "_components/(pet-assignment|quantity-forms|quote-panel)|\"\./(pet-assignment|quantity-forms|quote-panel)\"" src
```

Expected hits include `service-booking-client.tsx` (`./pet-assignment`, `./quantity-forms`, `./quote-panel`) and `book/[serviceSlug]/page.tsx` (`./_components/pet-assignment` for the `AssignablePet` type). Update each to `@/features/booking/_components/<name>`. Also update Task 1's test import if it referenced the old path.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no unresolved imports.

- [ ] **Step 4: Run the moved components' nearest tests + Task 1 test**

Run: `npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts`
Expected: PASS (confirms the moved `quantitiesToRecord` import resolves).

- [ ] **Step 5: Update DESIGN.md (same-commit doc rule)**

In `docs/DESIGN.md`, update the booking layout note to say the shared booking-form leaf components (`PetAssignment`, `QuantityForm`, `QuotePanel`) live in `src/features/booking/_components/` and are consumed by both the book flow and the account edit route. (Keep it to one or two lines — no path dumps.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: share booking form leaf components from features/booking"
```

---

## Task 4: Extract `buildEditQuoteInput` + add `previewEditCore`

DRY the merge so preview and commit can never drift, then add a read-only core that returns the would-be quote + status without persisting.

**Files:**

- Modify: `src/features/booking/booking-service.ts`
- Test: `src/features/booking/booking-service.test.ts`

- [ ] **Step 1: Extract `buildEditQuoteInput`**

In `booking-service.ts`, lift the inline merge currently inside `editBookingCore` (the block building `mergedInput` from `booking` + `patch`, around the `const startsAt = patch.startsAt ?? booking.startsAt` lines) into an exported pure function, and have `editBookingCore` call it:

```ts
/** Merge an edit patch over a booking's current shape into a re-quote input. */
export function buildEditQuoteInput(
  booking: BookingEditRow,
  patch: EditBookingPatch,
): CreateBookingInput {
  const startsAt = patch.startsAt ?? booking.startsAt;
  const durationMs = booking.endsAt.getTime() - booking.startsAt.getTime();
  const endsAt = patch.endsAt ?? new Date(startsAt.getTime() + durationMs);
  return {
    userId: booking.client_id,
    serviceSlug: booking.service_slug,
    startsAt,
    endsAt,
    quantities: {
      ...quantitiesFromQuoteInputs(booking.quote_inputs),
      ...(patch.quantities ?? {}),
    },
    petIds: patch.petIds ?? booking.petIds,
    recurringRule: null,
  };
}
```

Replace the inline construction in `editBookingCore` with `const mergedInput = buildEditQuoteInput(booking, patch);` (keep `startsAt`/`endsAt` locals if later steps in the core reference them — re-derive from `mergedInput.startsAt`/`.endsAt` to avoid duplication).

- [ ] **Step 2: Verify existing edit-core tests still pass**

Run: `npx vitest run src/features/booking/edit-booking.test.ts`
Expected: PASS (unchanged behavior — this is a pure refactor).

- [ ] **Step 3: Add `PreviewEditResult` + `previewEditCore`**

```ts
export type PreviewEditResult =
  | { kind: "preview"; preview: BookingQuotePreview; requiresApproval: boolean }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_status" }
  | { kind: "price_locked" }
  | { kind: "blocked_debt"; owedCents: number }
  | { kind: "onboarding_incomplete" }
  | { kind: "refuse"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "validation_error"; message: string }
  | { kind: "error"; message: string };

/**
 * Read-only twin of editBookingCore: same load + ownership + status + paid-lock
 * + merge (buildEditQuoteInput) + re-quote pipeline, but it NEVER persists. The
 * UI calls this for the live preview so "what you see" equals what Save commits.
 */
export async function previewEditCore(
  deps: BookingServiceDeps,
  input: EditBookingInput,
): Promise<PreviewEditResult> {
  const { repo } = deps;
  const { policy, patch } = input;

  const booking = await repo.getBookingForEdit(input.bookingId);
  if (!booking) return { kind: "not_found" };

  const isAdminActor = policy.skipOnboardingGate;
  if (!isAdminActor && booking.client_id !== input.actorUserId) {
    return { kind: "forbidden" };
  }
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { kind: "invalid_status" };
  }
  const priceAffecting =
    patch.petIds !== undefined || patch.quantities !== undefined;
  if (booking.paidCents > 0 && priceAffecting) {
    return { kind: "price_locked" };
  }

  const mergedInput = buildEditQuoteInput(booking, patch);
  const artifacts = await computeBookingArtifacts(deps, mergedInput, policy);
  if (artifacts.kind === "validation_error")
    return { kind: "validation_error", message: artifacts.message };
  if (artifacts.kind === "error")
    return { kind: "error", message: artifacts.message };
  if (artifacts.kind === "refuse")
    return { kind: "refuse", reason: artifacts.reason };
  if (artifacts.kind === "blocked_debt")
    return { kind: "blocked_debt", owedCents: artifacts.owedCents };
  if (artifacts.kind === "onboarding_incomplete")
    return { kind: "onboarding_incomplete" };

  const { breakdown, requiresApprovalByOccurrence } = artifacts.artifacts;
  const requiresApproval = requiresApprovalByOccurrence[0];
  const preview: BookingQuotePreview = {
    breakdown,
    finalCents: breakdown.finalCents,
    distanceMiles: artifacts.artifacts.distanceMiles ?? null,
    requiresApproval,
    decision: requiresApproval ? "manual" : "auto",
  };
  return { kind: "preview", preview, requiresApproval };
}
```

(Confirm the exact field names on `artifacts.artifacts` against the existing `editBookingCore` body and `BookingQuotePreview`; reuse precisely what the core already destructures — `breakdown`, `requiresApprovalByOccurrence`, and the distance value. If `distanceMiles` is not on `artifacts.artifacts`, set it to `null` — it is not used by the delta UI.)

- [ ] **Step 4: Write `previewEditCore` tests**

In `booking-service.test.ts`, add a `describe("previewEditCore")` using the same fake repo the existing `editBookingCore` tests use. Cover: ownership `forbidden`; `invalid_status`; paid + price-affecting → `price_locked`; an unpaid pets/quantity change → `preview` whose `finalCents` equals what `editBookingCore` would persist for the identical patch (load both, assert equal — the drift guard); an unpaid time-only move on a confirmed booking → `preview` with `requiresApproval` reflecting the re-derivation.

Run: `npx vitest run src/features/booking/booking-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/booking-service.ts src/features/booking/booking-service.test.ts
git commit -m "feat: add read-only previewEditCore sharing the edit merge"
```

---

## Task 5: `previewEdit` server action

Thin `"use server"` wrapper: auth, derive policy from the verified role (mirror `editBooking`), call `previewEditCore`.

**Files:**

- Create: `src/features/booking/preview-edit.ts`

- [ ] **Step 1: Write the action**

```ts
"use server";

/**
 * Read-only booking-edit preview. Same auth + actor→policy derivation as
 * editBooking; delegates to previewEditCore (no persist). The UI uses this for
 * the live re-quote + would-be outcome (price_locked / approval drop / gate).
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { previewEditCore } from "./booking-service";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { EditBookingPatch, PreviewEditResult } from "./booking-service";

export async function previewEdit(input: {
  bookingId: string;
  patch: EditBookingPatch;
}): Promise<PreviewEditResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const policy = profile?.role === "admin" ? ADMIN_POLICY : CLIENT_POLICY;

  return previewEditCore(
    { repo, now: new Date() },
    {
      bookingId: input.bookingId,
      actorUserId: user.id,
      policy,
      patch: input.patch,
    },
  );
}
```

(Do NOT re-export `PreviewEditResult` from this `"use server"` file — a server-action module may export only async functions. Import the type from `./booking-service`, matching the `editBooking`/`actions.ts` convention.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/booking/preview-edit.ts
git commit -m "feat: add previewEdit server action"
```

---

## Task 6: Delta-aware quote panel

Extend the shared `QuotePanel` with optional delta props so the edit surface shows new total + signed delta + an approval-drop note. Create-flow callers omit the props → unchanged.

**Files:**

- Modify: `src/features/booking/_components/quote-panel.tsx`

- [ ] **Step 1: Add optional props**

Add to `QuotePanelProps`:

```ts
  /** Prior booking total (cents). When set, renders a signed delta vs finalCents. */
  priorFinalCents?: number;
  /** When true, show "this change needs Cal's approval again". */
  approvalWillReReview?: boolean;
```

After the total row, render the delta (token colors only — `text-brand-strong` for an increase, `text-status-available-foreground` for a decrease) and the approval note. Use the existing `centsToDollars` helper:

```tsx
{
  typeof priorFinalCents === "number" &&
    priorFinalCents !== preview.finalCents && (
      <p className="mt-1 text-right text-sm font-medium tabular-nums">
        <span
          className={
            preview.finalCents > priorFinalCents
              ? "text-brand-strong"
              : "text-status-available-foreground"
          }
        >
          {preview.finalCents > priorFinalCents ? "+" : "−"}
          {centsToDollars(Math.abs(preview.finalCents - priorFinalCents))}
        </span>
        <span className="text-muted-foreground ml-1.5">vs current</span>
      </p>
    );
}
{
  approvalWillReReview && (
    <p className="text-brand-strong mt-2 text-xs">
      This change needs Cal&apos;s approval again.
    </p>
  );
}
```

(Keep the existing `requiresApproval` italic note for the create flow; the edit flow passes `approvalWillReReview` only when the status actually changes from `confirmed`.)

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. Confirm the book flow still renders (props optional, no caller change required).

- [ ] **Step 3: Commit**

```bash
git add src/features/booking/_components/quote-panel.tsx
git commit -m "feat: support price-delta and re-approval note in quote panel"
```

---

## Task 7: `EditBookingClient` orchestrator

A focused client component modeled on `MeetGreetScheduler` (reschedule mode) + the relevant slices of `ServiceBookingClient`, minus auth gates / returnTo / recurring.

**Files:**

- Create: `src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx`

- [ ] **Step 1: Implement the orchestrator**

Props (all supplied by the server route in Task 8):

```ts
interface EditBookingClientProps {
  bookingId: string;
  service: ServiceDetail; // from service-booking-client
  rules: BookingRuleSettings;
  initialBusy: PublicBusyRange[];
  pets: AssignablePet[]; // client's pets (signed photo urls)
  priorFinalCents: number; // current booking total (for delta)
  initial: {
    startsAtIso: string; // current start
    endsAtIso: string;
    petIds: string[];
    quantities: QuantityState; // from quantityStateFromQuoteInputs
    comments: string;
    isSeriesOccurrence: boolean; // series_id != null → Q7 note
  };
}
```

Behavior — reuse existing building blocks; do not re-derive business rules:

- **State seeding:** `selectedStart` from `initial.startsAtIso`; `selectedPetIds` from `initial.petIds`; `quantities` from `initial.quantities`; `comments` from `initial.comments`.
- **Scheduler:** mount `<Scheduler>` with `BOOK_WALK_CAPABILITIES` (week-slots; pre-fill `intervalMinutes` from the current duration `endsAt − startsAt`) **or** house-sitting caps when `service.pricingType === "house_sitting"`, exactly as `ServiceBookingClient` chooses mode. Pass `initialSlot` derived from the current start (the `MeetGreetScheduler` pattern: `{ dayKey: denverDayKey(start), minute }`). Bridge `onSelectionChange` → `selectedStart` / range identically to `ServiceBookingClient`.
- **Pets:** `<PetAssignment>` seeded with `selectedPetIds` (pet-aware services only — walk, house_sitting).
- **Quantities:** `<QuantityForm state={quantities} onChange={…}>`.
- **Comments:** a token-styled `<textarea>` bound to `comments`.
- **Live preview:** debounced (~400ms, same as create) call to `previewEdit({ bookingId, patch })`, building `patch` from only the **changed** dimensions (compare against `initial`; omit unchanged fields so the core keeps stored values). On `kind === "preview"` → set quote + `approvalWillReReview = preview.requiresApproval && initialStatusWasConfirmed`. On `price_locked` / `unavailable` / `refuse` / `validation_error` → show the inline message and disable Save. Dates cross as `Date` objects.
- **Series note (Q7):** when `initial.isSeriesOccurrence`, render once above Save: "This changes this visit only — your other recurring visits stay as they are."
- **Save:** call `editBooking({ bookingId, patch })`; map `EditBookingResult`:
  - `success` → `toast.add({ title: "Booking updated" })`, then `router.push("/account/bookings")` + `router.refresh()`.
  - `unavailable` / `slot_taken` / `validation_error` / `refuse` → inline error, stay on page.
  - `price_locked` / `forbidden` / `invalid_status` / `blocked_debt` / `onboarding_incomplete` / `not_found` / `error` → generic toast "Couldn't save — please contact Cal." (not reachable from the gated UI, but safe).
- Reuse `QuotePanel` with `priorFinalCents` + `approvalWillReReview`; Save CTA label "Save changes" (reuse the panel's `onBook`/`showBook` slot or render a sibling brand button).

Match the spacing/section pattern of `ServiceBookingClient` (numbered `text-brand-strong` section headers, `max-w-2xl` column) so the edit surface reads as the same family.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(account)/account/bookings/[id]/edit/_components/edit-booking-client.tsx"
git commit -m "feat: add client edit-booking orchestrator"
```

---

## Task 8: Edit route page (server)

Loads + guards, then renders `EditBookingClient`. Mirrors `book/[serviceSlug]/page.tsx` loading (service detail, `loadBookingFormData`, pets w/ signed URLs).

**Files:**

- Create: `src/app/(account)/account/bookings/[id]/edit/page.tsx`

- [ ] **Step 1: Implement the route**

Server component:

1. `const { id } = await params;` authenticate via `createClient().auth.getUser()`; `redirect("/login")` if absent.
2. Service-role `getBookingForEdit(id)` (via the repo) **and** read the booking's `final_cents`, `service_id`, and `service.pricing_type/name/default_duration_min` (one `services(...)`-joined select, or reuse the repo row + a small extra select for `final_cents` + service detail). If `null` or `booking.client_id !== user.id` → `redirect("/account/bookings")`.
3. Load settings (`cancellation_full_refund_hours`) and compute `clientCanEditBooking({ status, startsAt, paidCents, serviceSlug }, new Date(), hours)`. If not editable → `redirect("/account/bookings")` (the table already explains why).
4. `loadBookingFormData(serviceSlug)` for `{ rules, initialBusy }`; load the client's pets with signed photo URLs (copy the loader block from `book/[serviceSlug]/page.tsx`).
5. Build `initial.quantities = quantityStateFromQuoteInputs(pricingType, booking.quote_inputs)`.
6. Render a back link + heading (`Edit booking`) and `<EditBookingClient … />` inside the same `max-w-2xl` main used by the book page.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke (local)**

Start the app, sign in as a client with an upcoming unpaid booking, visit `/account/bookings/<id>/edit`. Confirm the form is pre-seeded, the live preview updates, and a paid/cutoff/meet-greet booking id redirects to `/account/bookings`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(account)/account/bookings/[id]/edit/page.tsx"
git commit -m "feat: add client booking edit route"
```

---

## Task 9: Bookings-table Edit affordance + locked cell

Add an Edit/locked cell to upcoming rows in `/account/bookings`, driven by `clientCanEditBooking`. Keep the page a server component; isolate the locked-reason rendering in a small client island only if interactivity is needed (a `Link` + static text needs none — prefer pure server markup).

**Files:**

- Create: `src/app/(account)/account/bookings/_components/edit-cell.tsx`
- Modify: `src/app/(account)/account/bookings/page.tsx`

- [ ] **Step 1: Extend the page query + types**

In `page.tsx`, add `series_id` is not needed here, but add `services(slug)` and ensure `final_cents`, `payments`, `status`, `starts_at`, `ends_at` are selected (most already are). Compute `paidCents` per row (reuse the existing `amountOwed` paid-sum logic) and read `cancellation_full_refund_hours` from settings once.

- [ ] **Step 2: Implement `EditCell`**

```tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clientCanEditBooking,
  editLockCopy,
  type EditabilityInput,
} from "@/features/booking/client-can-edit";

export function EditCell({
  bookingId,
  booking,
  now,
  cancellationFullRefundHours,
}: {
  bookingId: string;
  booking: EditabilityInput;
  now: Date;
  cancellationFullRefundHours: number;
}) {
  const result = clientCanEditBooking(
    booking,
    now,
    cancellationFullRefundHours,
  );
  if (result.editable) {
    return (
      <Link
        href={`/account/bookings/${bookingId}/edit`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Edit
      </Link>
    );
  }
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden="true">🔒</span>
      {editLockCopy(result.reason)}
    </span>
  );
}
```

- [ ] **Step 3: Wire into the upcoming table**

In the `BookingTable` for the upcoming section, add an "Edit" column (only when `showPayButton`, i.e. upcoming) and render `<EditCell …>` per row, passing `serviceSlug` from `services.slug`, `startsAt: new Date(b.starts_at)`, `paidCents`, `status`. History rows show no Edit column.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(account)/account/bookings/_components/edit-cell.tsx" "src/app/(account)/account/bookings/page.tsx"
git commit -m "feat: add edit affordance to client bookings list"
```

---

## Task 10: Final verification (typecheck, lint, targeted tests, mobile)

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, zero errors.

- [ ] **Step 2: Run all NEW pure unit-test files (not the integration suite)**

Run:

```bash
npx vitest run src/features/booking/quantity-state-from-quote-inputs.test.ts src/features/booking/client-can-edit.test.ts src/features/booking/booking-service.test.ts src/features/booking/edit-booking.test.ts
```

Expected: PASS. (Do not run the full `vitest run` — booking integration tests need `npx supabase db reset` first.)

- [ ] **Step 3: Mobile parity + a11y check (manual, local)**

At a 375px viewport, walk the edit route and the bookings table: scheduler, pet grid, quantity steppers, comments, and quote panel stack cleanly; the locked-row reason wraps without overflow; Edit/Save are keyboard-reachable with a visible focus ring; the delta + approval note read correctly. Confirm a price increase shows `+$X` in clay and a decrease shows `−$X` in the available-foreground token.

- [ ] **Step 4: Verify no spec drift**

Re-read the spec's Decisions list; confirm each (Q1 single surface, Q2 route, Q3 live preview + previewEdit, Q4 inline lock copy, D-Paid full lock, Q5 meet-greet excluded, Q6 no notifications, Q7 series note) is implemented. Fix any gap before declaring done.

---

## Self-Review Notes

- **Spec coverage:** Q1→Task 7; Q2→Task 8; Q3→Tasks 4–7; Q4→Tasks 2,9; D-Paid→Task 2 (`paid` reason); Q5→Task 2 (`meet_greet` precedence) + Task 8 redirect; Q6→(no task — intentional); Q7→Task 7 note + existing D6 detach (untouched). Modularization→Task 3. Testing→Tasks 1,2,4,10.
- **No new schema/repo** — confirmed; all reads use existing columns + P1 methods.
- **Drift guard:** `buildEditQuoteInput` is the single merge path for both `editBookingCore` and `previewEditCore` (Task 4), with an equality test in Task 4 Step 4.

_Last reviewed: 2026-06-10_
