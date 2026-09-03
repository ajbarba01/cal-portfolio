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
as the single injection point for application-level notifications, with
`ResendNotifier` (`resend-notifier.ts`) as the default implementation.

### Interface shape

`Notifier` takes one `NotificationEvent` and resolves. The event union is the
vocabulary of everything the app actually sends, and it is modelled in two
halves: what a client is told about their own booking, and what Cal is alerted
to. A variant is added when its template exists, not before (YAGNI) — the union
started at a single confirmation event and has grown with each template since.

### ResendNotifier

`ResendNotifier implements Notifier`. It builds the message for the event and
hands it to a `Mailer`: client mail goes to the address the event carries, and
admin alerts route through the admin-alert dispatcher, which owns the address
gate and sends nothing while Cal's alert address is unset. The `Mailer` is
constructor-injectable and constructed lazily, so tests stub it without touching
env vars or the Resend SDK.

Best-effort semantics are centralised here: every failure is logged and
swallowed, so no booking, approval or cron run fails because its mail did not go
out. Call sites do not wrap the send in their own try/catch — the try/catch they
keep guards the row read and parse above the `notify()` call.

Which message a booking gets is not the caller's decision. One entry point takes
a booking id, re-reads the row, and picks the confirmation or the received
acknowledgement from the stored status, so the four paths that create or confirm
a booking (self-serve create, admin create on a client's behalf, approval, and
the series-roll cron) cannot disagree about what was sent.

### Call sites

On the four create/confirm paths no action, mutation or cron constructs a mailer
or picks a template. Each hands a booking id to the notifications feature's
public surface and returns; the send happens behind the seam. Grep the feature's
barrel for the current list of entry points rather than reading one from here.

One sender is still outside the seam: the reminder cron route builds a
`ResendMailer` itself and hands it to the cron runner, which chooses the
reminder template and sends through that raw `Mailer`. It predates the seam and
has not been moved behind it — treat the claim above as covering creation and
confirmation, not reminders.

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
- The booking mutation no longer depends on transport-level mailer detail. It
  takes a "send the confirmation for this booking id" function and stays
  testable with a stub.
- `ResendNotifier` is fully unit-testable with stub deps (no env vars, no Resend
  SDK, no network).

**Trade-offs:**

- The real outbox (durability + retries) is deferred. Until it is built,
  confirmation emails remain best-effort fire-and-forget, same as before.
- The seam is server-side only and must never appear in `index.client.ts`.

---

_Last reviewed: 2026-09-03_
