# ADR-0004: Notifier Seam over Inline Email Sends

**Status:** Accepted  
**Date:** 2026-06-10

## Context

Two call sites in the application sent confirmation emails by calling
`sendBookingConfirmation(mailer, payload)` with an inline-constructed
`ResendMailer`:

1. `src/features/booking/mutations/create-booking.mutation.ts` — injected a
   `Mailer` and called `sendBookingConfirmation` directly.
2. `src/features/admin/approval-actions.ts` — constructed `new ResendMailer()`
   and called `sendBookingConfirmation` inline inside `approveBooking`.

Both sites operated at the send-primitive level (one transport, one function
call). There was no single injection point for "notifications as a concept",
which meant:

- Adding a second channel (SMS, push, etc.) would require touching every call
  site rather than one place.
- The `Mailer` dep in `create-booking.mutation.ts` leaked transport-level
  detail into orchestration code.
- A future outbox/retry system (A11 from the SP3 audit) would have no clean
  seam to slot into.

## Decision

Introduce a `Notifier` interface in `src/features/notifications/notifier.ts`
as the single injection point for application-level notifications. The default
implementation, `ResendNotifier` (`resend-notifier.ts`), is a thin pass-through
to the existing `sendBookingConfirmation` sender — zero behavior change.

### Interface shape

Only the event actually sent today is modelled (YAGNI):

```ts
export type NotificationEvent = {
  type: "booking_confirmed";
  payload: BookingConfirmedPayload; // mirrors BookingConfirmationDetails
};
export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
```

`booking_cancelled` and other events are intentionally absent. They belong here
only when the corresponding email exists.

### ResendNotifier

`ResendNotifier implements Notifier` with constructor-injected
`sendBookingConfirmation` and `Mailer` deps (defaulting to the real
implementations) so tests can stub without touching env vars or the Resend SDK.

Best-effort semantics are preserved and centralised: `notify()` catches all
errors from the sender and logs them via `console.error`, then resolves
normally. Call sites no longer need their own try/catch for the send path
(though the outer try/catch in `approveBooking` and the mutation's outer
try/catch are retained to guard the row-load + parse steps above the
`notify()` call).

### Call sites updated

| File                                           | Before                                                  | After                                           |
| ---------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `booking/mutations/create-booking.mutation.ts` | `deps.mailer` + `sendBookingConfirmation`               | `deps.notifier.notify(...)`                     |
| `booking/actions.ts`                           | `new ResendMailer()` passed as `mailer`                 | `new ResendNotifier()` passed as `notifier`     |
| `admin/approval-actions.ts`                    | `new ResendMailer()` + `sendBookingConfirmation` inline | `new ResendNotifier()` + `notifier.notify(...)` |

### Outbox pattern — deferred

The full delivery system (outbox table + worker) is intentionally **not built
in SP3a**. The intended shape, for context:

- A `notification_outbox` row is written in the **same DB transaction** as the
  booking mutation (durability guarantee: if the booking commits, the
  notification row commits).
- A background worker drains the outbox, calling the actual sender, and marks
  rows `sent` or increments a `retry_count`.
- This enables retries, dead-letter inspection, and future channel expansion
  (SMS, push) without touching call sites.

The `Notifier` seam is the prerequisite: a future `OutboxNotifier implements
Notifier` slots in transparently. Building it is a post-program project.

## Consequences

**Positive:**

- Single injection point for all notifications; adding a channel or swapping
  implementations requires changing one class, not every call site.
- Best-effort semantics (log + swallow) are centralised in `ResendNotifier`,
  removing duplicated try/catch blocks from orchestration code.
- `create-booking.mutation.ts` no longer depends on transport-level
  `Mailer`/`sendBookingConfirmation`; it depends on the higher-level `Notifier`
  interface.
- `ResendNotifier` is fully unit-testable with stub deps (no env vars, no Resend
  SDK, no network).

**Trade-offs:**

- The real outbox (durability + retries) is deferred. Until it is built,
  confirmation emails remain best-effort fire-and-forget, same as before.
- The seam is server-side only and must never appear in `index.client.ts`.

---

_Last reviewed: 2026-06-10_
