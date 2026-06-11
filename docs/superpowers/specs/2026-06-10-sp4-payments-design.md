# SP4 — Payments: complete + harden (design)

> Companion: [roadmap](2026-06-10-professionalization-roadmap-design.md) §SP4, [findings register](2026-06-10-audit-findings.md) §SP4. Owns findings **PAY1–PAY7**. Split into **SP4a** (test-mode infra + flow completion) and **SP4b** (refund re-model + hardening), mirroring the 3a/3b precedent; this spec covers both, plan SP4a first.

## Goal

Make the payment flow actually move money in **Stripe test mode**, then harden it: complete the dead-end prepay UI, set up test keys + local webhook forwarding, fix the partial-refund data model so a retained-half is representable, reuse rather than leak PaymentIntents, and cover the remaining webhook events + payment-policy email copy. Preserve the existing seams: the webhook stays the **sole writer** of `bookings.payment_status`; the cancel path only **initiates** refunds; all amounts are **server-derived**.

## Scope (findings owned)

From the findings register §SP4: **PAY1, PAY2, PAY3, PAY4, PAY5, PAY6, PAY7.**

| Slice    | Findings                                                | Theme                                            |
| -------- | ------------------------------------------------------- | ------------------------------------------------ |
| **SP4a** | PAY2, PAY1, PAY4, PAY6 (`payment_intent.canceled` only) | Make money move end-to-end in test mode          |
| **SP4b** | PAY3, PAY5, PAY6 (`charge.dispute.*`), PAY7             | Harden: refund re-model, reconcile, events, copy |

Do **not** re-litigate the "Verified sound" register items: webhook signature verify on raw body, refunded-row forward-only guard, prepay intent ownership check + server-derived amount. Those stay as-is.

Out of scope (owned elsewhere): refund/no-show **admin surfaces** layout + copy (SP5); cancel-with-reason field (AD4 / booking-mutation P3); the `A15` serial-await perf item (SP7); sitewide email redesign beyond payment-policy lines (SP6).

## Decisions (from maintainer grilling, 2026-06-10)

- **Split SP4a / SP4b.** 4a = "make money move" (executable + verifiable on its own); 4b = "harden". Smaller diffs, cleaner fresh-session `/code-review` per slice.
- **PaymentElement, not CardElement.** Stripe recommends the Payment Element for all new integrations; the Card Element is legacy with less functionality. Same integration effort, less maintenance, future payment methods for free. (Source [1].)
- **Payment model unchanged from DESIGN.** Full-amount prepay, **optional**, **pay-later default**; a booking is valid on **approval, not payment**. No deposit (DESIGN keeps the schema deposit-ready but the policy is future/undecided), no pay-at-checkout in the booking flow.
- **All cancellation/refund values stay Cal-tunable `settings`** — `late_cancel_refund_pct`, `cancellation_full_refund_hours`, `no_show_charge_pct`. The "50%" used throughout this spec is only the **seeded default**; nothing in SP4 hardcodes a percentage. `refunded_cents` is read from Stripe's actual `charge.amount_refunded`, and PAY7 email copy renders the live setting.
- **Mount in the SP3b `Dialog` primitive** opened by the existing account-bookings `Prepay` button — no new route; reuses the shipped primitive + type-based toast; mobile parity via the existing responsive dialog shell.
- **PAY3 re-model: add `payments.refunded_cents` + a `partially_refunded` payment_status value.** Track cumulative refunded amount from Stripe's `charge.amount_refunded`; revise `computePaymentStatus` precedence so a refund is not masked by `paid`. Retained-half becomes representable.
- **PAY4: reuse the open intent.** On repeat `Prepay`, reuse an existing `requires_payment` intent for the booking rather than minting a new row + intent each click; cancel genuinely-stale intents; booking-scoped **idempotency key** on `createIntent`. (Source [2].)
- **PAY2: `.env.local` + Alex's Stripe TEST-mode account.** Test keys (`pk_test`/`sk_test`/`whsec_…`) live in gitignored `.env.local` (existing convention; `.env.example` already lists the three vars). Local webhooks via the Stripe CLI. **Live keys never enter any env file.** Account creation is a maintainer prerequisite recorded in the plan.

## Industry validation (standing rule)

Validated against current Stripe guidance before finalizing; sources cited inline and listed below.

- **Element choice** — Stripe documents the Payment Element as the recommended integration and the Card Element as legacy ([1]).
- **Intent lifecycle + idempotency** — Stripe advises an idempotency key scoped to the cart/customer session to prevent duplicate PaymentIntents, and **reusing** the same PaymentIntent when a checkout resumes rather than creating a new one (the intent object tracks failed attempts for the cart); the key is a commitment — same key, same params, or Stripe 400s; cached 24 h ([2]).
- **Partial refunds** — a charge may carry **multiple** refunds up to the original amount; Stripe recommends listening to the refund webhooks; the `charge.refunded` event carries the charge with cumulative `amount_refunded`, which is the source of truth for `refunded_cents` ([3], [4]).
- **SCA** — `confirmPayment` with the Payment Element handles any required authentication (3DS) inline; no separate SCA code path needed for test mode.

