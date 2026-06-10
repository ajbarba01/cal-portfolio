# ADR-0003: Action–Mutation Split

**Status:** Accepted  
**Date:** 2026-06-10

## Context

Server actions in `src/features/booking/actions.ts` interleaved four distinct concerns in a single function body:

1. **Auth** — `auth.getUser()` / session cookie read
2. **Dep construction** — `createServiceClient()`, `createSupabaseBookingRepository()`
3. **Core logic + orchestration** — calling the domain core, sending the confirmation email
4. **Result mapping** — returning the domain result to the client

This coupling (finding A6 from the SP3 audit) made it impossible to unit-test the orchestration logic without a Next.js runtime, a live Supabase client, or a running Resend account. The only tests that exercised this layer were integration tests against the real DB.

`createBooking` was the only action with non-trivial orchestration: after calling `createBookingCore` it performed a best-effort DB read + confirmation email send that was impossible to stub without pulling in the live service client.

## Decision

Split each **server action** that contains testable orchestration into two layers:

- **Action (thin adapter):** authenticates the caller (`getUser()` + redirect on miss), constructs real deps (service-role repo, mailer, narrow `loadConfirmationRow` closure), and delegates to the mutation. Owns any Next.js runtime calls (`redirect`, future `revalidatePath`) and dep construction.

- **Mutation (injected-deps function):** auth-free, runtime-free, unit-testable orchestration. Takes explicit deps (repo, mailer, `loadConfirmationRow`, `now`) + parsed input; returns the domain result. No `auth()`, no `getUser()`, no `revalidatePath` inside.

The mutation for `createBooking` lives in `src/features/booking/mutations/create-booking.mutation.ts` and is tested in `create-booking.mutation.test.ts`.

### Scope discipline (YAGNI)

Extraction was applied **only where it adds real unit-testability** over the existing core tests:

| Action                                          | Decision                            | Reason                                                                                                                       |
| ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `createBooking`                                 | Extracted → `createBookingMutation` | Email orchestration (core call + best-effort email + `loadConfirmationRow`) is non-trivial and was previously untestable     |
| `rescheduleBooking`                             | Left as-is                          | Trivial pass-through to `rescheduleBookingCore` — mutation adds no testability                                               |
| `cancelBooking`                                 | Left as-is                          | Admin-bypass auth logic stays in the action layer; the core call itself is trivially delegated — no orchestration to extract |
| `editBooking`                                   | Left as-is                          | Role→policy derivation is auth-layer logic; core call is direct — no orchestration to extract                                |
| `createBookingForClient`                        | Left as-is                          | Target-client verification is auth/policy logic; core call is direct                                                         |
| `grantFullRefund` / `markNoShow` / `settleDebt` | Left as-is                          | `requireAdminDeps()` + core call — trivially thin already                                                                    |

### Revalidation

No booking-domain action calls `revalidatePath` or `revalidateTag`. The `revalidation.ts` file was **not created** — creating it would add runtime machinery that doesn't exist, changing behavior.

## Consequences

**Positive:**

- `createBookingMutation` is fully unit-testable with stub deps (no Next.js, no DB, no Resend).
- The best-effort email path is covered by 8 assertions: success delegation, email called on success, mailer failure doesn't alter result, mailer throw doesn't alter result, skip when no email, skip when `loadConfirmationRow` returns null, `slot_taken` propagated, `refuse` propagated.
- The `Mailer` interface is now exported from `@/features/notifications` (public barrel), enabling future mutation tests to stub it without violating the boundaries rule.
- The action's external signature and return union are unchanged — zero callsite impact.

**Trade-offs:**

- The five trivially-thin actions were deliberately left unconverted (YAGNI). If they grow orchestration in a future pass, the pattern is established and easy to follow.
- The `loadConfirmationRow` injection point is a narrow closure rather than a full Supabase client stub — the mutation tests stub only what they need (the narrowest possible dep surface).

---

_Last reviewed: 2026-06-10_
