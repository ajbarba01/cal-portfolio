# SP4b — Payments harden (refund re-model + reconcile + disputes + copy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a retained-half refund representable and projected correctly, auto-reconcile overpays, persist disputes, harden the reuse path against a 404, and render payment-policy email copy from settings — without regressing any payment seam.

**Architecture:** Refund tracking moves to a cumulative `payments.refunded_cents` column written from Stripe's `charge.amount_refunded`; the pure `computePaymentStatus` projection gains a `partially_refunded` state with `paid` checked first (overpay-safe). The webhook stays the **sole writer** of `bookings.payment_status` and gains an _optional_ `PaymentGateway` only to _initiate_ the overpay refund (the resulting `charge.refunded` still does the projection write). Disputes write marker columns only. All money is server-derived; the gateway is faked in tests (no network).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · `stripe` (server) · Supabase (local stack) · Vitest · Zod.

**Spec:** [2026-06-10-sp4-payments-design.md](../specs/2026-06-10-sp4-payments-design.md) — implements the **SP4b** slice (PAY3, PAY5, PAY6 `charge.dispute.*` half, PAY7) + the PAY4 reuse-path 404-guard carried over from 4a. Decisions are recorded under the spec's **"SP4b decisions (2026-06-11)"** section — do not re-litigate them here.

**Findings owned:** PAY3, PAY5, PAY6 (`charge.dispute.*`), PAY7 (+ the 4a carry-over 404-guard).

## Prerequisites (maintainer, before execution)

- Local Supabase stack running (`npx supabase status`). Migrations apply **local-first** — do **not** push to prod without an explicit ask (see the `deploy-env-topology` memory).
- `.env.local` has the Stripe TEST keys + `STRIPE_WEBHOOK_SECRET` (in place since 4a). Stripe CLI installed for the live verify (Task 9).
- `.env.test` present for the integration suite (fake gateway — no real key needed for `npm test`).

## File structure