## Current state (grounding, verified against code)

- `create-intent.ts` — server action `createPrepayIntent` already derives `owed` server-side, verifies ownership, inserts a `requires_payment` row via service client, returns `clientSecret`. **No reuse logic** (PAY4): every call mints a new intent + row.
- `prepay-button.tsx:28` — TODO "card entry coming soon"; success branch never mounts Elements, never confirms (PAY1).
- `webhook-core.ts` — `applyStripeEvent` handles `payment_intent.succeeded` / `payment_intent.payment_failed` / `charge.refunded`; `default` ignores the rest (PAY6). `charge.refunded` flips the whole `payments` row to `refunded` regardless of amount (PAY3). Forward-only refund guard present (sound).
- `projection.ts` — `computePaymentStatus`: `paid` wins when `paidSum >= finalCents`, else `refunded` if any refunded txn, else `unpaid`. No partial-refund state; no `refunded_cents` (PAY3).
- `stripe-gateway.ts` — `createIntent` (no idempotency key), `refund(intentId, amountCents)` (already supports partial). Lazy client; missing-key error deferred to first call.
- `cancel-core.ts` — computes `refund.refundCents` and calls `gateway.refund` for the partial; relies on the webhook to project. This is the path that currently mis-projects to `refunded` (PAY3).
- DESIGN.md:121 — `payments` status enum `requires_payment|succeeded|refunded|failed`; :119 — `bookings.payment_status` `unpaid|paid|refunded`; :197 — claims "no partial-payment edge case" — **this claim is wrong for a full prepay that gets a 50% late-cancel refund** and is corrected in SP4b.

## Architecture

### SP4a — make money move

**PAY2 — test-mode infra.**

- Document a `payments` setup block (in `docs/DEV_NOTES.md` or a dev-setup doc): obtain `pk_test`/`sk_test` from the Stripe **test** dashboard into `.env.local`; run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy its `whsec_…` into `STRIPE_WEBHOOK_SECRET`; test card `4242 4242 4242 4242`. `.env.example` already carries the three vars — no change unless a comment helps.
- No live keys, ever. The gateway + webhook route already fail loudly on a missing key, so absence is safe.

**PAY1 — flow completion.**

- New client component (e.g. `prepay-dialog.tsx`) wraps Stripe's `<Elements>` provider (loaded with `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` via `@stripe/stripe-js` `loadStripe`, memoized at module scope) and `<PaymentElement>`, mounted inside the SP3b `Dialog` primitive.
- Flow: `Prepay` → server action returns `clientSecret` → dialog opens → user enters card → `stripe.confirmPayment({ elements, clientSecret, redirect: "if_required" })` → on success close dialog, fire success toast (SP3b type-based), revalidate the bookings list. `payment_status` flips via the webhook projection (not the client).
- New deps: `@stripe/stripe-js`, `@stripe/react-stripe-js`. Tokens-are-law: PaymentElement `appearance` maps semantic tokens (it is the only new UI → **frontend-design invoked at execution**).

**PAY4 — intent lifecycle.**

- `runCreatePrepayIntent` gains reuse: before minting, look for an existing `requires_payment` row for the booking whose amount still matches `owed`; if its Stripe intent is still open (`requires_payment_method`/`requires_confirmation`), return that `clientSecret` (retrieve via gateway) instead of inserting a new row. If a stale row's amount no longer matches (re-quote/Kiche), cancel its intent + mark the row, then mint fresh.
- `StripeGateway.createIntent` takes a booking-scoped **idempotency key** (e.g. `prepay:{bookingId}:{owedCents}`); gateway gains `retrieveIntent(id)` and `cancelIntent(id)`; the `PaymentGateway` interface + the test fake extend in lockstep.

**PAY6 (4a half) — `payment_intent.canceled`.**

- `applyStripeEvent` handles `payment_intent.canceled` → set the row `failed` (or a `canceled` status if added) + re-project. This is the webhook side of the stale-intent cancel above; keeps the row from lingering as `requires_payment`.

**Seed.** Extend the `payment-states` scenario to cover an open-then-reused intent and a canceled intent (and, after 4b, a partially-refunded booking).

### SP4b — harden

**PAY3 — partial-refund re-model** (data model; lands before SP5 builds refund surfaces).

