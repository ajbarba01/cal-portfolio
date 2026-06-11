# SP4a — Payments flow completion (test mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prepay flow move money end-to-end in Stripe **test mode** — mount Stripe's PaymentElement in the SP3b Dialog, reuse open PaymentIntents instead of leaking new ones, and handle the `payment_intent.canceled` webhook.

**Architecture:** All logic stays behind the `PaymentGateway` DI seam in `src/features/payments/`. The webhook remains the sole writer of `bookings.payment_status`; the client only calls `stripe.confirmPayment`. Intent reuse + idempotency live in `runCreatePrepayIntent`; the new UI is a client island (`prepay-dialog.tsx`) so the bookings page stays a server component.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · `stripe` (server, already installed) · `@stripe/stripe-js` + `@stripe/react-stripe-js` (new) · `@base-ui/react` Dialog/Toast (SP3b primitives) · Supabase · Vitest.

**Spec:** [2026-06-10-sp4-payments-design.md](../specs/2026-06-10-sp4-payments-design.md) — this plan implements the **SP4a** slice only (PAY2, PAY1, PAY4, and the `payment_intent.canceled` half of PAY6). SP4b (PAY3 refund re-model + hardening) is planned JIT after this lands.

**Findings owned:** PAY1, PAY2, PAY4, PAY6 (`payment_intent.canceled` only).

## Prerequisites (maintainer, before execution)