- `supabase/migrations/<ts>_payment_partially_refunded_enum.sql` — **new** · `alter type payment_status add value 'partially_refunded'` (own migration; a new enum value can't be used in the txn that adds it — repo precedent `20260608120000_...meet_greet_enum.sql:54`).
- `supabase/migrations/<ts>_payment_refund_dispute_columns.sql` — **new** · `payments.refunded_cents`, `payments.disputed_at`, `payments.dispute_status`.
- `src/features/payments/types.ts` — `PaymentTxn` gains `refundedCents`; `PaymentGateway.refund` gains an optional `idempotencyKey`.
- `src/features/payments/projection.ts` — revised `computePaymentStatus` (`partially_refunded`, paid-first) + `amountOwedCents` netting + extended `BookingPaymentStatus` union (the only booking-level union; no generated DB types in this repo).
- `src/features/payments/projection.test.ts` — new + updated cases.
- `src/features/payments/webhook-core.ts` — cumulative-refund write (PAY3), dispute handler (PAY6), overpay reconcile + optional gateway (PAY5).
- `src/features/payments/stripe-gateway.ts` — `refund` idempotency-key arg.
- `src/features/payments/create-intent.ts` — 404-guard the reuse path; select + net `refunded_cents`.
- `src/features/payments/payments.test.ts` — webhook + reuse integration tests.
- the Stripe webhook route (locate via grep `applyStripeEvent(`) — pass a real `StripeGateway`.
- `src/features/notifications/emails.ts` + `send-booking-emails.ts` + `emails.test.ts` — payment-policy lines from settings (PAY7).
- `docs/DESIGN.md` — data-model + `:197` corrections (same-commit rule).
- `scripts/db-seed/factories.ts` + `scripts/db-seed/scenarios.ts` — `partially_refunded` support + a seeded booking.
- `docs/superpowers/specs/2026-06-10-audit-findings.md` — prune PAY3/PAY5/PAY6/PAY7 (close-out).

---

### Task 1: Migrations — `refunded_cents`, dispute columns, `partially_refunded` enum value

**Files:**

- Create: `supabase/migrations/<ts>_payment_partially_refunded_enum.sql`
- Create: `supabase/migrations/<ts>_payment_refund_dispute_columns.sql`
- Modify: `docs/DESIGN.md` (same-commit data-model correction)

Use a timestamp `<ts>` after the latest migration (`20260609120000_...`) — e.g. `20260611120000` (enum) and `20260611120001` (columns); the enum file MUST sort first.

- [ ] **Step 1: Write the enum-value migration**

`supabase/migrations/20260611120000_payment_partially_refunded_enum.sql`:

```sql
-- Add a partial-refund booking-level state. Additive + forward-only (Postgres
-- has no DROP VALUE). In its own migration because a new enum value cannot be
-- USED in the same transaction that adds it (repo precedent:
-- 20260608120000_onboarding_status_and_meet_greet_enum.sql).
alter type payment_status add value if not exists 'partially_refunded';
```

- [ ] **Step 2: Write the columns migration**

`supabase/migrations/20260611120001_payment_refund_dispute_columns.sql`:

```sql
-- Cumulative refunded amount (cents) read from Stripe charge.amount_refunded.
-- A partially-refunded row stays 'succeeded' with refunded_cents > 0; it flips
-- to 'refunded' only when fully refunded.
alter table payments
  add column refunded_cents int not null default 0;

-- Dispute markers (PAY6). Orthogonal to payment_status — a disputed charge can
-- still be paid. Surfaced by SP5; this slice only persists + logs.
alter table payments
  add column disputed_at timestamptz,
  add column dispute_status text;
```

- [ ] **Step 3: Correct DESIGN.md data model (same commit)**

In [docs/DESIGN.md](../../DESIGN.md): on the `bookings` line (`:119`), change the `payment_status` enum to `'unpaid' \| 'paid' \| 'partially_refunded' \| 'refunded'`. On the `payments` line (`:121`), add `· refunded_cents (cumulative, cents) · disputed_at · dispute_status` to the column list. Leave the `:197` "No partial-payment edge case" bullet for Task 2 (it pairs with the projection change).

- [ ] **Step 4: Apply migrations to the local stack**

Run: `npx supabase migration up`
Expected: both migrations apply cleanly; no error. (If the CLI requires a reset, `npx supabase db reset` re-runs migrations + re-seeds the local admin.)

- [ ] **Step 5: Typecheck (no code change yet, sanity) + commit**

Run: `npm run typecheck` → PASS

```bash
git add supabase/migrations/20260611120000_payment_partially_refunded_enum.sql supabase/migrations/20260611120001_payment_refund_dispute_columns.sql docs/DESIGN.md
git commit -m "feat: add refunded_cents, dispute columns, partially_refunded status"
```

---

### Task 2: Re-model the projection — `partially_refunded`, paid-first, refund netting (PAY3, pure side)

Pure projection + the read-side `PaymentTxn` builders. Money math only; no webhook write logic yet. Keeps typecheck + the full suite green.

**Files:**

- Modify: `src/features/payments/types.ts`
- Modify: `src/features/payments/projection.ts`
- Modify: `src/features/payments/projection.test.ts`
- Modify: `src/features/payments/webhook-core.ts` (projection read select + map)
- Modify: `src/features/payments/create-intent.ts` (read select + map)
- Modify: `docs/DESIGN.md` (`:197` rewrite, same commit)

- [ ] **Step 1: Add `refundedCents` to `PaymentTxn`**

In `types.ts`:

```typescript
/** A single payment transaction — used as input to the projection. */
export interface PaymentTxn {
  status: "requires_payment" | "succeeded" | "refunded" | "failed";
  amountCents: number;
  /** Cumulative cents refunded against this txn (Stripe charge.amount_refunded). */
  refundedCents: number;
}
```

- [ ] **Step 2: Write the failing projection tests**

In `projection.test.ts`, **add `refundedCents: 0` to every existing `PaymentTxn` literal** (the field is now required), then add this block after the existing `computePaymentStatus` describe:

```typescript
describe("computePaymentStatus — refund re-model (PAY3/PAY5)", () => {
  it("partially_refunded when a refund is present but net is below final", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("partially_refunded");
  });

  it("refunded when the whole captured amount came back", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("refunded");
  });

  it("paid (not partially_refunded) when an overpay duplicate was refunded — net == final", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });

  it("paid when overpaid and not yet reconciled (net > final)", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });

  it("a refund does not mask paid when net still covers final (overpay partial)", () => {
    // captured 12000, refunded 3000 → net 9000 >= 6000 → paid
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
      { status: "succeeded", amountCents: 6000, refundedCents: 0 },
    ];
    expect(computePaymentStatus(6000, txns)).toBe("paid");
  });
});

describe("amountOwedCents — nets refunds", () => {
  it("owes the retained half after a partial refund", () => {
    const txns: PaymentTxn[] = [
      { status: "succeeded", amountCents: 6000, refundedCents: 3000 },
    ];
    expect(amountOwedCents(6000, txns)).toBe(3000);
  });

  it("owes full again after a complete refund", () => {
    const txns: PaymentTxn[] = [
      { status: "refunded", amountCents: 6000, refundedCents: 6000 },
    ];
    expect(amountOwedCents(6000, txns)).toBe(6000);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/features/payments/projection.test.ts`
Expected: FAIL — `partially_refunded` not returned; netting not applied; type errors on `refundedCents`.

- [ ] **Step 4: Implement the revised projection**

Replace the body of `projection.ts` below the imports:

```typescript
export type BookingPaymentStatus =
  | "unpaid"
  | "paid"
  | "partially_refunded"
  | "refunded";

/** Captured money = succeeded + (now-refunded) rows; refunds tracked separately. */
function sums(txns: PaymentTxn[]): {
  capturedSum: number;
  refundedSum: number;
} {
  const capturedSum = txns
    .filter((t) => t.status === "succeeded" || t.status === "refunded")
    .reduce((acc, t) => acc + t.amountCents, 0);
  const refundedSum = txns.reduce((acc, t) => acc + t.refundedCents, 0);
  return { capturedSum, refundedSum };
}

/**
 * Derives the booking-level payment status from transaction history.
 *
 * Precedence (paid FIRST — overpay-safe): a refund that does not drop net paid
 * below the bill keeps the booking 'paid' (the PAY5 overpay-reconcile case);
 * the late-cancel retained-half case (net < final) falls through to
 * 'partially_refunded'; a full refund (net 0) resolves to 'refunded'.
 */
export function computePaymentStatus(
  finalCents: number,
  txns: PaymentTxn[],
): BookingPaymentStatus {
  const { capturedSum, refundedSum } = sums(txns);
  const netPaid = capturedSum - refundedSum;

  if (finalCents > 0 && netPaid >= finalCents) return "paid";
  if (capturedSum > 0 && refundedSum >= capturedSum) return "refunded";
  if (refundedSum > 0) return "partially_refunded";
  return "unpaid";
}

/** Cents still owed after netting succeeded payments against refunds. Clamps to 0. */
export function amountOwedCents(
  finalCents: number,
  txns: PaymentTxn[],
): number {
  const { capturedSum, refundedSum } = sums(txns);
  return Math.max(0, finalCents - (capturedSum - refundedSum));
}
```

- [ ] **Step 5: Thread `refunded_cents` through the read-side builders**

In `webhook-core.ts`, `projectBookingPaymentStatus`: change the select to `"final_cents, payments(status, amount_cents, refunded_cents)"`, widen the inner cast to `Array<{ status: string; amount_cents: number; refunded_cents: number }>`, and add `refundedCents: p.refunded_cents` to the mapped `PaymentTxn`.

In `create-intent.ts`: change the booking select to `"id, client_id, final_cents, payments(status, amount_cents, refunded_cents)"`; add `refunded_cents: number` to the local `PaymentRow` interface; add `refundedCents: p.refunded_cents` to the `txns` map.

- [ ] **Step 6: Rewrite the DESIGN.md `:197` bullet (same commit)**

Replace the "No partial-payment edge case" bullet (`docs/DESIGN.md:197`) with one stating partial payment is now representable, e.g.:

```markdown
- **Partial-refund state is modeled:** a full prepay that gets a `late_cancel_refund_pct` (~50%) refund leaves a `succeeded` `payments` row with `refunded_cents` set and projects to `partially_refunded` — the retained half is representable. (Was previously claimed impossible; corrected with SP4b's `refunded_cents` re-model.)
```

- [ ] **Step 7: Run projection tests + full payments suite + typecheck**

Run: `npx vitest run src/features/payments/projection.test.ts` → PASS
Run: `npx vitest run src/features/payments/payments.test.ts` → PASS (read-side change is inert; rows default `refunded_cents` 0)
Run: `npm run typecheck` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/payments/types.ts src/features/payments/projection.ts src/features/payments/projection.test.ts src/features/payments/webhook-core.ts src/features/payments/create-intent.ts docs/DESIGN.md
git commit -m "feat: project partially_refunded status from cumulative refunds"
```

---

### Task 3: Webhook writes cumulative `refunded_cents` on `charge.refunded` (PAY3, webhook side)

Replace the all-or-nothing `charge.refunded → refunded` flip with a cumulative write: read `amount_refunded` off the charge, store it forward-only (max), flip status to `refunded` only when it reaches the captured amount.

**Files:**

- Modify: `src/features/payments/webhook-core.ts`
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Write the failing tests**

In `payments.test.ts`, inside the `applyStripeEvent` describe (mirror the existing seed helpers `seedBooking`/`seedPayment` already used in this file):

```typescript
it("charge.refunded (partial) → refunded_cents set, row stays succeeded, partially_refunded", async () => {
  const intent = `pi_partial_${ts}`;
  const b = await seedBooking(userId1, 6000, 700);
  await seedPayment(b, userId1, intent, 6000, "succeeded");

  const result = await applyStripeEvent(serviceClient, {
    type: "charge.refunded",
    data: {
      object: { payment_intent: intent, amount: 6000, amount_refunded: 3000 },
    },
  });
  expect(result.ok).toBe(true);

  const { data: payment } = await serviceClient
    .from("payments")
    .select("status, refunded_cents")
    .eq("stripe_payment_intent_id", intent)
    .single();
  expect(payment?.status).toBe("succeeded");
  expect(payment?.refunded_cents).toBe(3000);

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("payment_status, status")
    .eq("id", b)
    .single();
  expect(booking?.payment_status).toBe("partially_refunded");
  expect(booking?.status).toBe("confirmed"); // never touched

  await serviceClient.from("payments").delete().eq("booking_id", b);
  await serviceClient.from("bookings").delete().eq("id", b);
});

it("charge.refunded (full) → row refunded, booking refunded", async () => {
  const intent = `pi_full_${ts}`;
  const b = await seedBooking(userId1, 6000, 900);
  await seedPayment(b, userId1, intent, 6000, "succeeded");

  await applyStripeEvent(serviceClient, {
    type: "charge.refunded",
    data: {
      object: { payment_intent: intent, amount: 6000, amount_refunded: 6000 },
    },
  });

  const { data: payment } = await serviceClient
    .from("payments")
    .select("status, refunded_cents")
    .eq("stripe_payment_intent_id", intent)
    .single();
  expect(payment?.status).toBe("refunded");
  expect(payment?.refunded_cents).toBe(6000);

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("payment_status")
    .eq("id", b)
    .single();
  expect(booking?.payment_status).toBe("refunded");

  await serviceClient.from("payments").delete().eq("booking_id", b);
  await serviceClient.from("bookings").delete().eq("id", b);
});

it("charge.refunded re-delivery is forward-only (never lowers refunded_cents)", async () => {
  const intent = `pi_redeliver_${ts}`;
  const b = await seedBooking(userId1, 6000, 1100);
  await seedPayment(b, userId1, intent, 6000, "succeeded");

  const ev = (amt: number) => ({
    type: "charge.refunded",
    data: {
      object: { payment_intent: intent, amount: 6000, amount_refunded: amt },
    },
  });
  await applyStripeEvent(serviceClient, ev(3000));
  await applyStripeEvent(serviceClient, ev(1000)); // stale/out-of-order, lower

  const { data: payment } = await serviceClient
    .from("payments")
    .select("refunded_cents")
    .eq("stripe_payment_intent_id", intent)
    .single();
  expect(payment?.refunded_cents).toBe(3000); // not lowered

  await serviceClient.from("payments").delete().eq("booking_id", b);
  await serviceClient.from("bookings").delete().eq("id", b);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/payments/payments.test.ts -t "charge.refunded"`
Expected: FAIL — current handler flips status to `refunded` regardless and never writes `refunded_cents`.

- [ ] **Step 3: Extend the charge schema + add the cumulative-refund helper**

In `webhook-core.ts`, replace `chargeObjectSchema` with one that also extracts the amounts:

```typescript
const chargeObjectSchema = z
  .object({
    payment_intent: z.union([z.string(), z.object({ id: z.string() })]),
    amount: z.number(),
    amount_refunded: z.number(),
  })
  .transform((c) => ({
    payment_intent:
      typeof c.payment_intent === "string"
        ? c.payment_intent
        : c.payment_intent.id,
    amount: c.amount,
    amountRefunded: c.amount_refunded,
  }));
```

Add a helper alongside `applyPaymentIntentStatus`:

```typescript
/**
 * Writes the cumulative refunded amount (Stripe charge.amount_refunded) onto the
 * matching payments row. Forward-only (max), so a re-delivered/out-of-order event
 * never lowers it. The row flips to 'refunded' only when fully refunded; a partial
 * refund leaves it 'succeeded' with refunded_cents > 0. NEVER touches bookings.status.
 */
async function applyChargeRefund(
  serviceClient: SupabaseClient,
  intentId: string,
  amountRefunded: number,
): Promise<ApplyResult> {
  const { data: payment, error: fetchError } = await serviceClient
    .from("payments")
    .select("id, booking_id, amount_cents, refunded_cents")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();

  if (fetchError)
    return { ok: false, error: `DB error: ${fetchError.message}` };
  if (!payment) return { ok: true, handled: false };

  const newRefunded = Math.max(
    payment.refunded_cents as number,
    amountRefunded,
  );
  const fullyRefunded = newRefunded >= (payment.amount_cents as number);

  const { error: updateError } = await serviceClient
    .from("payments")
    .update({
      refunded_cents: newRefunded,
      status: fullyRefunded ? "refunded" : "succeeded",
    })
    .eq("id", payment.id);

  if (updateError) {
    return {
      ok: false,
      error: `Failed to update payment refund: ${updateError.message}`,
    };
  }

  return projectBookingPaymentStatus(
    serviceClient,
    payment.booking_id as string,
  );
}
```

- [ ] **Step 4: Re-point the `charge.refunded` case at the new helper**

Replace the `case "charge.refunded"` body so it returns `applyChargeRefund(serviceClient, parsed.data.payment_intent, parsed.data.amountRefunded)` (keep the `safeParse` + malformed guard, update the error message to mention amounts).

- [ ] **Step 5: Run to verify they pass + no regressions**

Run: `npx vitest run src/features/payments/payments.test.ts` → PASS
Run: `npm run typecheck` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/payments/webhook-core.ts src/features/payments/payments.test.ts
git commit -m "feat: track cumulative refunded amount on charge.refunded"
```

---

### Task 4: Auto-reconcile overpays (PAY5) — refund idempotency key + optional webhook gateway

**Files:**

- Modify: `src/features/payments/types.ts`
- Modify: `src/features/payments/stripe-gateway.ts`
- Modify: `src/features/payments/webhook-core.ts`
- Modify: the Stripe webhook route (locate: `grep -rl "applyStripeEvent(" src/app`)
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Add an idempotency key to `gateway.refund`**

In `types.ts`, extend the interface method:

```typescript
  /**
   * Initiate a refund of `amountCents` against a PaymentIntent. Optional
   * idempotencyKey makes the overpay-reconcile refund safe under webhook
   * re-delivery (same key → same Stripe refund). The resulting charge.refunded
   * webhook re-projects payment_status — this call NEVER writes payment_status.
   */
  refund(
    paymentIntentId: string,
    amountCents: number,
    idempotencyKey?: string,
  ): Promise<void>;
```

In `stripe-gateway.ts`, implement it:

```typescript
  async refund(
    paymentIntentId: string,
    amountCents: number,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.stripe.refunds.create(
      { payment_intent: paymentIntentId, amount: amountCents },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    // payment_status is re-projected by the charge.refunded webhook — never here.
  }
```

- [ ] **Step 2: Write the failing reconcile tests**

In `payments.test.ts`. The fake gateway in this file already records calls — confirm it has a `refunds` recorder; if not, add `public refunds: Array<{ id: string; amount: number; key?: string }> = [];` and push `{ id, amount, key }` in `refund`. Then:

```typescript
describe("applyStripeEvent — overpay reconcile (PAY5)", () => {
  it("auto-refunds the excess when two intents both succeed", async () => {
    const gw = new FakeGateway();
    const b = await seedBooking(userId1, 6000, 1300);
    const i1 = `pi_over_a_${ts}`;
    const i2 = `pi_over_b_${ts}`;
    await seedPayment(b, userId1, i1, 6000, "succeeded");
    await seedPayment(b, userId1, i2, 6000, "succeeded");

    // The second succeeded event triggers reconcile.
    const result = await applyStripeEvent(
      serviceClient,
      { type: "payment_intent.succeeded", data: { object: { id: i2 } } },
      gw,
    );
    expect(result.ok).toBe(true);
    expect(gw.refunds).toHaveLength(1);
    expect(gw.refunds[0]?.amount).toBe(6000); // the excess
    expect(gw.refunds[0]?.id).toBe(i2); // most-recent succeeded intent
    expect(gw.refunds[0]?.key).toBeTruthy();

    await serviceClient.from("payments").delete().eq("booking_id", b);
    await serviceClient.from("bookings").delete().eq("id", b);
  });

  it("does not refund when paid amount equals final", async () => {
    const gw = new FakeGateway();
    const b = await seedBooking(userId1, 6000, 1500);
    const intent = `pi_exact_${ts}`;
    await seedPayment(b, userId1, intent, 6000, "succeeded");

    await applyStripeEvent(
      serviceClient,
      { type: "payment_intent.succeeded", data: { object: { id: intent } } },
      gw,
    );
    expect(gw.refunds).toHaveLength(0);

    await serviceClient.from("payments").delete().eq("booking_id", b);
    await serviceClient.from("bookings").delete().eq("id", b);
  });

  it("uses a deterministic idempotency key (re-delivery reuses it)", async () => {
    const gw = new FakeGateway();
    const b = await seedBooking(userId1, 6000, 1700);
    const i1 = `pi_key_a_${ts}`;
    const i2 = `pi_key_b_${ts}`;
    await seedPayment(b, userId1, i1, 6000, "succeeded");
    await seedPayment(b, userId1, i2, 6000, "succeeded");

    const ev = {
      type: "payment_intent.succeeded",
      data: { object: { id: i2 } },
    };
    await applyStripeEvent(serviceClient, ev, gw);
    await applyStripeEvent(serviceClient, ev, gw); // re-delivery, refunded_cents still 0 in fake

    const keys = new Set(gw.refunds.map((r) => r.key));
    expect(keys.size).toBe(1); // same key both times → Stripe would dedupe

    await serviceClient.from("payments").delete().eq("booking_id", b);
    await serviceClient.from("bookings").delete().eq("id", b);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/features/payments/payments.test.ts -t "overpay reconcile"`
Expected: FAIL — `applyStripeEvent` ignores the gateway; no refund issued.

- [ ] **Step 4: Add the optional gateway + reconcile**

In `webhook-core.ts`, import the gateway type: `import type { PaymentTxn, PaymentGateway } from "./types";`. Extend the entry point signature and the succeeded case:

```typescript
export async function applyStripeEvent(
  serviceClient: SupabaseClient,
  event: StripeEventInput,
  gateway?: PaymentGateway,
): Promise<ApplyResult> {
  const { type, data } = event;

  switch (type) {
    case "payment_intent.succeeded": {
      const parsed = paymentIntentObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return { ok: false, error: "Malformed payment_intent object: missing id" };
      }
      const result = await applyPaymentIntentStatus(
        serviceClient,
        parsed.data.id,
        "succeeded",
      );
      if (result.ok && gateway) {
        await reconcileOverpay(serviceClient, gateway, parsed.data.id);
      }
      return result;
    }
    // ...rest unchanged
```

Add the reconcile helper:

```typescript
/**
 * If a booking's net paid exceeds final (two intents both succeeded), refund the
 * excess against the most-recent succeeded intent. The resulting charge.refunded
 * re-projects payment_status (webhook stays the sole writer). Idempotency-keyed +
 * guarded by refunded_cents so a re-delivered succeeded event never double-refunds.
 */
async function reconcileOverpay(
  serviceClient: SupabaseClient,
  gateway: PaymentGateway,
  intentId: string,
): Promise<void> {
  const { data: row } = await serviceClient
    .from("payments")
    .select("booking_id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();
  if (!row) return;

  const { data: booking } = await serviceClient
    .from("bookings")
    .select(
      "final_cents, payments(stripe_payment_intent_id, status, amount_cents, refunded_cents, created_at)",
    )
    .eq("id", row.booking_id as string)
    .maybeSingle();
  if (!booking) return;

  const rows = booking.payments as Array<{
    stripe_payment_intent_id: string;
    status: string;
    amount_cents: number;
    refunded_cents: number;
    created_at: string;
  }>;

  const capturedSum = rows
    .filter((r) => r.status === "succeeded" || r.status === "refunded")
    .reduce((a, r) => a + r.amount_cents, 0);
  const refundedSum = rows.reduce((a, r) => a + r.refunded_cents, 0);
  const finalCents = booking.final_cents as number;
  const excess = capturedSum - refundedSum - finalCents;
  if (excess <= 0) return;

  const target = rows
    .filter((r) => r.status === "succeeded")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!target) return;

  // Deterministic key: stable for this overpay state, so a re-delivered
  // succeeded event (before the refund's charge.refunded lands) reuses it.
  const key = `overpay:${finalCents}:${capturedSum}:${target.stripe_payment_intent_id}`;
  await gateway.refund(target.stripe_payment_intent_id, excess, key);
}
```

- [ ] **Step 5: Pass a real gateway from the webhook route**

Locate the route: `grep -rl "applyStripeEvent(" src/app`. In that handler, construct `const gateway = new StripeGateway();` (import from `@/features/payments` or the local gateway path the file already uses) and pass it as the third arg: `await applyStripeEvent(serviceClient, event, gateway)`. (The `StripeGateway` lazy client means constructing it is always safe.)

- [ ] **Step 6: Run to verify pass + suite + typecheck**

Run: `npx vitest run src/features/payments/payments.test.ts` → PASS
Run: `npm run typecheck` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/payments/types.ts src/features/payments/stripe-gateway.ts src/features/payments/webhook-core.ts src/features/payments/payments.test.ts src/app
git commit -m "feat: auto-refund overpay excess from the webhook"
```

---

### Task 5: Handle dispute webhooks (PAY6) — persist marker + log

**Files:**

- Modify: `src/features/payments/webhook-core.ts`
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
describe("applyStripeEvent — disputes (PAY6)", () => {
  it("charge.dispute.created → stamps disputed_at + status, no payment_status change", async () => {
    const intent = `pi_disp_${ts}`;
    const b = await seedBooking(userId1, 6000, 1900);
    await seedPayment(b, userId1, intent, 6000, "succeeded");

    const result = await applyStripeEvent(serviceClient, {
      type: "charge.dispute.created",
      data: { object: { payment_intent: intent, status: "needs_response" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handled).toBe(true);

    const { data: payment } = await serviceClient
      .from("payments")
      .select("disputed_at, dispute_status, status")
      .eq("stripe_payment_intent_id", intent)
      .single();
    expect(payment?.disputed_at).not.toBeNull();
    expect(payment?.dispute_status).toBe("needs_response");
    expect(payment?.status).toBe("succeeded"); // payment row status untouched

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("payment_status, status")
      .eq("id", b)
      .single();
    expect(booking?.payment_status).toBe("paid"); // unchanged — disputes are orthogonal
    expect(booking?.status).toBe("confirmed");

    await serviceClient.from("payments").delete().eq("booking_id", b);
    await serviceClient.from("bookings").delete().eq("id", b);
  });

  it("charge.dispute.closed updates dispute_status, leaves disputed_at", async () => {
    const intent = `pi_dispclose_${ts}`;
    const b = await seedBooking(userId1, 6000, 2100);
    await seedPayment(b, userId1, intent, 6000, "succeeded");

    await applyStripeEvent(serviceClient, {
      type: "charge.dispute.created",
      data: { object: { payment_intent: intent, status: "needs_response" } },
    });
    await applyStripeEvent(serviceClient, {
      type: "charge.dispute.closed",
      data: { object: { payment_intent: intent, status: "won" } },
    });

    const { data: payment } = await serviceClient
      .from("payments")
      .select("disputed_at, dispute_status")
      .eq("stripe_payment_intent_id", intent)
      .single();
    expect(payment?.dispute_status).toBe("won");
    expect(payment?.disputed_at).not.toBeNull();

    await serviceClient.from("payments").delete().eq("booking_id", b);
    await serviceClient.from("bookings").delete().eq("id", b);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/payments/payments.test.ts -t "disputes"`
Expected: FAIL — events fall through to `default` (`handled:false`); columns never written.

- [ ] **Step 3: Add the dispute schema + handler**

In `webhook-core.ts`, add the schema near the others:

```typescript
/** Dispute object: links to a PaymentIntent (present for PI-created charges). */
const disputeObjectSchema = z.object({
  payment_intent: z.string().nullable(),
  status: z.string(),
});
```

Add the handler alongside the others:

```typescript
/**
 * Persists a dispute marker on the matching payments row + logs. Disputes are
 * orthogonal to payment_status (a disputed charge can still be paid), so this
 * NEVER writes payment_status or bookings.status. SP5 surfaces the markers.
 */
async function applyDispute(
  serviceClient: SupabaseClient,
  intentId: string | null,
  status: string,
  phase: "created" | "closed",
): Promise<ApplyResult> {
  if (!intentId) {
    console.warn(`[stripe] dispute ${phase} with no payment_intent — skipped`);
    return { ok: true, handled: false };
  }

  const { data: payment, error: fetchError } = await serviceClient
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();

  if (fetchError)
    return { ok: false, error: `DB error: ${fetchError.message}` };
  if (!payment) return { ok: true, handled: false };

  const patch =
    phase === "created"
      ? { disputed_at: new Date().toISOString(), dispute_status: status }
      : { dispute_status: status };

  const { error: updateError } = await serviceClient
    .from("payments")
    .update(patch)
    .eq("id", payment.id);

  if (updateError) {
    return {
      ok: false,
      error: `Failed to record dispute: ${updateError.message}`,
    };
  }

  console.info(`[stripe] dispute ${phase} for intent ${intentId} → ${status}`);
  return { ok: true, handled: true };
}
```

Add the cases (before `default`):

```typescript
    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const parsed = disputeObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return { ok: false, error: "Malformed dispute object" };
      }
      const phase = type === "charge.dispute.created" ? "created" : "closed";
      return applyDispute(
        serviceClient,
        parsed.data.payment_intent,
        parsed.data.status,
        phase,
      );
    }
```

- [ ] **Step 4: Run to verify pass + suite + typecheck**

Run: `npx vitest run src/features/payments/payments.test.ts` → PASS
Run: `npm run typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/payments/webhook-core.ts src/features/payments/payments.test.ts
git commit -m "feat: record dispute markers on charge.dispute events"
```

---

### Task 6: Guard the reuse path against a 404 (PAY4 carry-over from 4a)

**Files:**

- Modify: `src/features/payments/create-intent.ts`
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Write the failing tests**

In the existing `runCreatePrepayIntent — intent reuse` describe (extend the `FakeGateway` used there so `retrieveIntent`/`cancelIntent` can be made to throw — e.g. add `public throwOnRetrieve = false;` / `public throwOnCancel = false;` flags consulted in those methods):

```typescript
it("mints fresh when retrieveIntent throws (stale id 404s at Stripe)", async () => {
  const gw = new FakeGateway();
  await runCreatePrepayIntent(
    { sessionClient: sessionClient1, serviceClient, gateway: gw },
    bookingId,
  );
  gw.throwOnRetrieve = true; // the open row's intent 404s
  const again = await runCreatePrepayIntent(
    { sessionClient: sessionClient1, serviceClient, gateway: gw },
    bookingId,
  );
  expect(again.ok).toBe(true);
  expect(gw.created.length).toBeGreaterThanOrEqual(2); // not reused → minted fresh
});

it("tolerates a 404 on cancelIntent for a stale intent", async () => {
  const gw = new FakeGateway();
  await runCreatePrepayIntent(
    { sessionClient: sessionClient1, serviceClient, gateway: gw },
    bookingId,
  );
  gw.statuses.set(FAKE_INTENT_ID, "canceled"); // not reusable → cancel path
  gw.throwOnCancel = true; // cancel 404s
  const again = await runCreatePrepayIntent(
    { sessionClient: sessionClient1, serviceClient, gateway: gw },
    bookingId,
  );
  expect(again.ok).toBe(true); // did not throw; minted fresh
  expect(gw.created.length).toBeGreaterThanOrEqual(2);
});
```

Make the `FakeGateway` methods honor the flags, e.g. `async retrieveIntent(id) { if (this.throwOnRetrieve) throw new Error("404"); ... }` and likewise `cancelIntent`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/payments/payments.test.ts -t "intent reuse"`
Expected: FAIL — the un-guarded `retrieveIntent`/`cancelIntent` throw out of `runCreatePrepayIntent`.

- [ ] **Step 3: Wrap the reuse calls in try/catch**

In `create-intent.ts`, replace the reuse block (the `if (openFull?.stripe_payment_intent_id) { ... }` body) with:

```typescript
if (openFull?.stripe_payment_intent_id) {
  let existing: RetrievedIntent | null = null;
  try {
    existing = await deps.gateway.retrieveIntent(
      openFull.stripe_payment_intent_id,
    );
  } catch {
    // Un-retrievable (e.g. a stale id that 404s at Stripe) → not reusable;
    // fall through to retire the row + mint fresh.
    existing = null;
  }

  const reusable =
    existing !== null &&
    openFull.amount_cents === owed &&
    (existing.status === "requires_payment_method" ||
      existing.status === "requires_confirmation") &&
    existing.clientSecret !== null;

  if (reusable) {
    return { ok: true, clientSecret: existing!.clientSecret! };
  }

  // Stale or amount-changed: cancel at Stripe (tolerate a 404 — already gone)
  // + retire the row, then mint fresh under a non-colliding key.
  try {
    await deps.gateway.cancelIntent(openFull.stripe_payment_intent_id);
  } catch {
    // Already canceled/un-cancelable — fine, we retire the row regardless.
  }
  await deps.serviceClient
    .from("payments")
    .update({ status: "failed" })
    .eq("id", openFull.id);
  idempotencyKey = `prepay:${bookingId}:${owed}:retry-${openFull.stripe_payment_intent_id}`;
}
```

Add `RetrievedIntent` to the `./types` import in `create-intent.ts`.

- [ ] **Step 4: Run to verify pass + full reuse suite + typecheck**

Run: `npx vitest run src/features/payments/payments.test.ts -t "intent reuse"` → PASS
Run: `npx vitest run src/features/payments/payments.test.ts` → PASS
Run: `npm run typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/payments/create-intent.ts src/features/payments/payments.test.ts
git commit -m "fix: tolerate un-retrievable stale intents on prepay reuse"
```

---

### Task 7: Payment-policy email copy from settings (PAY7)

Adds prepay + cancellation-policy lines to the **confirmation** email, rendered from settings, first-person singular voice. No cancellation email is built (deferred to SP6).

**Files:**

- Modify: `src/features/notifications/emails.ts`
- Modify: `src/features/notifications/send-booking-emails.ts`
- Modify: `src/features/notifications/emails.test.ts`
- Modify: `src/features/booking/mutations/create-booking.mutation.ts` (payload site ~L92)
- Modify: `src/features/admin/approval-actions.ts` (payload site ~L216)
- Modify: `src/features/notifications/reminder-cron.test.ts` + `src/features/notifications/notifier.test.ts` (payload/details fixtures — they break typecheck once the fields are required)

> **Wiring note:** `BookingConfirmationDetails` IS the notifier's `booking_confirmed` payload (`notifier.ts` aliases `BookingConfirmedPayload = BookingConfirmationDetails`). Adding required fields to it forces every payload builder + test fixture to supply them — that compile error IS the safety net. Both production sites already have settings access via `repo.getSettings()` (the shape cancel-core reads: `cancellation_full_refund_hours`, `late_cancel_refund_pct`).

- [ ] **Step 1: Write the failing test**

In `emails.test.ts`, extend the confirmation `input` fixture with `cancellationFullRefundHours: 48` + `lateCancelRefundPct: 50`, then add:

```typescript
it("renders the payment policy from settings (not hardcoded), first-person", () => {
  const msg = buildBookingConfirmationEmail({
    to: "c@example.com",
    serviceName: "Dog Walk",
    startsAt: new Date("2026-07-01T15:00:00Z"),
    endsAt: new Date("2026-07-01T16:00:00Z"),
    finalCents: 6000,
    cancellationFullRefundHours: 48,
    lateCancelRefundPct: 50,
  });
  expect(msg.text).toContain("48");
  expect(msg.text).toContain("50%");
  expect(msg.text.toLowerCase()).toContain("prepay");
  expect(msg.html).toContain("48");
  expect(msg.html).toContain("50%");
});

it("reflects different settings values verbatim", () => {
  const msg = buildBookingConfirmationEmail({
    to: "c@example.com",
    serviceName: "Dog Walk",
    startsAt: new Date("2026-07-01T15:00:00Z"),
    endsAt: new Date("2026-07-01T16:00:00Z"),
    finalCents: 6000,
    cancellationFullRefundHours: 24,
    lateCancelRefundPct: 75,
  });
  expect(msg.text).toContain("24");
  expect(msg.text).toContain("75%");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/notifications/emails.test.ts`
Expected: FAIL — type error on the new input fields + policy text absent.

- [ ] **Step 3: Add the fields + policy block to the builder**

In `emails.ts`, extend the input interface:

```typescript
export interface BookingConfirmationInput {
  to: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  finalCents: number;
  /** From settings.cancellation_full_refund_hours — never hardcoded. */
  cancellationFullRefundHours: number;
  /** From settings.late_cancel_refund_pct — never hardcoded. */
  lateCancelRefundPct: number;
}
```

Destructure the two new fields, then add the policy lines. In the `text` array, after the `Total` line and blank line, before `Questions?`:

```typescript
    `Payment`,
    `You can prepay anytime from your bookings page, or pay after your ${serviceName}.`,
    `Cancel ${cancellationFullRefundHours}+ hours before the start and I refund you in full;`,
    `cancel within ${cancellationFullRefundHours} hours and I refund ${lateCancelRefundPct}%.`,
    ``,
```

In the `html`, add a paragraph before the `Questions?` paragraph (reuse the existing inline-style register):

```typescript
  <h2 style="font-size:1.1rem;margin:1.5rem 0 0.5rem;">Payment</h2>
  <p style="margin-bottom:0.5rem;">You can prepay anytime from your bookings page, or pay after your ${serviceHtml}.</p>
  <p style="margin-bottom:1rem;">Cancel ${cancellationFullRefundHours}+ hours before the start and I refund you in full; cancel within ${cancellationFullRefundHours} hours and I refund ${lateCancelRefundPct}%.</p>
```

(`cancellationFullRefundHours`/`lateCancelRefundPct` are numbers — safe to interpolate without escaping.)

- [ ] **Step 4: Extend the payload type + thread settings at both production sites**

In `send-booking-emails.ts`, add `cancellationFullRefundHours: number;` + `lateCancelRefundPct: number;` to `BookingConfirmationDetails` (passed straight into the builder — no other change there).

In `create-booking.mutation.ts` (the `booking_confirmed` payload ~L92): add `const settings = await repo.getSettings();` before the `notifier.notify` call, and add to the payload:

```typescript
              cancellationFullRefundHours: settings.cancellation_full_refund_hours,
              lateCancelRefundPct: settings.late_cancel_refund_pct,
```

In `approval-actions.ts` (the inline payload ~L216): construct the repo (mirror `actions.ts`: `const repo = createSupabaseBookingRepository(serviceClient);`) or reuse one in scope, `const settings = await repo.getSettings();`, and add the same two fields to the payload object.

- [ ] **Step 5: Fix the test fixtures that build the payload**

In `reminder-cron.test.ts` (the `sendBookingConfirmation` call ~L118) and `notifier.test.ts` (the `PAYLOAD` const), add `cancellationFullRefundHours: 48` + `lateCancelRefundPct: 50` to each `BookingConfirmationDetails`/payload literal so typecheck passes.

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npx vitest run src/features/notifications` → PASS
Run: `npm run typecheck && npm run build` → PASS (build confirms both production sites compile with the new required fields)

- [ ] **Step 7: Commit**

```bash
git add src/features/notifications src/features/booking/mutations/create-booking.mutation.ts src/features/admin/approval-actions.ts
git commit -m "feat: render payment policy in confirmation email from settings"
```

---

### Task 8: Seed a partially-refunded booking + fix the existing refunded seed

**Files:**

- Modify: `scripts/db-seed/factories.ts`
- Modify: `scripts/db-seed/scenarios.ts`

- [ ] **Step 1: Extend the factories for the new state**

In `factories.ts`, widen `insertBooking`'s `paymentStatus` union to include `"partially_refunded"`, and add an optional `refundedCents?: number` to `insertPayment`'s opts, writing `refunded_cents: opts.refundedCents ?? 0` in the inserted row.

- [ ] **Step 2: Add a partially-refunded booking + fix the full-refund row**

In `scenarios.ts` `payment-states`, fix the existing `pay-refunded` payment insert to pass `refundedCents: 3500` (so it stays consistent if ever re-projected — a `refunded` row needs `refunded_cents == amount_cents`). Then add a new booking (use a non-colliding offset, e.g. `mk("pay-partial-refunded", 11)`):

```typescript
// partially refunded (late-cancelled, 50% retained) — SP4b live-verify target
const b9 = mk("pay-partial-refunded", 11);
await insertBooking(ctx, b9.key, {
  clientEmail: "paula@local.test",
  service: "walk",
  startsAt: b9.startsAt,
  endsAt: b9.endsAt,
  status: "cancelled",
  paymentStatus: "partially_refunded",
  finalCents: 3500,
  petKeys: ["rex"],
});
await insertPayment(ctx, {
  bookingKey: b9.key,
  intentId: "pi_seed_partial_refunded",
  amountCents: 3500,
  status: "succeeded",
  refundedCents: 1750,
});
```

- [ ] **Step 3: Run the seed against the local stack**

Run: `npm run db:seed -- payment-states`
Expected: completes; prints counts including the new booking; no constraint error.

- [ ] **Step 4: Commit**

```bash
git add scripts/db-seed/factories.ts scripts/db-seed/scenarios.ts
git commit -m "test: seed a partially-refunded booking state"
```

---

### Task 9: Gates + manual live verify + close-out

**Files:**

- Modify: `docs/superpowers/specs/2026-06-10-audit-findings.md` (prune)
- Modify: `docs/superpowers/HANDOFF.md` (progress + session log)

- [ ] **Step 1: Run the full gate set**

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS (0 errors; the 3 pre-existing scheduler `useCallback` warnings are unrelated)
Run: `npm run build` → PASS
Run: `npm test` (or `npx vitest run src/features/payments src/features/notifications`) → PASS (new projection + webhook + reuse + email cases green)

- [ ] **Step 2: Manual live `verify` (real Stripe, per the spec DoD)**

With `npm run dev` (`-p 3001` if 3000 is busy) + `stripe listen --forward-to localhost:3000/api/webhooks/stripe` running, signed in as a seeded client:

- Prepay a `pay-prepayable` booking with `4242 4242 4242 4242` → `payment_status` → `paid` (4a regression check).
- Late-cancel that now-prepaid booking inside the `cancellation_full_refund_hours` cutoff → confirm `payments.refunded_cents` ≈ 50% of paid, the row stays `succeeded`, and `bookings.payment_status` → `partially_refunded` (the retained half is visible).
- Confirm `bookings.status` is `cancelled` (set by the cancel path) and was never written by the payment code.
- Walk the prepay dialog at a mobile viewport (mobile parity).

(If a dispute is feasible to simulate via `stripe trigger charge.dispute.created`, confirm `disputed_at`/`dispute_status` populate; otherwise the integration tests cover it.)

- [ ] **Step 3: Fresh-session `/code-review` (author never grades itself)**

Run a fresh-session `/code-review` of the branch diff. Address any Critical/Important findings (commit fixes, subject-only); record declines with reasoning in this plan's Handoff log.

- [ ] **Step 4: Prune the findings register**

In `docs/superpowers/specs/2026-06-10-audit-findings.md` §SP4, remove the **PAY3, PAY5, PAY6, PAY7** rows (the canceled-half of PAY6 was already pruned by 4a; this removes the dispute half + the rest). Leave a one-line note in the session log that SP4 findings are fully closed.

- [ ] **Step 5: Update HANDOFF (same-commit rule)**

In `docs/superpowers/HANDOFF.md`: set the SP4 Progress status to **DONE** (4a + 4b complete); append a Session-log line summarizing the slice + the live-verify result.

- [ ] **Step 6: Commit the close-out**

```bash
git add docs/superpowers/specs/2026-06-10-audit-findings.md docs/superpowers/HANDOFF.md
git commit -m "docs: close out payments harden findings"
```

---

## Definition of done (SP4b)

- `refunded_cents` written from cumulative `charge.amount_refunded`; a partial refund leaves the row `succeeded` and projects `partially_refunded` (retained half representable + **live-verified**); a full refund → `refunded`.
- Projection precedence is paid-first + overpay-safe; `amountOwedCents` nets refunds; new `projection.test.ts` cases pass.
- Overpay auto-reconciled from the webhook (idempotency-keyed; no double-refund on re-delivery); webhook gateway is optional + faked in tests.
- `charge.dispute.created`/`.closed` persist `disputed_at`/`dispute_status` + log; never touch `payment_status` or `bookings.status`.
- Reuse path tolerates a 404 on `retrieveIntent`/`cancelIntent` (mints fresh / proceeds).
- Confirmation email renders prepay + cancellation policy from `settings` in first-person voice; no hardcoded percentages/hours.
- `payment-states` seed carries a `partially_refunded` booking; the `refunded` seed row is `refunded_cents`-consistent.
- DESIGN.md corrected (data model `:119`/`:121` + the `:197` partial-payment bullet) in the relevant same commits.
- Seams intact: webhook = sole writer of `payment_status`; `bookings.status` untouched by payment code; amounts server-derived; gateway behind the DI seam, no network in tests.
- Gates green: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`; fresh-session `/code-review`; manual live `verify`.
- Findings **PAY3, PAY5, PAY6 (dispute), PAY7** pruned from the register; HANDOFF Progress (SP4 → DONE) + Session log updated.

## Handoff log

(append blocking/minor escalations + execution deviations here, per WORKFLOW)

- 2026-06-11 · **Minor deviation (Task 2 ↔ Task 3 coupling).** The plan's Task 2 Step 7 expected `payments.test.ts` to stay green ("read-side change is inert; rows default `refunded_cents` 0"). It did not: the new paid-first projection counts a `refunded`-status row's amount as `capturedSum`, so the two pre-existing 4a full-refund `charge.refunded` tests (which left `refunded_cents` 0) projected `paid` instead of `refunded` — a real Task2↔Task3 coupling the note missed. Task 2 committed with 2 transient reds; Task 3 (its rightful re-green point) tightened `chargeObjectSchema` to require `amount`/`amount_refunded` and updated the 2 pre-existing `charge.refunded` tests (+the expanded-intent one) to carry full-refund amounts. Suite green again after Task 3 (43/43 projection+payments). No scope change; the two commits are individually reviewable, the pair is consistent.
- 2026-06-11 · **Blocking escalation (Task 9 live `verify`) — maintainer-owned.** Stripe CLI IS installed locally (v1.42.11), but the DoD live verify is an interactive browser money-movement flow (sign in as a seeded client → Prepay in the Stripe iframe → late-cancel inside the refund cutoff → confirm `partially_refunded` + retained-half `refunded_cents`) requiring the maintainer's authenticated Stripe account — the same flow the maintainer ran for 4a. The orchestrator cannot drive it headlessly. All other gates passed (typecheck · lint 0-err · `next build` · payments+notifications 90/90) and the partial-refund/full-refund/overpay/dispute/404 behaviors are integration-tested against the live local Supabase stack with a faked gateway. **Action for maintainer:** run the live verify per Task 9 Step 2; if it surfaces anything, reopen here. Seed target `pay-prepayable` (prepay) + `pay-partial-refunded` (pre-seeded expected end-state) are in `payment-states`.

---

_Last reviewed: 2026-06-11_