- **Migration:** add `payments.refunded_cents int not null default 0`; add `partially_refunded` to the `bookings.payment_status` enum (the DB enum + the TS union).
- **Webhook:** on `charge.refunded`, read the charge's cumulative `amount_refunded` and write it to `refunded_cents` on the matching row (still never touching `bookings.status`; still forward-only). The row status becomes `refunded` only when fully refunded; otherwise it stays `succeeded` with a non-zero `refunded_cents`.
- **Projection:** `computePaymentStatus(finalCents, txns)` revised — compute `refundedSum` from `refunded_cents`; precedence: fully refunded → `refunded`; partial refund present (`0 < refundedSum < paidSum`) → `partially_refunded`; `paidSum - refundedSum >= finalCents` → `paid`; else `unpaid`. `amountOwedCents` nets refunds too. `PaymentTxn` gains `refundedCents`. New cases in `projection.test.ts`.
- **DESIGN.md (same commit):** correct the data model (`payments.refunded_cents`, the new `payment_status` value), and **rewrite the "No partial-payment edge case" bullet** (:197) — a full prepay with a 50% late-cancel refund is exactly the retained-half case the new model represents.

**PAY5 — overpay reconcile.** If `paidSum > finalCents` (two intents both succeeded), auto-refund the excess via `gateway.refund` on the most-recent succeeded intent; the resulting `charge.refunded` re-projects. Define + test the reconcile in the projection/webhook path.

**PAY6 (4b rest) — disputes.** Handle `charge.dispute.created` / `.closed` (at minimum log + a status/flag the admin can later surface in SP5) or consciously ignore-with-comment in the `default` branch — decided at plan time; no silent drop.

**PAY7 — payment-policy email copy.** Add prepay + cancellation-penalty lines to the confirmation/cancellation emails, **rendered from `settings`** (`cancellation_full_refund_hours`, `late_cancel_refund_pct`), never hardcoded. Minimal — `emails.ts` is wireframe-level; full redesign is SP6. Ties U6/U9.

### Seams preserved (do not regress)

- Webhook = **sole writer** of `bookings.payment_status`; `bookings.status` untouched by any payment code.
- Cancel path **initiates** refunds via `StripeGateway.refund` only; never writes `payment_status`.
- Amounts **server-derived**; identity from session, never payload; `payments` writes via service client.
- All new logic lives in `features/payments/` behind the `PaymentGateway` DI seam; pure projection stays IO-free and unit-tested; the gateway is faked in tests (no network).

## Testing

- **Projection** (`projection.test.ts`): new cases for `partially_refunded`, precedence (refund not masked by paid), `refunded_cents` netting, overpay.
- **Webhook** (`payments.test.ts` / webhook-core): `payment_intent.canceled`; `charge.refunded` writing cumulative `refunded_cents` (partial + full); dispute handling; idempotent re-delivery converges.
- **Intent reuse** (`payments.test.ts`): repeat create reuses the open row; amount-changed mints fresh + cancels stale; idempotency key passed to the fake gateway.
- **Live `verify` (manual, per slice):** real `stripe listen`, test card — 4a: prepay succeeds, `payment_status` → `paid`, repeat click reuses; 4b: late-cancel a prepaid booking, confirm `partially_refunded` + correct `refunded_cents`, retained-half visible.
- Gates per slice (WORKFLOW): `tsc --noEmit` strict, lint (boundaries), full test suite, fresh-session `/code-review`, manual `verify`.

## Risks / known gaps

- **4a ships with PAY3 unfixed** — a partial refund still mis-projects to `refunded` until 4b. Acceptable: test mode, pre-launch, no real money, and no refund **surface** ships before SP5 (which follows 4b).
- **Stripe API version pinning** — gateway pins `2026-05-27.dahlia`; the new SDK deps must agree. Verify at execution; bump deliberately if needed.
- **PaymentElement + RSC** — the dialog/Elements tree is client-only; keep it out of the server component graph (the bookings page stays server, dialog is a client island).
- **Enum migration** — adding `partially_refunded` is additive (safe, reversible); no existing row needs backfill (none are partially refunded yet).

## Definition of done

- **SP4a:** test-mode money moves end-to-end (prepay → `paid`) on a live `stripe listen`; repeat-click reuses the open intent; `payment_intent.canceled` handled; setup documented; `payment-states` seed extended; gates green; PAY1/PAY2/PAY4 + the canceled-event half of PAY6 pruned from the register.
- **SP4b:** `refunded_cents` + `partially_refunded` modeled and projected correctly (retained-half representable + verified); overpay reconciled; disputes handled-or-ignored-with-comment; payment-policy email copy rendered from settings; DESIGN.md corrected (incl. the :197 claim); gates green; PAY3/PAY5/PAY6/PAY7 pruned.

## Sources

1. Stripe — Compare the Payment Element and Card Element. https://docs.stripe.com/payments/payment-card-element-comparison
2. Stripe — The Payment Intents API (idempotency + reuse) & Idempotent requests. https://docs.stripe.com/payments/payment-intents · https://docs.stripe.com/api/idempotent_requests
3. Stripe — Refund and cancel payments. https://docs.stripe.com/refunds
4. Stripe — The Refund object / refund webhook update. https://docs.stripe.com/api/refunds/object · https://docs.stripe.com/changelog/acacia/2024-10-28/refund-webhook-update

---

_Last reviewed: 2026-06-10_