- Alex creates/owns a Stripe account in **TEST mode** and pastes `pk_test_…` / `sk_test_…` into `.env.local` (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`). **Live keys never enter any env file.**
- Stripe CLI installed for local webhook forwarding (Task 6 documents the command). The CLI's `whsec_…` goes in `.env.local` as `STRIPE_WEBHOOK_SECRET`.
- Local Supabase stack running (`npx supabase status`); `.env.test` already present for the integration suite (fake gateway — no real Stripe key needed there).

## File structure

- `src/features/payments/types.ts` — extend `PaymentGateway` (idempotency key on `createIntent`; new `retrieveIntent`, `cancelIntent`); extend `CreateIntentArgs`.
- `src/features/payments/stripe-gateway.ts` — implement the three gateway changes against the Stripe SDK.
- `src/features/payments/create-intent.ts` — reuse-or-mint logic + idempotency key (PAY4).
- `src/features/payments/webhook-core.ts` — handle `payment_intent.canceled` (PAY6 half).
- `src/features/payments/payments.test.ts` — extend the fake gateway + add reuse + canceled-event integration tests.
- `src/app/(account)/account/bookings/_components/prepay-dialog.tsx` — **new** client island: Elements provider + PaymentElement in the Dialog primitive (PAY1).
- `src/app/(account)/account/bookings/_components/prepay-button.tsx` — open the dialog instead of the dead-end TODO.
- `src/lib/stripe/browser.ts` — **new** memoized `loadStripe` singleton + token-mapped `appearance`.
- `docs/DEV_NOTES.md` — payments test-mode setup section (PAY2).
- `scripts/db-seed/scenarios/payment-states.ts` (or equivalent) — extend with an open-intent + canceled-intent row.

---

### Task 1: Install Stripe browser SDKs

**Files:**

- Modify: `package.json` (deps)

- [ ] **Step 1: Install the two client libraries**

Run:

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

Expected: both added to `dependencies`; lockfile updated.

- [ ] **Step 2: Verify typecheck still green**

Run: `npm run typecheck`
Expected: PASS (no usage yet — just confirms the install didn't break types).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add stripe browser sdks for payment element"
```

---

### Task 2: Extend the PaymentGateway seam (idempotency + retrieve + cancel)

Adds the capabilities intent-reuse needs, with the fake gateway updated in lockstep so the suite compiles. No behavior change to existing callers yet.

**Files:**

- Modify: `src/features/payments/types.ts`
- Modify: `src/features/payments/stripe-gateway.ts`
- Modify: `src/features/payments/payments.test.ts` (fake gateway)

- [ ] **Step 1: Extend the types**

In `types.ts`, add an optional idempotency key to `CreateIntentArgs` and two methods to `PaymentGateway`:

```typescript
export interface CreateIntentArgs {
  amountCents: number;
  currency: string;
  bookingId: string;
  clientId: string;
  /** Booking-scoped key so repeat clicks don't mint duplicate intents (Stripe idempotency). */
  idempotencyKey?: string;
}

/** Status + secret needed to decide whether an existing intent can be reused. */
export interface RetrievedIntent {
  status: string; // Stripe PaymentIntent.status
  clientSecret: string | null;
}

export interface PaymentGateway {
  createIntent(args: CreateIntentArgs): Promise<CreatedIntent>;
  refund(paymentIntentId: string, amountCents: number): Promise<void>;
  /** Read an intent's current status (to decide reuse vs recreate). */
  retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent>;
  /** Cancel a stale/abandoned intent before minting a fresh one. */
  cancelIntent(paymentIntentId: string): Promise<void>;
}
```

- [ ] **Step 2: Implement in StripeGateway**

In `stripe-gateway.ts`, pass the idempotency key as a Stripe request option and add the two methods:

```typescript
  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: args.amountCents,
        currency: args.currency,
        metadata: { bookingId: args.bookingId, clientId: args.clientId },
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
    );
    if (!pi.client_secret) {
      throw new Error(`Stripe PaymentIntent ${pi.id} returned no client_secret`);
    }
    return { paymentIntentId: pi.id, clientSecret: pi.client_secret };
  }

  async retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return { status: pi.status, clientSecret: pi.client_secret };
  }

  async cancelIntent(paymentIntentId: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(paymentIntentId);
    // payment_status is re-projected by the payment_intent.canceled webhook — never here.
  }
```

Add `RetrievedIntent` to the type import at the top.

- [ ] **Step 3: Update the test fake so the suite compiles**

In `payments.test.ts`, replace `FakeGateway` with one that satisfies the new interface and records intents (the reuse test in Task 3 needs this):

```typescript
class FakeGateway implements PaymentGateway {
  public created: CreateIntentArgs[] = [];
  public canceled: string[] = [];
  /** intentId → status returned by retrieveIntent (default reusable). */
  public statuses = new Map<string, string>();

  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    this.created.push(args);
    return { paymentIntentId: FAKE_INTENT_ID, clientSecret: FAKE_SECRET };
  }
  async refund(): Promise<void> {}
  async retrieveIntent(id: string): Promise<RetrievedIntent> {
    return {
      status: this.statuses.get(id) ?? "requires_payment_method",
      clientSecret: `${id}_secret_xyz`,
    };
  }
  async cancelIntent(id: string): Promise<void> {
    this.canceled.push(id);
  }
}
```

Add `CreateIntentArgs` and `RetrievedIntent` to the `./types` import.

- [ ] **Step 4: Run the payments suite — confirm it still passes (no behavior change)**

Run: `npx vitest run src/features/payments/payments.test.ts`
Expected: PASS (existing assertions unaffected; createIntent ignores the new optional arg).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add src/features/payments/types.ts src/features/payments/stripe-gateway.ts src/features/payments/payments.test.ts
git commit -m "feat: extend payment gateway with intent retrieve, cancel, idempotency"
```

---

### Task 3: Reuse open intents instead of minting duplicates (PAY4)

**Files:**

- Modify: `src/features/payments/create-intent.ts`
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `payments.test.ts`:

```typescript
describe("runCreatePrepayIntent — intent reuse (PAY4)", () => {
  let bookingId: string;

  beforeAll(async () => {
    bookingId = await seedBooking(userId1, 6000, 200);
  });
  afterAll(async () => {
    await serviceClient.from("payments").delete().eq("booking_id", bookingId);
    await serviceClient.from("bookings").delete().eq("id", bookingId);
  });

  it("reuses an open requires_payment intent of the same amount (no new row)", async () => {
    const gw = new FakeGateway();
    const first = await runCreatePrepayIntent(
      { sessionClient: sessionClient1, serviceClient, gateway: gw },
      bookingId,
    );
    expect(first.ok).toBe(true);
    const second = await runCreatePrepayIntent(
      { sessionClient: sessionClient1, serviceClient, gateway: gw },
      bookingId,
    );
    expect(second.ok).toBe(true);

    // Only ONE intent was created across two calls.
    expect(gw.created).toHaveLength(1);
    // Exactly one requires_payment row exists.
    const { data: rows } = await serviceClient
      .from("payments")
      .select("id, status")
      .eq("booking_id", bookingId);
    expect(
      (rows ?? []).filter((r) => r.status === "requires_payment"),
    ).toHaveLength(1);
  });

  it("passes a booking-scoped idempotency key to the gateway", async () => {
    const gw = new FakeGateway();
    await runCreatePrepayIntent(
      { sessionClient: sessionClient1, serviceClient, gateway: gw },
      bookingId,
    );
    expect(gw.created[0]?.idempotencyKey).toMatch(
      new RegExp(`^prepay:${bookingId}:`),
    );
  });

  it("cancels and replaces a stale intent whose status is no longer reusable", async () => {
    const gw = new FakeGateway();
    // First call seeds an open intent row.
    await runCreatePrepayIntent(
      { sessionClient: sessionClient1, serviceClient, gateway: gw },
      bookingId,
    );
    // Mark that intent unusable (e.g. canceled at Stripe).
    gw.statuses.set(FAKE_INTENT_ID, "canceled");
    const again = await runCreatePrepayIntent(
      { sessionClient: sessionClient1, serviceClient, gateway: gw },
      bookingId,
    );
    expect(again.ok).toBe(true);
    expect(gw.canceled).toContain(FAKE_INTENT_ID); // stale one canceled
    expect(gw.created.length).toBeGreaterThanOrEqual(2); // a fresh one minted
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/payments/payments.test.ts -t "intent reuse"`
Expected: FAIL — two intents created / no idempotency key / stale not canceled.

- [ ] **Step 3: Implement reuse in `runCreatePrepayIntent`**

After the `owed <= 0` guard and before "Create the PaymentIntent via gateway", insert reuse logic; then thread the idempotency key into `createIntent`. Replace steps 4–5 of the existing function:

```typescript
// 4. Reuse an existing open intent of the same amount, if any (PAY4).
// Base key dedupes rapid double-clicks. If we cancel + recreate, the key MUST
// change — Stripe caches idempotent responses 24h, so reusing the base key
// would return the just-canceled intent. Derive a deterministic retry key
// from the retired intent id (idempotent across re-deliveries of the retry).
let idempotencyKey = `prepay:${bookingId}:${owed}`;

const hasOpenRow = booking.payments.some(
  (p) => p.status === "requires_payment",
);
if (hasOpenRow) {
  const { data: openFull } = await deps.serviceClient
    .from("payments")
    .select("id, stripe_payment_intent_id, amount_cents")
    .eq("booking_id", bookingId)
    .eq("status", "requires_payment")
    .maybeSingle();

  if (openFull?.stripe_payment_intent_id) {
    const existing = await deps.gateway.retrieveIntent(
      openFull.stripe_payment_intent_id,
    );
    const reusable =
      openFull.amount_cents === owed &&
      (existing.status === "requires_payment_method" ||
        existing.status === "requires_confirmation") &&
      existing.clientSecret !== null;

    if (reusable) {
      return { ok: true, clientSecret: existing.clientSecret! };
    }

    // Stale or amount-changed: cancel at Stripe + retire the row, then mint
    // fresh under a key that won't collide with the canceled intent's cache.
    await deps.gateway.cancelIntent(openFull.stripe_payment_intent_id);
    await deps.serviceClient
      .from("payments")
      .update({ status: "failed" })
      .eq("id", openFull.id);
    idempotencyKey = `prepay:${bookingId}:${owed}:retry-${openFull.stripe_payment_intent_id}`;
  }
}

// 5. Mint a new intent with the booking-scoped idempotency key.
const intent = await deps.gateway.createIntent({
  amountCents: owed,
  currency: "usd",
  bookingId,
  clientId: user.id,
  idempotencyKey,
});
```

Keep the existing payments-row insert (step 6) and the `clientSecret` return (step 7) as they are. Add `stripe_payment_intent_id?: string` to the local `PaymentRow` interface if the select needs it (it does not here — the second select fetches it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/payments/payments.test.ts -t "intent reuse"`
Expected: PASS (all three).

- [ ] **Step 5: Run the full payments suite (no regressions)**

Run: `npx vitest run src/features/payments/payments.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add src/features/payments/create-intent.ts src/features/payments/payments.test.ts
git commit -m "feat: reuse open payment intents on repeat prepay"
```

---

### Task 4: Handle `payment_intent.canceled` webhook (PAY6 half)

**Files:**

- Modify: `src/features/payments/webhook-core.ts`
- Test: `src/features/payments/payments.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `applyStripeEvent` describe block:

```typescript
it("payment_intent.canceled → payments.status=failed, no booking.status change", async () => {
  const canceledIntent = `pi_canceled_${ts}`;
  const b = await seedBooking(userId1, 7000, 300);
  await seedPayment(b, userId1, canceledIntent, 7000, "requires_payment");

  const result = await applyStripeEvent(serviceClient, {
    type: "payment_intent.canceled",
    data: { object: { id: canceledIntent } },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.handled).toBe(true);

  const { data: payment } = await serviceClient
    .from("payments")
    .select("status")
    .eq("stripe_payment_intent_id", canceledIntent)
    .single();
  expect(payment?.status).toBe("failed");

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("payment_status, status")
    .eq("id", b)
    .single();
  expect(booking?.payment_status).toBe("unpaid");
  expect(booking?.status).toBe("confirmed"); // never touched

  await serviceClient.from("payments").delete().eq("booking_id", b);
  await serviceClient.from("bookings").delete().eq("id", b);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/payments/payments.test.ts -t "payment_intent.canceled"`
Expected: FAIL — currently falls through to `default` → `handled:false`, row stays `requires_payment`.

- [ ] **Step 3: Add the case**

In `webhook-core.ts`, add a case alongside `payment_intent.payment_failed` (reuse the same `paymentIntentObjectSchema` extraction, map to `"failed"`):

```typescript
    case "payment_intent.canceled": {
      const parsed = paymentIntentObjectSchema.safeParse(data.object);
      if (!parsed.success) {
        return { ok: false, error: "Malformed payment_intent object: missing id" };
      }
      return applyPaymentIntentStatus(serviceClient, parsed.data.id, "failed");
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/payments/payments.test.ts -t "payment_intent.canceled"`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add src/features/payments/webhook-core.ts src/features/payments/payments.test.ts
git commit -m "feat: handle payment_intent.canceled webhook event"
```

---

### Task 5: Stripe.js browser loader + token-mapped appearance

**Files:**

- Create: `src/lib/stripe/browser.ts`

> **Invoke `frontend-design` skill before editing UI** (repo rule). The `appearance` object maps semantic tokens, never hardcoded hex (tokens-are-law).

- [ ] **Step 1: Create the memoized loader + appearance**

```typescript
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";

/** Module-scope singleton — loadStripe must be called once, outside render. */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error(
        "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — set it in .env.local.",
      );
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/**
 * PaymentElement appearance mapped to the design tokens. Stripe's iframe can't
 * read CSS vars, so resolve the brand values here. Keep in sync with globals.css.
 * (Confirm exact token values with frontend-design at execution.)
 */
export const paymentAppearance: Appearance = {
  theme: "stripe",
  variables: {
    fontFamily: '"Public Sans", system-ui, sans-serif',
    borderRadius: "10px",
    // colorPrimary etc. resolved from the Trail palette during frontend-design.
  },
};
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add src/lib/stripe/browser.ts
git commit -m "feat: add stripe.js browser loader and token appearance"
```

---

### Task 6: PaymentElement dialog + wire the Prepay button (PAY1)

**Files:**

- Create: `src/app/(account)/account/bookings/_components/prepay-dialog.tsx`
- Modify: `src/app/(account)/account/bookings/_components/prepay-button.tsx`

> **Invoke `frontend-design` skill before editing UI.** Mobile parity required (the Dialog shell is already responsive — verify the PaymentElement fills it cleanly at narrow widths). This task has no unit test (Stripe renders a cross-origin iframe); it is covered by the manual `verify` in Task 8.

- [ ] **Step 1: Create the prepay dialog island**

```tsx
"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/feedback/toast";
import { getStripe, paymentAppearance } from "@/lib/stripe/browser";

const stripePromise = getStripe();

export function PrepayDialog({
  open,
  onOpenChange,
  clientSecret,
  amountLabel,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string;
  amountLabel: string;
  onPaid: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Pay ${amountLabel}`}
    >
      {clientSecret ? (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: paymentAppearance }}
        >
          <PrepayForm onPaid={onPaid} onOpenChange={onOpenChange} />
        </Elements>
      ) : null}
    </Dialog>
  );
}

function PrepayForm({
  onPaid,
  onOpenChange,
}: {
  onPaid: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (error) {
      toast.add({ type: "error", title: error.message ?? "Payment failed." });
      return;
    }
    toast.add({ type: "success", title: "Payment received — thank you!" });
    onOpenChange(false);
    onPaid();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || submitting} className="w-full">
        {submitting ? "Processing…" : "Pay now"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Wire the Prepay button to open the dialog**

Replace `prepay-button.tsx` so the success branch opens the dialog (and the page refreshes after payment via `router.refresh()`):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createPrepayIntent } from "@/features/payments/index.client";
import { PrepayDialog } from "./prepay-dialog";

interface PrepayButtonProps {
  bookingId: string;
  owedCents: number;
}

export function PrepayButton({ bookingId, owedCents }: PrepayButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (owedCents <= 0) return null;

  const amountLabel = `$${(owedCents / 100).toFixed(2)}`;

  function handlePrepay() {
    setError(null);
    startTransition(async () => {
      const result = await createPrepayIntent(bookingId);
      if (result.ok) {
        setClientSecret(result.clientSecret);
        setOpen(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={handlePrepay}
        aria-label="Prepay for this booking"
      >
        {isPending ? "Processing…" : "Prepay"}
      </Button>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      {clientSecret && (
        <PrepayDialog
          open={open}
          onOpenChange={setOpen}
          clientSecret={clientSecret}
          amountLabel={amountLabel}
          onPaid={() => router.refresh()}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Confirm a ToastProvider wraps the account zone**

The dialog calls `useToast()`, which needs `ToastProvider` in an ancestor. SP3b shipped it — verify it wraps the `(account)` layout (grep for `ToastProvider`). If absent there, add it to `src/app/(account)/layout.tsx`. (Do not add a second provider if one already covers the route.)

- [ ] **Step 4: Build + lint**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS — `build` confirms the client island doesn't leak `server-only` into a server component (the bookings page stays server, PrepayButton/PrepayDialog are `"use client"`).

- [ ] **Step 5: Commit**

```bash
git add src/app/(account)/account/bookings/_components/prepay-dialog.tsx src/app/(account)/account/bookings/_components/prepay-button.tsx
git commit -m "feat: mount payment element to complete prepay flow"
```

---

### Task 7: Document test-mode setup (PAY2)

**Files:**

- Modify: `docs/DEV_NOTES.md`

- [ ] **Step 1: Add a "Payments (Stripe test mode)" section**

Append:

```markdown
## Payments — local Stripe test mode

1. From the Stripe dashboard in **TEST mode**, copy the keys into `.env.local`:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`
   - `STRIPE_SECRET_KEY=sk_test_…`
     Live keys never go in any env file.
2. Forward webhooks to the local route:
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   Copy the printed `whsec_…` into `.env.local` as `STRIPE_WEBHOOK_SECRET`.
3. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.
4. The integration suite uses a fake gateway via `.env.test` — no real Stripe key required for `npm test`.
```

- [ ] **Step 2: Commit (accept husky markdown reformatting; re-stage if changed)**

```bash
git add docs/DEV_NOTES.md
git commit -m "docs: document local stripe test-mode setup"
```

---

### Task 8: Extend the `payment-states` seed + manual verify

**Files:**

- Modify: the `payment-states` scenario in `scripts/db-seed/` (locate via grep — SP2 owns the layout)

- [ ] **Step 1: Add an open-intent and a canceled-intent booking to the scenario**

Locate the scenario file (`grep -rl "payment-states" scripts/db-seed`), and add two bookings: one with a `requires_payment` payments row (an open, reusable intent) and one with a `failed` row (a canceled intent). Follow the existing factory pattern in `scripts/db-seed/factories.ts`. Keep it wipe-first + idempotent.

- [ ] **Step 2: Run the seed against the local stack**

Run: `npm run db:seed -- payment-states`
Expected: completes; prints the seeded counts including the two new bookings.

- [ ] **Step 3: Manual `verify` — money moves end-to-end**

With `npm run dev` (or `-p 3001` if 3000 is busy) and `stripe listen` running, signed in as a seeded client:

- Click **Prepay** on an owed booking → dialog opens with PaymentElement.
- Pay with `4242…` → success toast, dialog closes, list refreshes, status shows paid (owed clears).
- Click **Prepay** again on the same un-paid booking _before_ paying → the network shows **no second** PaymentIntent created (reuse).
- Walk the flow at a mobile viewport + the breakpoint transition (mobile parity).

- [ ] **Step 4: Commit**

```bash
git add scripts/db-seed
git commit -m "test: seed open and canceled payment intent states"
```

---

## Definition of done (SP4a)

- Prepay moves real test-mode money: PaymentElement mounts, `confirmPayment` succeeds, webhook projects `payment_status → paid`, list refreshes.
- Repeat Prepay **reuses** the open intent (verified: no duplicate PaymentIntent / row); idempotency key passed.
- `payment_intent.canceled` handled → row `failed`, `bookings.status` untouched.
- Setup documented; `payment-states` seed extended.
- Gates green: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (payments suite); fresh-session `/code-review`; manual `verify` (desktop + mobile).
- Prune **PAY1, PAY2, PAY4** and the `payment_intent.canceled` half of **PAY6** from the findings register; note the dispute half + PAY3/PAY5/PAY7 remain for SP4b.
- Update HANDOFF Progress + Session log (same-commit rule).

## Notes for SP4b (next slice, planned JIT after this lands)

- PAY3: add `payments.refunded_cents` + `partially_refunded` enum; revise `computePaymentStatus` precedence (read cumulative `charge.amount_refunded` in the webhook). Correct DESIGN.md:197's "no partial-payment edge case" claim.
- PAY5: overpay reconcile (auto-refund excess). PAY6 rest: `charge.dispute.*`. PAY7: payment-policy email copy rendered from settings.
- The `failed`-on-cancel choice here is provisional; if SP4b adds a dedicated `canceled` payments status, revisit the Task 4 mapping.

## Handoff log

- 2026-06-11 · executed all 8 tasks (subagent-driven, fresh subagent per task + diff review). Gates green: typecheck, lint (0 errors; 3 pre-existing scheduler `useCallback` warnings, unrelated), `next build` (no server-only leak), payments suite 20/20. Commits `d6eadcc`→`c0c1c6d`.
- **Deviations (minor, logged):**
  - _Task 3 tests_ — the plan's raw test snippets fail against the real DB: (a) the three reuse tests share one booking, so added an `afterEach` clearing payments rows per test (otherwise tests 2/3 reuse a prior test's open row instead of minting); (b) `payments.stripe_payment_intent_id` is `UNIQUE`, so the fake gateway now mints a unique id after the first call (first stays `FAKE_INTENT_ID` to preserve the existing assertion), letting the stale-replace re-insert succeed. Production `runCreatePrepayIntent` logic unchanged from the plan.
  - _Task 4 test_ — seeded booking offset 300→500 to clear the `no_same_class_overlap` exclusion constraint vs the other fixtures.
  - _Task 7 (PAY2 docs)_ — placed the setup runbook in `.env.example` (the canonical env contract, which already lists the three Stripe vars) instead of `docs/DEV_NOTES.md`. DEV_NOTES is "inbox only, never authority" (doc-lifecycle rule); a permanent runbook there would violate it, and the spec explicitly allowed "a dev-setup doc … a comment helps."
  - _Task 8 (seed)_ — the `payment-states` scenario already seeds an open `requires_payment` intent (`pay-open-intent`) and a `failed`/canceled intent (`pay-failed`) from SP2, so step 1 was already satisfied. Added one `pay-prepayable` booking (confirmed + owed, NO payment row) as a clean live-verify target — the `pi_seed_*` rows carry fake intent ids that can't be retrieved against real Stripe.
- **Fresh-session `/code-review`** (independent subagent, opus): APPROVED WITH MINOR ISSUES; all constitution invariants verified (webhook sole-writer, server-derived amounts, no `any`, tokens-as-law, client/server boundary, idempotency-key rotation). Fixed the one Important finding in `c0c1c6d` — reuse select now takes the newest open row (`order created_at desc, limit 1`) and bails on a query error instead of falling through to mint a third intent; added a duplicate-open-rows regression test. Declined two cosmetic Minors (dead `clientSecret` guard; module-scope `getStripe()` throw timing) with reasoning.
- **SP4b deferred finding (new):** the reuse path does not wrap `retrieveIntent`/`cancelIntent` in try/catch — a stale id that 404s at Stripe would throw. Fine for production rows (real ids); fold into SP4b hardening.
- **Live `verify` (DoD gate) — PASSED 2026-06-11.** Maintainer installed the Stripe CLI, ran `stripe listen` (`STRIPE_WEBHOOK_SECRET` now in `.env.local`), and walked the flow: prepay with the `4242` test card → webhook projected `payment_status → paid`; repeat-click reuse confirmed (no second PaymentIntent); mobile walked. **SP4a DONE.**

---

_Last reviewed: 2026-06-11_
