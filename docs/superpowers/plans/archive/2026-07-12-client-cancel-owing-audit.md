# Client self-cancel + owing-system audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give clients a self-service booking-cancel flow with a truthful refund/fee preview, and close the owing-system audit gaps (fix the no-show double-charge; add admin waive + adjust to the debit surface).

**Architecture:** Group C adds a cancel-specific predicate, a single pure cancellation projection (`previewCancellation`) that both the preview action and the executing core consume so the shown outcome can't drift from what runs, a read-only preview server action, and a `CancelCell` that reuses the existing confirm-dialog primitive. Group H fixes `markNoShowCore` to net the no-show debt against what was already paid, adds a `resolution` column to `client_debits`, and extends the admin balance surface with waive + adjust actions and UI.

**Tech Stack:** Next.js App Router, TypeScript strict, Supabase (service-role writes), Vitest, Tailwind + base-ui dialogs.

## Global Constraints

- TypeScript `strict`, **no `any`** (copy existing patterns).
- Core logic pure + unit-tested; money is integer cents throughout; `now` is passed in, never read inside pure functions.
- Design tokens only — no hardcoded colors. Accessibility floor (semantic HTML, focus, keyboard).
- Commit to `main`, **subject line only**, Conventional Commits, no body/trailers, no internal identifiers (no "tranche 3", no plan codename).
- Per-task gate = the task's **scoped unit test file** + `npm run typecheck`, NOT full `npm test` (integration tests need the local Supabase stack). Integration tests (in `admin.test.ts`) run only when the local stack is up.
- Edit source files with the Edit/Write tools only (PowerShell mojibakes UTF-8). Stage files by name.
- Invoke `frontend-design` before building any UI (Tasks 5 and 9).
- Spec: [docs/superpowers/specs/2026-07-12-client-cancel-owing-audit-design.md](../specs/2026-07-12-client-cancel-owing-audit-design.md).

---

## Task 1: `clientCanCancelBooking` predicate

**Files:**

- Create: `src/features/booking/client-can-cancel.ts`
- Test: `src/features/booking/client-can-cancel.test.ts`
- Modify: `src/features/booking/index.client.ts` (export), `src/features/booking/index.ts` (export, mirroring the `client-can-edit` lines)

**Interfaces:**

- Consumes: `BookingStatusDb` from `./booking-repository`.
- Produces:

  ```ts
  export interface CancellabilityInput {
    status: BookingStatusDb;
    startsAt: Date;
  }
  export type CancelBlockReason = "status" | "started";
  export type Cancellability =
    | { cancellable: true }
    | { cancellable: false; reason: CancelBlockReason };
  export function clientCanCancelBooking(
    booking: CancellabilityInput,
    now: Date,
  ): Cancellability;
  export function cancelLockCopy(reason: CancelBlockReason): string;
  ```

- [ ] **Step 1: Write the failing test**

`src/features/booking/client-can-cancel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  clientCanCancelBooking,
  cancelLockCopy,
  type CancellabilityInput,
} from "./client-can-cancel";

const base = (
  over: Partial<CancellabilityInput> = {},
): CancellabilityInput => ({
  status: "confirmed",
  startsAt: new Date("2026-07-01T17:00:00Z"),
  ...over,
});
const before = new Date("2026-06-20T12:00:00Z");

describe("clientCanCancelBooking", () => {
  it("allows an upcoming confirmed booking", () => {
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("allows pending_approval", () => {
    expect(
      clientCanCancelBooking(base({ status: "pending_approval" }), before),
    ).toEqual({ cancellable: true });
  });

  it("allows a paid booking (cancel policy != edit policy) — no paid gate", () => {
    // paidCents is intentionally not an input; a paid booking is still cancellable.
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("allows a meet & greet (unlike edit)", () => {
    // serviceSlug is intentionally not an input; meet & greet is cancellable.
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("blocks terminal statuses with reason status", () => {
    for (const status of [
      "completed",
      "cancelled",
      "declined",
      "no_show",
    ] as const) {
      expect(clientCanCancelBooking(base({ status }), before)).toEqual({
        cancellable: false,
        reason: "status",
      });
    }
  });

  it("blocks once the booking has started with reason started", () => {
    const after = new Date("2026-07-01T17:00:00Z"); // exactly at start
    expect(clientCanCancelBooking(base(), after)).toEqual({
      cancellable: false,
      reason: "started",
    });
    const later = new Date("2026-07-02T00:00:00Z");
    expect(clientCanCancelBooking(base(), later)).toEqual({
      cancellable: false,
      reason: "started",
    });
  });

  it("checks status before timing (terminal past booking → status)", () => {
    const after = new Date("2026-07-02T00:00:00Z");
    expect(
      clientCanCancelBooking(base({ status: "completed" }), after),
    ).toEqual({
      cancellable: false,
      reason: "status",
    });
  });

  it("cancelLockCopy returns copy for each reason", () => {
    expect(cancelLockCopy("status")).toMatch(/no longer/i);
    expect(cancelLockCopy("started")).toMatch(/contact cal/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/client-can-cancel.test.ts`
Expected: FAIL — cannot find module `./client-can-cancel`.

- [ ] **Step 3: Write minimal implementation**

`src/features/booking/client-can-cancel.ts`:

