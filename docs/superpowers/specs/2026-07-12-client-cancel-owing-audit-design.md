# Client self-cancel + owing-system audit (2026-07-12)

Tranche 3 of the tester-feedback action plan
([2026-07-12-tester-feedback-action-plan.md](2026-07-12-tester-feedback-action-plan.md),
Groups **C** (client self-cancel) and **H** first row (owing-system audit)). Sequenced
together because both touch the refund/debt paths — verify once.

**Scope decisions confirmed with the maintainer in-session:**

- No-show overcharge (finding H-1): **fix in this tranche**, not deferred.
- Admin balance surfaces: add **waive + adjust amount** (not just waive; not a full manual ledger).
- Meet & greet: clients **may** self-cancel it (unlike edit, which blocks meet & greet).

---

## Group C — client self-cancel

### Problem

Tester: "can't cancel a booking." The refund/debt engine already exists and the
`cancelBooking` server action already handles the client path
(`fullRefund: false` → timing-based `computeRefund`); the state machine already allows
`cancel` from `pending_approval` and `confirmed`. **The only gap is the client UI** — the
bookings row (`account-bookings-client.tsx`) renders Prepay + Edit but no cancel
affordance, and there is no cancel-specific editability predicate or outcome preview.

### Cancel policy ≠ edit policy

A dedicated predicate `clientCanCancelBooking` (new
`src/features/booking/client-can-cancel.ts`, modeled on `client-can-edit.ts`). It
deliberately diverges from `clientCanEditBooking`:

| Gate         | Edit                              | Cancel                          |
| ------------ | --------------------------------- | ------------------------------- |
| Status       | `pending_approval`, `confirmed`   | `pending_approval`, `confirmed` |
| Paid booking | blocked (`reason: "paid"`)        | **allowed**                     |
| Meet & greet | blocked (`reason: "meet_greet"`)  | **allowed**                     |
| Timing       | blocked inside full-refund cutoff | **allowed** any time pre-start  |

Cancel is **always allowed before start**; the only timing gate is that the booking must
not have started yet. Signature:

```
clientCanCancelBooking(input, now): Cancellability
Cancellability = { cancellable: true } | { cancellable: false; reason: CancelBlockReason }
CancelBlockReason = "status" | "started"
```

- `status` — booking is terminal (`completed`/`cancelled`/`declined`/`no_show`).
- `started` — `now >= startsAt` (in progress or past; contact Cal).

Plus a `cancelLockCopy(reason)` helper for the inline locked-row copy, matching the
`editLockCopy` pattern.

### Truthful preview (no drift between shown and executed)

The outcome shown in the confirm dialog **must** equal what the cancel actually does. A
new pure projection is the single source of truth:

```
previewCancellation(input): CancellationOutcome
```

in `src/features/booking/cancellation.ts`, composed from the existing `computeRefund` and
`computeCancellationDebtCents` (no new money math). `CancellationOutcome`:

- `tier: "full" | "late" | "none"`
- `refundCents` — refunded immediately on cancel.
- `remainderCents` — the additional amount Cal _could_ still grant back (late tier only,
  where `needsCalReview` is set); `0` otherwise.
- `debtCents` — late-cancellation fee owed (unpaid-inside-cutoff only); `0` otherwise.

`cancelBookingCore` is refactored to derive its refund + debit from `previewCancellation`
instead of computing them inline, so the preview and the execution cannot diverge.

Outcome copy rendered in the dialog (normal prose, money is explicit):

| Situation                      | Tier | Copy                                                          |
| ------------------------------ | ---- | ------------------------------------------------------------- |
| At/before cutoff, paid         | full | "You'll be refunded $X."                                      |
| At/before cutoff, unpaid or $0 | full | "No charge."                                                  |
| Inside cutoff, paid            | late | "You'll be refunded $Y now. Cal may refund the remaining $Z." |
| Inside cutoff, unpaid          | none | "A $W late-cancellation fee will apply."                      |

A $0 meet & greet always lands in "No charge."

### Action + UI

- **New action** `previewBookingCancellation(bookingId)` — auth + ownership checked, loads
  the booking + settings, returns `CancellationOutcome` computed with a **fresh `now`**
  (so the tier is correct at the cutoff boundary even if the user sat on the page).
  Read-only: performs no writes.
- **Existing action** `cancelBooking` is already correct for clients — unchanged apart from
  the core refactor above.
