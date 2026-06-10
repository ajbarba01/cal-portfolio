# DB seeding framework (SP2) — design

> Resolves finding S1 in the [audit register](2026-06-10-audit-findings.md), per [roadmap §SP2](2026-06-10-professionalization-roadmap-design.md). Goal: `supabase db reset` + one command reproduces any named local DB state; ends the accidental-wipe pain. Test factories stay separate (roadmap decision).

## Problem

No `supabase/seed.sql`, no scenario seeder. Every local reset destroys hand-built users/bookings/availability; rebuilding by hand is slow and unrepeatable. Later SPs (payments, admin, cohesion, perf) all need known DB states to verify against.

## Reality check vs roadmap wording

Roadmap says "seed.sql baseline (services, settings, admin user)". Audit found services + settings are **already seeded by migrations** (`20260529205144_seed.sql`, `20260608120001_seed_meet_greet_service.sql`) and therefore restored by every `db reset` — locally and in prod. Re-inserting them in `seed.sql` would duplicate rows (settings is a single-row table). So:

- **Migrations stay the only owner of services + settings.** Seeding never touches them.
- **`seed.sql` owns the one thing reset loses that every state needs: the local admin user.**

## Design

Two layers, both deterministic:

### 1. `supabase/seed.sql` — local baseline

- Creates one admin auth user with fixed UUID + known credentials (`admin@local.test`), confirmed email, matching `auth.identities` row; profile (auto-provisioned by trigger) updated to `role='admin'`, `onboarding_status='approved'`, origin-area coords.
- Wrapped in `begin; … commit;` (seed files are not auto-transactional).
- Runs automatically on `supabase db reset` / first `start` via existing `config.toml` `[db.seed] sql_paths = ["./seed.sql"]`. Seed files never run against prod (`db push` applies migrations only) — local-only by construction.
- Result: bare `db reset` always yields a login-able admin, zero extra steps.

### 2. `scripts/db-seed/` — TypeScript scenario seeder

`npm run db:seed -- <scenario>` (runner: `tsx --env-file=.env.local`, service-role client from `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` — same vars the app uses).

**Safety guard (non-negotiable):** seeder refuses to run unless the target URL host is `127.0.0.1` or `localhost`. No override flag. Pointing local tooling at prod requires an explicit maintainer ask and a deliberate code change, not a CLI flag typo.

**Wipe-first semantics:** every scenario starts identically — delete all rows from scenario-owned public tables (FK-safe order), delete all non-admin auth users (Admin API, cascades profiles), ensure admin exists (lookup by email, create via `auth.admin.createUser` if absent — so the seeder also works if `seed.sql` was skipped). Services + settings untouched. Running the same scenario twice gives identical state — idempotent by reconstruction, not by upsert.

**Scenario = ordered list of named steps; scenarios compose.** Registry maps name → step list; later SPs extend by adding steps/scenarios (standing rule). Step helpers (`createClient`, `insertBooking`, `insertSeries`, …) live in a seeder-local factories module — deliberately separate from unit-test factories.

**Determinism:** fixed emails/names/pets/amounts; one shared password; fake Stripe ids (`pi_seed_…`); dates computed relative to "now" (busy-week anchors to the current Mon–Sun week; times expressed in `America/Denver` inside the booking window; same-class bookings never overlap — exclusion constraint). Each run prints a summary: per-table row counts + login credentials.

### Scenarios

| Scenario         | State produced                                                                                                                                                                                                                                                                                                                                   | Serves                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `fresh`          | Wipe + admin only. Clean slate.                                                                                                                                                                                                                                                                                                                  | any manual testing baseline     |
| `busy-week`      | Approved clients with pets (dogs + cats, multi-pet), availability windows + overnight nights this/next week, dense current week of bookings across all services and statuses (`pending_approval` / `confirmed` / `completed`), one weekly series with materialized occurrences + a `skipped_starts` entry, one resident (house-sitting) booking. | scheduler/calendar work, SP6    |
| `payment-states` | Bookings covering every payment state: `unpaid`; payments rows in `requires_payment` / `succeeded` (booking `paid`) / `refunded` / `failed`; one `no_show` booking; `client_debits` for `late_cancel` + `no_show` (one settled, one outstanding → debt gate active for that client).                                                             | SP4 payments work (PAY1–PAY7)   |
| `admin-demo`     | `busy-week` + `payment-states` + admin-surface extras: inquiries (guest + client-linked, `new` + `resolved`), reviews (`pending` / `published` / `rejected`), clients at every onboarding status (incl. `declined`), a `meet-greet` booking, one `kiche_allowed` client, pending approvals queue non-empty.                                      | SP5 admin overhaul, demoing Cal |

### Testing & docs

- Pure helpers (date anchoring, scenario composition/registry) unit-tested (constitution: core logic pure + tested). DB-writing steps verified by running the seeder against the local stack — each step asserts its inserts succeeded (fail loud, non-zero exit), plus manual `verify` gate.
- DESIGN.md gets a short "Local data seeding" note (project-specific tooling fact); HANDOFF gotchas updated. Same-commit rule.

## Alternatives considered

- **`@snaplet/seed` (Supabase's documented AI/auto seeder):** unmaintained since 2024-07 (v0.98.0, hosted service shut down; community fork unpublished to npm). Rejected — dependency risk dwarfs benefit at this schema size.
- **Faker-generated data:** rejected — verification scenarios need stable, predictable fixtures, not volume.
- **Admin user via seeder only (no `seed.sql`):** rejected — bare `db reset` should leave a working login without remembering a second command; SQL auth insert is local-only and acceptance-tested (sign-in check) to catch GoTrue schema drift.

## Sources (industry validation, 2026-06-10)

- Supabase docs — [Seeding your database](https://supabase.com/docs/guides/local-development/seeding-your-database): `seed.sql` + `[db.seed] sql_paths`, runs on `db reset`; multiple-file ordering.
- Supabase docs — [auth.admin.createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser): Admin API for programmatic users (service role, server-side only).
- GitHub discussions [#1323](https://github.com/orgs/supabase/discussions/1323) / [#9251](https://github.com/orgs/supabase/discussions/9251) + [Laros, "Seeding users in Supabase"](https://laros.io/seeding-users-in-supabase-with-a-sql-seed-script): SQL-seeded auth users need `auth.identities` + confirmed email; works locally (superuser); Admin API is the robust path on hosted projects.
- [supabase-community/seed](https://github.com/supabase-community/seed) + [Snaplet open-source announcement](https://supabase.com/blog/snaplet-is-now-open-source): `@snaplet/seed` maintenance status.

## Definition of Done

- `npx supabase db reset` alone → login-able local admin.
- All four scenarios run green, twice consecutively (wipe idempotence), against the local stack.
- Safety guard refuses non-local URLs.
- `npm run typecheck` + `npm run lint` + unit tests on pure helpers green; fresh-session `/code-review`; manual `verify` (sign in as seeded admin + client, see seeded data in app).
- Finding S1 pruned from the register; HANDOFF progress + session log updated; DESIGN.md seeding note landed.

---

_Last reviewed: 2026-06-10_