```ts
/**
 * Pure client-cancellability predicate. Deliberately distinct from
 * clientCanEditBooking: cancel is ALWAYS allowed before start, including for
 * paid bookings and meet & greets (edit blocks both). The only gates are a
 * non-terminal status and the booking not having started yet. Precedence:
 * status first, then timing — so a past terminal booking reports "status".
 */
import type { BookingStatusDb } from "@/features/booking/booking-repository";

export interface CancellabilityInput {
  status: BookingStatusDb;
  startsAt: Date;
}

export type CancelBlockReason = "status" | "started";

export type Cancellability =
  | { cancellable: true }
  | { cancellable: false; reason: CancelBlockReason };

const CANCELLABLE_STATUSES: BookingStatusDb[] = [
  "pending_approval",
  "confirmed",
];

export function clientCanCancelBooking(
  booking: CancellabilityInput,
  now: Date,
): Cancellability {
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return { cancellable: false, reason: "status" };
  }
  if (now.getTime() >= booking.startsAt.getTime()) {
    return { cancellable: false, reason: "started" };
  }
  return { cancellable: true };
}

/** Inline copy for a locked (non-cancellable) row. */
export function cancelLockCopy(reason: CancelBlockReason): string {
  switch (reason) {
    case "status":
      return "This booking can no longer be cancelled.";
    case "started":
      return "Already started — contact Cal.";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/client-can-cancel.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Export from both barrels**

In `src/features/booking/index.client.ts`, after the `client-can-edit` export block (around line 141-142) add:

```ts
// client-can-cancel
export { clientCanCancelBooking, cancelLockCopy } from "./client-can-cancel";
export type {
  CancellabilityInput,
  CancelBlockReason,
} from "./client-can-cancel";
```

In `src/features/booking/index.ts`, find the existing `client-can-edit` re-export and add the matching line for `./client-can-cancel` right after it (grep `client-can-edit` in that file to locate; copy the same `export { ... } from` / `export type { ... }` shape).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/features/booking/client-can-cancel.ts src/features/booking/client-can-cancel.test.ts src/features/booking/index.client.ts src/features/booking/index.ts
git commit -m "feat(booking): client-cancellability predicate"
```

---

## Task 2: `previewCancellation` pure projection

**Files:**

- Modify: `src/features/booking/cancellation.ts`
- Test: `src/features/booking/cancellation.test.ts` (add a `previewCancellation` describe block)

**Interfaces:**

- Consumes: existing `computeRefund`, `computeCancellationDebtCents` in the same file.
- Produces:

  ```ts
  export interface CancellationOutcome {
    tier: RefundTier; // "full" | "late" | "none"
    refundCents: number; // refunded immediately
    remainderCents: number; // amount Cal could still grant (late tier only), else 0
    debtCents: number; // late-cancel fee owed (unpaid inside cutoff only), else 0
  }
  export interface PreviewCancellationInput {
    finalCents: number;
    paidCents: number;
    startsAt: Date;
    now: Date;
    fullRefundHours: number;
    lateRefundPct: number;
    noShowChargePct: number;
  }
  export function previewCancellation(
    input: PreviewCancellationInput,
  ): CancellationOutcome;
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/features/booking/cancellation.test.ts`:

```ts
import { previewCancellation } from "./cancellation";

describe("previewCancellation", () => {
  const settings = {
    fullRefundHours: 48,
    lateRefundPct: 50,
    noShowChargePct: 100,
  };
  const start = new Date("2026-07-01T17:00:00Z");

  it("full tier, paid: refunds everything, no remainder or debt", () => {
    const now = new Date("2026-06-20T00:00:00Z"); // before cutoff
    expect(
      previewCancellation({
        finalCents: 4500,
        paidCents: 4500,
        startsAt: start,
        now,
        ...settings,
      }),
    ).toEqual({
      tier: "full",
      refundCents: 4500,
      remainderCents: 0,
      debtCents: 0,
    });
  });

  it("full tier, unpaid: no charge (all zeros)", () => {
    const now = new Date("2026-06-20T00:00:00Z");
    expect(
      previewCancellation({
        finalCents: 4500,
        paidCents: 0,
        startsAt: start,
        now,
        ...settings,
      }),
    ).toEqual({
      tier: "full",
      refundCents: 0,
      remainderCents: 0,
      debtCents: 0,
    });
  });

  it("late tier, paid: partial refund now + remainder Cal may grant", () => {
    const now = new Date("2026-07-01T00:00:00Z"); // < 48h before start
    expect(
      previewCancellation({
        finalCents: 4500,
        paidCents: 4500,
        startsAt: start,
        now,
        ...settings,
      }),
    ).toEqual({
      tier: "late",
      refundCents: 2250,
      remainderCents: 2250,
      debtCents: 0,
    });
  });

  it("none tier, unpaid inside cutoff: fee owed, no refund", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(
      previewCancellation({
        finalCents: 4500,
        paidCents: 0,
        startsAt: start,
        now,
        ...settings,
      }),
    ).toEqual({
      tier: "none",
      refundCents: 0,
      remainderCents: 0,
      debtCents: 2250,
    });
  });

  it("$0 booking (meet & greet) inside cutoff: no charge", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(
      previewCancellation({
        finalCents: 0,
        paidCents: 0,
        startsAt: start,
        now,
        ...settings,
      }),
    ).toEqual({
      tier: "none",
      refundCents: 0,
      remainderCents: 0,
      debtCents: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/cancellation.test.ts`
Expected: FAIL — `previewCancellation` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/booking/cancellation.ts`:

```ts
/** The projected outcome of cancelling a booking right now — the single source
 * of truth shared by the preview action and the executing cancel core. */