- **UI:** a `CancelCell` sibling of `EditCell` in the bookings row, gated by
  `clientCanCancelBooking`. It opens a confirm dialog (reusing the same confirm primitive
  the admin "Mark settled" button uses) that fetches `previewBookingCancellation` on open,
  renders the outcome copy, and on confirm calls `cancelBooking`, toasts, and refreshes.
  Blocked bookings show inline lock copy via `cancelLockCopy`. Mobile parity required;
  `frontend-design` invoked before building the dialog.

### Meet & greet note

Because meet & greets are onboarding-owned and typically $0, a cancel lands in the "No
charge" branch cleanly. The plan must verify that cancelling a meet & greet does not leave
onboarding in a broken state (e.g. onboarding status expecting an upcoming meet & greet) —
if it does, that is an escalation, not a silent workaround.

---

## Group H — owing-system audit

### Invariants audited

1. **A client is never overcharged.**
2. **A client is never wrongly blocked from booking.**

### Findings

**H-1 — no-show double-charge (confirmed bug, fixed this tranche).**
`markNoShowCore` (`admin-actions-core.ts`) writes a `client_debits` row for
`no_show_charge_pct%` of `final_cents` **without subtracting what the client already paid**.
A client who prepaid in full and then no-shows is charged 100% via the captured payment
**and** carries a 100%-of-final debit on top — a double charge. Contrast the cancel path,
which only writes a debt when the booking was _unpaid_ (`tier: "none"`), so a paid
late-cancel is correctly netted. The no-show path is the asymmetric outlier.

_Fix:_ no-show debt becomes `max(0, noShowCharge − paidCents)`, mirroring the cancel path.
No debit row is inserted when it nets to `0`. Pure, unit-tested (prepaid-full / partial /
unpaid).

**H-2 — stale "gate re-booking" comment (doc gap, not a bug).**
The `client_debits` migration comment describes debits as balances that "gate re-booking,"
but no code gates booking creation on outstanding balance. Nothing blocks a client from
booking with an outstanding debit, so invariant 2 holds _trivially_ (never blocked at all).
No booking gate is added this pass. _Resolution:_ correct the stale comment to state the
actual behavior — balance does not gate booking (by current design).

**Overcharge trace (clean paths, recorded for completeness).**
`outstandingBalanceCents` sums only unsettled debits (`settled_at is null`); settled/waived
debits drop out. Cancel-debt fires only on the unpaid tier. Kiche re-quote refunds
overpayment rather than charging. These are correct and unchanged.

### Admin balance-modification surfaces

Current surface is only "Mark settled" (clears an entire debit). Gaps filled:

- **Schema:** add a nullable `resolution text check (resolution in ('paid','waived','adjusted'))`
  column to `client_debits`, set whenever a debit is cleared or changed. `settled_at`
  remains the outstanding-vs-cleared signal; `resolution` records _why_.
  `outstandingBalanceCents` is unchanged — waive and settle both zero the balance; the
  column exists purely for admin reporting/labeling.
- **`settleDebit`** (existing) → sets `settled_at` + `resolution = 'paid'` (Cal collected).
- **`waiveDebit(debitId)`** (new, admin-gated core + action) → sets `settled_at` +
  `resolution = 'waived'` (forgiven; semantically distinct from collected).
- **`adjustDebit(debitId, newAmountCents)`** (new, admin-gated core + action) → updates
  `amount_cents` (must stay `> 0` per the existing check constraint) + `resolution =
'adjusted'`; for partial payment or correcting an erroneous charge. Adjusting a debit to
  zero is not supported (constraint) — full forgiveness is a waive.
- **Admin UI:** the Balance section in `client-detail-client.tsx` gains Waive and Adjust
  alongside Mark settled; cleared rows display their resolution label. `frontend-design`
  invoked before building. Manual-debit creation is explicitly **out of scope** this pass.

---

## Out of scope

- Adding a booking gate on outstanding balance (H-2 documents current no-gate behavior; no
  gate is added).
- Manual/arbitrary admin debit creation (waive + adjust only).
- Client-facing balance/debt surfaces beyond the existing "owed" line and prepay.
- Everything in the action plan outside Group C and Group H's first row.

## Definition of done

- Scoped unit tests green: `client-can-cancel`, `cancellation` (`previewCancellation` all
  tiers), no-show net-of-paid, and the debit-resolution cores (`waiveDebit`,
  `adjustDebit`, and `settleDebit` resolution).
- `npm run typecheck` + ESLint + Prettier clean; TS strict, no `any`.
- Migration applies against the local stack; `resolution` column present.
- `/code-review` clean (cross-model where practical).
- Manual `verify`: a client cancel exercised across full / late / fee tiers, and an admin
  waive + adjust on a real debit.
- Conventional commit(s) on `main`, subject line only.

---

_Last reviewed: 2026-07-12_
