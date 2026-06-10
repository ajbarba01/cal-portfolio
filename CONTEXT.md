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