export interface CancellationOutcome {
  tier: RefundTier;
  refundCents: number;
  remainderCents: number;
  debtCents: number;
}

export interface PreviewCancellationInput {
  finalCents: number;
  paidCents: number;
  startsAt: Date;
  now: Date;
  fullRefundHours: number;
  lateRefundPct: number;
  noShowChargePct: number;
}

/**
 * Projects the client self-cancel outcome by composing the existing refund and
 * debt math (no new money rules). `remainderCents` is what Cal could still grant
 * back beyond the late-tier default (paidCents minus the immediate refund);
 * `debtCents` is the late-cancel fee owed only when the slot was never paid.
 */
export function previewCancellation(
  input: PreviewCancellationInput,
): CancellationOutcome {
  const refund = computeRefund({
    finalCents: input.finalCents,
    paidCents: input.paidCents,
    startsAt: input.startsAt,
    now: input.now,
    fullRefundHours: input.fullRefundHours,
    lateRefundPct: input.lateRefundPct,
    fullRefund: false,
  });

  const remainderCents =
    refund.tier === "late" ? input.paidCents - refund.refundCents : 0;

  const debtCents =
    refund.tier === "none"
      ? computeCancellationDebtCents({
          finalCents: input.finalCents,
          reason: "late_cancel",
          lateRefundPct: input.lateRefundPct,
          noShowChargePct: input.noShowChargePct,
        })
      : 0;

  return {
    tier: refund.tier,
    refundCents: refund.refundCents,
    remainderCents,
    debtCents,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/cancellation.test.ts`
Expected: PASS (existing tests + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/cancellation.ts src/features/booking/cancellation.test.ts
git commit -m "feat(booking): cancellation outcome projection"
```

---

## Task 3: Route `cancelBookingCore` through `previewCancellation`

Refactor so the executing core derives its refund + debit from the same projection the preview shows — behavior is unchanged, so the existing `cancelBookingCore` tests in `booking-service.test.ts` stay green (this is the safety net).

**Files:**

- Modify: `src/features/booking/cancel-core.ts`
- Test (regression only, do not edit): `src/features/booking/booking-service.test.ts`

**Interfaces:**

- Consumes: `previewCancellation`, `CancellationOutcome` from `./cancellation` (Task 2).
- Produces: no signature change to `cancelBookingCore`.

- [ ] **Step 1: Run the existing cancel tests to capture the green baseline**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t cancel`
Expected: PASS. (If the local stack is required for any of these, run the file's cancel-scoped unit tests only; note which pass.)

- [ ] **Step 2: Refactor the core**

In `src/features/booking/cancel-core.ts`, replace the inline `computeRefund` + debt block (currently lines ~77-111) so it calls `previewCancellation` once and acts on the outcome. Replace the import on line 6 and the body between the `settings`/`paidCents` computation and the `updateBookingStatus` call:

Change the import:

```ts
import { previewCancellation } from "./cancellation";
```

(remove the now-unused `computeRefund, computeCancellationDebtCents` import if nothing else in the file uses them — grep the file first; keep whatever is still referenced).

Replace the refund/debt section with:

```ts
const settings = await repo.getSettings();
const paidCents = booking.payments
  .filter((p) => p.status === "succeeded")
  .reduce((sum, p) => sum + p.amountCents, 0);

// Admin/Cal cancels always refund 100% (fullRefund path in the input); the
// client path uses the timing-based projection. Preserve that split.
if (input.fullRefund ?? false) {
  const succeeded = booking.payments.find((p) => p.status === "succeeded");
  if (succeeded && paidCents > 0) {
    await gateway.refund(succeeded.paymentIntentId, paidCents);
  }
} else {
  const outcome = previewCancellation({
    finalCents: booking.finalCents,
    paidCents,
    startsAt: booking.startsAt,
    now,
    fullRefundHours: settings.cancellation_full_refund_hours,
    lateRefundPct: settings.late_cancel_refund_pct,
    noShowChargePct: settings.no_show_charge_pct,
  });

  if (outcome.refundCents > 0) {
    const succeeded = booking.payments.find((p) => p.status === "succeeded");
    if (succeeded) {
      await gateway.refund(succeeded.paymentIntentId, outcome.refundCents);
    }
  }

  if (outcome.debtCents > 0) {
    await repo.insertDebit({
      client_id: booking.client_id,
      booking_id: booking.id,
      amount_cents: outcome.debtCents,
      reason: "late_cancel",
    });
  }
}
```

> Note: the `fullRefund` (admin) branch keeps its existing 100%-refund behavior; only the client branch is re-expressed through `previewCancellation`. This preserves the DESIGN decision-14 split exactly.

- [ ] **Step 3: Run the cancel tests to verify still green**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t cancel`
Expected: PASS (unchanged behavior).

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/features/booking/cancel-core.ts
git commit -m "refactor(booking): cancel core reuses cancellation projection"
```

---

## Task 4: `previewBookingCancellation` server action

**Files:**

- Create: `src/features/booking/preview-cancellation.ts` (`"use server"`, mirroring `preview-edit.ts`)
- Modify: `src/features/booking/index.client.ts` (export, mirroring the `previewEdit` line ~163)

**Interfaces:**

- Consumes: `previewCancellation`, `CancellationOutcome` (Task 2); `createClient` from `@/lib/supabase/server`; `createServiceClient` from `@/lib/supabase/service`; `createSupabaseBookingRepository` from `./booking-repository`.
- Produces:

  ```ts
  export type PreviewCancellationResult =
    | { kind: "ok"; outcome: CancellationOutcome }
    | { kind: "not_found" }
    | { kind: "forbidden" };
  export async function previewBookingCancellation(
    bookingId: string,
  ): Promise<PreviewCancellationResult>;
  ```

- [ ] **Step 1: Write the action**

`src/features/booking/preview-cancellation.ts`:

```ts
"use server";

/**
 * Read-only preview of what a client self-cancel would do RIGHT NOW. Computed
 * server-side with a fresh clock so the refund tier is correct at the cutoff
 * boundary. Performs no writes. Ownership is verified against the session user;
 * the id is never trusted from the payload for authorization.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { previewCancellation, type CancellationOutcome } from "./cancellation";

export type PreviewCancellationResult =
  | { kind: "ok"; outcome: CancellationOutcome }
  | { kind: "not_found" }
  | { kind: "forbidden" };

export async function previewBookingCancellation(
  bookingId: string,
): Promise<PreviewCancellationResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const repo = createSupabaseBookingRepository(serviceClient);

  const booking = await repo.getBookingWithPayments(bookingId);
  if (!booking) return { kind: "not_found" };
  if (booking.client_id !== user.id) return { kind: "forbidden" };

  const settings = await repo.getSettings();
  const paidCents = booking.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);

  const outcome = previewCancellation({
    finalCents: booking.finalCents,
    paidCents,
    startsAt: booking.startsAt,
    now: new Date(),
    fullRefundHours: settings.cancellation_full_refund_hours,
    lateRefundPct: settings.late_cancel_refund_pct,
    noShowChargePct: settings.no_show_charge_pct,
  });

  return { kind: "ok", outcome };
}
```

- [ ] **Step 2: Export from the client barrel**

In `src/features/booking/index.client.ts`, near the other preview actions (~line 162-166) add:

```ts
// preview-cancellation ("use server")
export { previewBookingCancellation } from "./preview-cancellation";
export type { PreviewCancellationResult } from "./preview-cancellation";
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/features/booking/preview-cancellation.ts src/features/booking/index.client.ts
git commit -m "feat(booking): booking-cancellation preview action"
```

> No unit test: this action is thin IO glue over the Task-2 pure function (already fully tested). Its behavior is exercised in the manual `verify` at the end.

---

## Task 5: `CancelCell` UI + wire into the bookings row

Invoke `frontend-design` before writing the component. Reuse the existing `useConfirm` primitive: fetch the preview first, then open the confirm dialog seeded with the outcome copy. mobile-parity required (the row already wraps; keep the new control in the same wrap flow).

**Files:**

- Create: `src/app/(site)/(account)/account/bookings/_components/cancel-cell.tsx`
- Create: `src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.ts` (pure copy builder + test)
- Test: `src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.test.ts`
- Modify: `src/app/(site)/(account)/account/bookings/_components/account-bookings-client.tsx` (render `CancelCell` in `BookingCard`, ~line 277-290)

**Interfaces:**

- Consumes: `clientCanCancelBooking`, `cancelLockCopy`, `cancelBooking`, `previewBookingCancellation`, `type CancellationOutcome` from `@/features/booking/index.client`; `useConfirm` from `@/components/feedback/confirm-dialog`; `useToast` from `@/components/feedback/toast`; `useRouter` from `next/navigation`.
- Produces: `CancelCell` component; `cancelOutcomeCopy(outcome): string` pure helper.

- [ ] **Step 1: Write the failing test for the pure copy builder**

`cancel-outcome-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cancelOutcomeCopy } from "./cancel-outcome-copy";

describe("cancelOutcomeCopy", () => {
  it("full tier with a refund", () => {
    expect(
      cancelOutcomeCopy({
        tier: "full",
        refundCents: 4500,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("You'll be refunded $45.00.");
  });

  it("full tier with nothing paid → no charge", () => {
    expect(
      cancelOutcomeCopy({
        tier: "full",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("No charge.");
  });

  it("late tier: refund now + remainder Cal may grant", () => {
    expect(
      cancelOutcomeCopy({
        tier: "late",
        refundCents: 2250,
        remainderCents: 2250,
        debtCents: 0,
      }),
    ).toBe(
      "You'll be refunded $22.50 now. Cal may refund the remaining $22.50.",
    );
  });

  it("none tier with a fee", () => {
    expect(
      cancelOutcomeCopy({
        tier: "none",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 2250,
      }),
    ).toBe("A $22.50 late-cancellation fee will apply.");
  });

  it("none tier with no fee ($0 booking) → no charge", () => {
    expect(
      cancelOutcomeCopy({
        tier: "none",
        refundCents: 0,
        remainderCents: 0,
        debtCents: 0,
      }),
    ).toBe("No charge.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure copy builder**

`cancel-outcome-copy.ts`:

```ts
import type { CancellationOutcome } from "@/features/booking/index.client";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Human-readable outcome shown in the cancel confirm dialog. */
export function cancelOutcomeCopy(outcome: CancellationOutcome): string {
  if (outcome.tier === "late") {
    return `You'll be refunded ${dollars(outcome.refundCents)} now. Cal may refund the remaining ${dollars(outcome.remainderCents)}.`;
  }
  if (outcome.debtCents > 0) {
    return `A ${dollars(outcome.debtCents)} late-cancellation fee will apply.`;
  }
  if (outcome.refundCents > 0) {
    return `You'll be refunded ${dollars(outcome.refundCents)}.`;
  }
  return "No charge.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Write `CancelCell`**

`cancel-cell.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/feedback/confirm-dialog";
import { useToast } from "@/components/feedback/toast";
import {
  clientCanCancelBooking,
  cancelLockCopy,
  cancelBooking,
  previewBookingCancellation,
  type CancellabilityInput,
} from "@/features/booking/index.client";
import { cancelOutcomeCopy } from "./cancel-outcome-copy";

export function CancelCell({
  bookingId,
  booking,
  now,
}: {
  bookingId: string;
  booking: CancellabilityInput;
  now: Date;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, startTransition] = useTransition();

  const result = clientCanCancelBooking(booking, now);
  if (!result.cancellable) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span aria-hidden="true">🔒</span>
        {cancelLockCopy(result.reason)}
      </span>
    );
  }

  async function onClick() {
    const preview = await previewBookingCancellation(bookingId);
    if (preview.kind !== "ok") {
      toast.add({
        type: "error",
        title: "Couldn't load cancellation details.",
      });
      return;
    }
    const ok = await confirm({
      title: "Cancel this booking?",
      description: cancelOutcomeCopy(preview.outcome),
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep booking",
      destructive: true,
      onConfirm: async () => {
        const res = await cancelBooking({ bookingId });
        if (res.kind === "success") {
          toast.add({ type: "success", title: "Booking cancelled." });
          startTransition(() => router.refresh());
          return true;
        }
        toast.add({
          type: "error",
          title: "Couldn't cancel. Please try again.",
        });
        return false;
      },
    });
    if (!ok) return;
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={onClick}>
        Cancel
      </Button>
      {dialog}
    </>
  );
}
```

> Confirm the `cancelBooking` result union in `booking-service` uses `kind: "success"` (it does — `CancelBookingResult`). If `useToast().add` signature differs from `{ type, title }`, match the shape used in `client-detail-client.tsx` (grep `toast.add` there).

- [ ] **Step 6: Wire into `BookingCard`**

In `account-bookings-client.tsx`, import `CancelCell` next to `EditCell`, and in `BookingCard`'s action row (the `<div className="mt-2.5 flex flex-wrap items-center gap-2">`, ~line 277) add after `<EditCell .../>`:

```tsx
<CancelCell
  bookingId={booking.id}
  booking={{
    status: booking.status,
    startsAt: new Date(booking.starts_at),
  }}
  now={now}
/>
```

- [ ] **Step 7: Typecheck + lint + commit**

Run: `npm run typecheck && npx eslint "src/app/(site)/(account)/account/bookings/_components/cancel-cell.tsx" "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.ts"`
Expected: clean.

```bash
git add "src/app/(site)/(account)/account/bookings/_components/cancel-cell.tsx" "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.ts" "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.test.ts" "src/app/(site)/(account)/account/bookings/_components/account-bookings-client.tsx"
git commit -m "feat(account): client self-cancel with refund preview"
```

---

## Task 6: Fix the no-show double-charge (H-1)

**Files:**

- Modify: `src/features/booking/admin-actions-core.ts` (`markNoShowCore`, ~lines 100-114)
- Test: `src/features/booking/booking-service.test.ts` (add cases near the existing no-show test at ~line 839) OR a focused new file `src/features/booking/no-show-debt.test.ts` if the existing no-show test needs the full repo mock. Prefer adding to the existing describe if it already mocks `getBookingWithPayments` + `insertDebit`.

**Interfaces:**

- No signature change. `markNoShowCore` now nets the debt against `paidCents`.

- [ ] **Step 1: Write the failing test**

Add to the no-show describe in `booking-service.test.ts` (mirror the existing no-show test's repo mock; set `payments` so `paidCents` = finalCents for the prepaid case):

```ts
it("no-show on a fully-prepaid booking writes NO debit (already paid)", async () => {
  // Arrange a confirmed booking, final $30, with a succeeded $30 payment.
  // (Copy the existing no-show test's setup; set payments to one succeeded 3000.)
  // Act: markNoShowCore(...)
  // Assert: insertDebit was NOT called; status transitioned to no_show.
  expect(insertDebit).not.toHaveBeenCalled();
});

it("no-show on an unpaid booking writes the full no-show charge", async () => {
  // payments: [] → paidCents 0, no_show_charge_pct 100 → debit 3000.
  expect(insertDebit).toHaveBeenCalledWith(
    expect.objectContaining({ amount_cents: 3000, reason: "no_show" }),
  );
});

it("no-show on a partially-paid booking writes the remainder", async () => {
  // payments: one succeeded 1000 → paidCents 1000; charge 3000 → debit 2000.
  expect(insertDebit).toHaveBeenCalledWith(
    expect.objectContaining({ amount_cents: 2000, reason: "no_show" }),
  );
});
```

> Fill the arrange/act bodies by copying the existing no-show test in the same file (it already builds a `getBookingWithPayments` mock + `getSettings` returning `no_show_charge_pct: 100`). The only variation between the three is the `payments` array.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t "no-show"`
Expected: the prepaid case FAILS (a 3000 debit is currently inserted).

- [ ] **Step 3: Fix `markNoShowCore`**

In `admin-actions-core.ts`, replace the debt block (~lines 100-114) so it subtracts what was already paid:

```ts
const settings = await repo.getSettings();
const paidCents = booking.payments
  .filter((p) => p.status === "succeeded")
  .reduce((sum, p) => sum + p.amountCents, 0);
const chargeCents = computeCancellationDebtCents({
  finalCents: booking.finalCents,
  reason: "no_show",
  lateRefundPct: settings.late_cancel_refund_pct,
  noShowChargePct: settings.no_show_charge_pct,
});
// Net against captured payment so a prepaid no-show is not double-charged.
const debtCents = Math.max(0, chargeCents - paidCents);
if (debtCents > 0) {
  await repo.insertDebit({
    client_id: booking.client_id,
    booking_id: booking.id,
    amount_cents: debtCents,
    reason: "no_show",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/booking/booking-service.test.ts -t "no-show"`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/booking/admin-actions-core.ts src/features/booking/booking-service.test.ts
git commit -m "fix(booking): net no-show charge against amount already paid"
```

---

## Task 7: `resolution` column on `client_debits`

**Files:**

- Create: `supabase/migrations/20260712120000_debit_resolution.sql`
- Modify: `src/features/admin/clients-actions.ts` (`ClientDebitRow` type ~line 152-158; the debit `.select(...)` query; the debit mapping ~line 296-301)
- Modify: `src/features/payments/client-balance.ts` (add the audit clarifying comment for H-2 here — see Task 10; keep in this task if convenient, else defer)

**Interfaces:**

- Produces: `ClientDebitRow` gains `resolution: string | null`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260712120000_debit_resolution.sql`:

```sql
-- Record HOW a debit was cleared/changed, for admin reporting. Does not affect
-- the outstanding-balance projection (that still keys off settled_at is null).
alter table client_debits
  add column resolution text
    check (resolution in ('paid', 'waived', 'adjusted'));
```

- [ ] **Step 2: Apply locally**

Run: `npx supabase migration up` (or the repo's documented local-migrate command — check DESIGN/memory `deploy-env-topology`).
Expected: applies cleanly; `resolution` column present.

- [ ] **Step 3: Thread `resolution` through the read model**

In `clients-actions.ts`:

- Add `resolution: string | null;` to `ClientDebitRow`.
- In the `client_debits` select for the detail query, add `resolution` to the selected columns (grep the `.from("client_debits").select(` in that file).
- In the debit mapping (~line 296-301) add: `resolution: (debit.resolution as string | null) ?? null,`.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add supabase/migrations/20260712120000_debit_resolution.sql src/features/admin/clients-actions.ts
git commit -m "feat(payments): record debit resolution reason"
```

---

## Task 8: Admin waive + adjust actions

Mirror `settleDebitCore`/`settleDebit` in `clients-actions.ts` (direct service-role update after `assertActorIsAdmin`, then `revalidatePath`). Set `resolution` on all three clear/change paths.

**Files:**

- Modify: `src/features/admin/clients-actions.ts` (update `settleDebitCore`; add `waiveDebitCore`/`waiveDebit`, `adjustDebitCore`/`adjustDebit`)
- Modify: `src/features/admin/index.ts` (export `waiveDebit`, `adjustDebit` next to `settleDebit`)
- Create: `src/features/admin/adjust-amount.ts` (pure amount validator) + test
- Test: `src/features/admin/adjust-amount.test.ts` (unit — the gate); `src/features/admin/admin.test.ts` (integration — runs only with local stack)

**Interfaces:**

- Produces:

  ```ts
  export function parseAdjustAmountCents(raw: unknown): number | null; // null = invalid
  export async function waiveDebitCore(
    deps: AdminDeps,
    debitId: string,
  ): Promise<ClientMutationResult>;
  export async function waiveDebit(
    debitId: string,
    clientId: string,
  ): Promise<ClientMutationResult>;
  export async function adjustDebitCore(
    deps: AdminDeps,
    debitId: string,
    newAmountCents: number,
  ): Promise<ClientMutationResult>;
  export async function adjustDebit(
    debitId: string,
    clientId: string,
    newAmountCents: number,
  ): Promise<ClientMutationResult>;
  ```

- [ ] **Step 1: Write the failing unit test for the amount validator**

`src/features/admin/adjust-amount.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAdjustAmountCents } from "./adjust-amount";

describe("parseAdjustAmountCents", () => {
  it("accepts a positive integer", () => {
    expect(parseAdjustAmountCents(2000)).toBe(2000);
  });
  it("rejects zero (a full clear is a waive, not an adjust)", () => {
    expect(parseAdjustAmountCents(0)).toBeNull();
  });
  it("rejects negatives, non-integers, and non-numbers", () => {
    expect(parseAdjustAmountCents(-5)).toBeNull();
    expect(parseAdjustAmountCents(12.5)).toBeNull();
    expect(parseAdjustAmountCents("2000")).toBeNull();
    expect(parseAdjustAmountCents(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/admin/adjust-amount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

`src/features/admin/adjust-amount.ts`:

```ts
import { z } from "zod";

const schema = z.number().int().positive();

/** Parse an admin-entered adjust amount (cents). Returns null when invalid.
 * Zero is rejected on purpose — clearing a debit entirely is a waive. */
export function parseAdjustAmountCents(raw: unknown): number | null {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/admin/adjust-amount.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `settleDebitCore` + add waive/adjust cores + actions**

In `clients-actions.ts`:

Update `settleDebitCore`'s update to also set resolution:

```ts
    .update({ settled_at: new Date().toISOString(), resolution: "paid" })
```

Add after `settleDebit`:

```ts
export async function waiveDebitCore(
  deps: AdminDeps,
  debitId: string,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(debitId).success) {
    return { kind: "validation_error", message: "Invalid debit id" };
  }
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ settled_at: new Date().toISOString(), resolution: "waived" })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function waiveDebit(
  debitId: string,
  clientId: string,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await waiveDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}

export async function adjustDebitCore(
  deps: AdminDeps,
  debitId: string,
  newAmountCents: number,
): Promise<ClientMutationResult> {
  if (!(await assertActorIsAdmin(deps.serviceClient, deps.actorUserId))) {
    return { kind: "forbidden" };
  }
  if (!uuidSchema.safeParse(debitId).success) {
    return { kind: "validation_error", message: "Invalid debit id" };
  }
  const amount = parseAdjustAmountCents(newAmountCents);
  if (amount === null) {
    return {
      kind: "validation_error",
      message: "Amount must be a positive whole number of cents",
    };
  }
  // Only adjust debits that are still outstanding.
  const { error } = await deps.serviceClient
    .from("client_debits")
    .update({ amount_cents: amount, resolution: "adjusted" })
    .eq("id", debitId)
    .is("settled_at", null);
  if (error) return { kind: "error", message: error.message };
  return { kind: "success" };
}

export async function adjustDebit(
  debitId: string,
  clientId: string,
  newAmountCents: number,
): Promise<ClientMutationResult> {
  const actorUserId = await getActorOrRedirect();
  const result = await adjustDebitCore(
    { serviceClient: createServiceClient(), actorUserId },
    debitId,
    newAmountCents,
  );
  if (result.kind === "success") revalidatePath(`/admin/clients/${clientId}`);
  return result;
}
```

Add `import { parseAdjustAmountCents } from "./adjust-amount";` at the top of `clients-actions.ts`.

In `src/features/admin/index.ts`, add `waiveDebit` and `adjustDebit` to the export that currently lists `settleDebit`.

- [ ] **Step 6: Add integration tests (run when local stack is up)**

In `admin.test.ts`, near the existing `settleDebitCore` test (~line 665), add cases: waive sets `resolution='waived'` + `settled_at`; adjust changes `amount_cents` + sets `resolution='adjusted'`; adjust with a settled debit is a no-op (guarded by `.is("settled_at", null)`); non-admin actor → `forbidden`. Mirror the existing test's debit-insert setup.

- [ ] **Step 7: Gate + commit**

Run (the blocking gate): `npm run typecheck && npx vitest run src/features/admin/adjust-amount.test.ts`
Expected: clean + PASS.
If the local Supabase stack is up, also run: `npx vitest run src/features/admin/admin.test.ts` and confirm the new cases pass.

```bash
git add src/features/admin/clients-actions.ts src/features/admin/index.ts src/features/admin/adjust-amount.ts src/features/admin/adjust-amount.test.ts src/features/admin/admin.test.ts
git commit -m "feat(admin): waive and adjust client debits"
```

---

## Task 9: Admin Balance UI — Waive + Adjust

Invoke `frontend-design` first. Waive reuses `confirm()`. Adjust needs a numeric input, so build a small dialog using the shared dialog-shell classes.

**Files:**

- Create: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/adjust-debit-dialog.tsx`
- Modify: `src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx` (imports; the Balance section debit row ~line 481-526)

**Interfaces:**

- Consumes: `waiveDebit`, `adjustDebit` from `@/features/admin`; existing `settleDebit`, `useConfirm`, `useToast`, `run`/`isPending` transition already in the file.

- [ ] **Step 1: Build the adjust dialog**

`adjust-debit-dialog.tsx` — a controlled base-ui `Dialog` (follow `dialog-shell` usage from `confirm-dialog.tsx`) with a dollar-denominated number input, Cancel/Save. On Save it converts dollars→cents (`Math.round(dollars * 100)`) and calls back `onSave(cents)`. Keep it presentational; the parent wires `adjustDebit`. Prefill the input with the debit's current amount in dollars. Validate client-side that the value is > 0 before enabling Save.

- [ ] **Step 2: Add Waive + Adjust controls to the debit row**

In `client-detail-client.tsx`, in the unsettled-debit branch (currently just the "Mark settled" button, ~line 496-521), add alongside it:

- a **Waive** outline button → `confirm({ title: "Waive this $X balance?", description: "Forgives the debt without collecting. Cannot be undone.", confirmLabel: "Waive", destructive: false })` then `run(() => waiveDebit(debit.id, client.id), () => toast.add({ type: "success", title: "Debit waived" }))`.
- an **Adjust** outline button → opens `AdjustDebitDialog`; on save `run(() => adjustDebit(debit.id, client.id, cents), () => toast.add({ type: "success", title: "Debit adjusted" }))`.

In the settled branch (currently `<span>settled</span>`, ~line 493-494), show the resolution label when present, e.g. `settled · {debit.resolution ?? "paid"}` (map `waived`→"waived", `adjusted`→"adjusted", `paid`→"paid").

Copy the exact `confirm`/`run`/`toast` idioms already used by the Mark-settled button so behavior matches.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npx eslint "src/app/(site)/(admin)/admin/clients/[clientId]/_components/adjust-debit-dialog.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(site)/(admin)/admin/clients/[clientId]/_components/adjust-debit-dialog.tsx" "src/app/(site)/(admin)/admin/clients/[clientId]/_components/client-detail-client.tsx"
git commit -m "feat(admin): waive and adjust controls on client balance"
```

---

## Task 10: H-2 doc correction + audit record + finalize

**Files:**

- Modify: `src/features/payments/client-balance.ts` (clarifying comment)
- Modify: `docs/DESIGN.md` (if it has a cancellation/debt section, note "outstanding balance does not gate booking by current design"; grep `debt`/`gate re-booking` first)
- Move: `docs/superpowers/plans/2026-07-12-client-cancel-owing-audit.md` → `docs/superpowers/plans/archive/` (git mv, only after Definition of Done met)

- [ ] **Step 1: Add the H-2 clarifying comment**

At the top of `src/features/payments/client-balance.ts`, extend the file doc-comment:

```ts
/** Outstanding-balance math for a client's debits. Pure (ENGINEERING #5).
 *
 * AUDIT NOTE (owing system): outstanding balance is a REPORTING projection only.
 * It does NOT gate booking creation anywhere in the app — a client with an
 * unsettled debit can still book. (The historical client_debits migration
 * comment calling debits a "re-booking gate" describes intent that was never
 * wired; no gate exists by current design.) Settled AND waived debits both drop
 * out of the sum (settled_at is non-null); `resolution` records which.
 */
```

- [ ] **Step 2: Verify the H-2 claim is still true**

Run: `git grep -nE "outstandingBalanceCents|getOutstandingDebtCents" -- src` and confirm no call site sits in a booking-creation guard (create-booking mutation / actions). Expected: only admin read surfaces + the repo method. If a gate DOES exist, STOP and escalate — the audit finding is wrong.

- [ ] **Step 3: Run the full scoped gate for this plan's pure code**

Run:

```
npx vitest run src/features/booking/client-can-cancel.test.ts src/features/booking/cancellation.test.ts "src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.test.ts" src/features/admin/adjust-amount.test.ts
npm run typecheck
npx eslint . 2>&1 | tail -20
npx prettier --check .
node scripts/check-doc-links.mjs
```

Expected: all pass. (Two known pre-existing failures — `back-to-top.test.tsx` and the `admin.test.ts` honeypot assertion — are out of scope; don't let them block, and don't run the full `vitest` as the gate.)

- [ ] **Step 4: `/code-review` the branch diff**

Invoke `superpowers:requesting-code-review` / `/code-review` over the full set of commits. Triage findings via `superpowers:receiving-code-review`.

- [ ] **Step 5: Manual `verify`**

Invoke the `verify` skill. Drive the running app:

1. As a client, cancel an upcoming unpaid booking → dialog shows "No charge." → cancels, status flips to Cancelled.
2. Cancel a paid booking outside the cutoff → "You'll be refunded $X." (verify refund initiated).
3. Cancel a paid booking inside the cutoff → "refunded $Y now. Cal may refund the remaining $Z."
4. Confirm a started/terminal booking shows the lock copy, no Cancel button.
5. As admin, on a client with a debit: Waive (row → settled · waived), Adjust to a new amount (amount changes, row → adjusted), Mark settled (→ paid).
6. Confirm a prepaid no-show (admin mark no-show on a fully-paid booking) writes NO new debit.

- [ ] **Step 6: Commit docs + archive the plan**

```bash
git add src/features/payments/client-balance.ts docs/DESIGN.md
git commit -m "docs: record owing-system audit findings"
git mv docs/superpowers/plans/2026-07-12-client-cancel-owing-audit.md docs/superpowers/plans/archive/
git commit -m "docs: archive completed client-cancel and owing-audit plan"
```

---

## Definition of Done

- Scoped unit tests green: `client-can-cancel`, `cancellation` (`previewCancellation`), `cancel-outcome-copy`, no-show net cases, `adjust-amount`.
- `npm run typecheck` + ESLint + Prettier clean; TS strict, no `any`.
- Migration applied locally; `resolution` column present; `admin.test.ts` waive/adjust cases pass when the stack is up.
- `/code-review` clean (cross-model where practical); findings triaged.
- Manual `verify` of the six flows above.
- Conventional commits on `main`, subject line only; completed plan archived.

## Handoff log

(Implementer appends escalations here.)

---

## Self-Review

- **Spec coverage:** Group C predicate (T1) ✓; truthful preview projection (T2) + core reuse (T3) ✓; preview action (T4) ✓; CancelCell + row (T5) ✓; meet-greet cancellable (T1 has no meet-greet gate; T5 verify covers it) ✓; H-1 no-show fix (T6) ✓; `resolution` schema (T7) ✓; waive+adjust cores/actions (T8) + UI (T9) ✓; H-2 doc correction + audit record (T10) ✓; DoD gates (T10) ✓. No spec requirement left without a task.
- **Placeholders:** none — every code step carries full code; the two "copy the existing test setup" steps (T6, T8-integration) point at a named existing test to mirror rather than inventing a repo mock inline, which is a real instruction, not a TODO.
- **Type consistency:** `CancellationOutcome` shape (tier/refundCents/remainderCents/debtCents) identical across T2, T4, T5. `ClientMutationResult` reused from `clients-actions.ts` for T8. `CancellabilityInput` used in T1 and T5. `parseAdjustAmountCents` defined in T8 and consumed in the same task. Predicate returns `{ cancellable }` (not `{ editable }`) consistently.
