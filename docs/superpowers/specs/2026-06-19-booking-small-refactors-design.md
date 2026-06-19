# Booking Small Refactors — Design

> Five mostly-independent refactors to the booking surfaces, drawn from the maintainer's "now" list in [DEV_NOTES.md](../../DEV_NOTES.md). Each is isolated; they can ship as separate commits in any order.

**Date:** 2026-06-19
**Surfaces touched:** client "your bookings" hub, public booking flow, admin create-on-behalf, shared pricing engine, admin integration test.

## Scope summary

| #   | Change                                                 | Kind             | Surfaces                                         |
| --- | ------------------------------------------------------ | ---------------- | ------------------------------------------------ |
| 1   | Remove search on client "your bookings"                | UI removal       | client hub only (admin keeps client-name search) |
| 2   | Fix bookings list showing "Service" for every row      | bug fix          | client hub only                                  |
| 3   | Extra exercise priced per-night, not per-pet-per-night | pricing + config | shared (all booking surfaces inherit)            |
| 4   | Remove repeat-weekly UI, keep backend                  | UI gate          | public + admin-create (edit never had it)        |
| 5   | Remove "admin test description" pollution              | test + data      | walk `service.description` everywhere it renders |

---

## Item 1 — Remove search on "your bookings" (client only)

**Why:** The client search predicate ([account-bookings-client.tsx](<../../../src/app/(site)/(account)/account/bookings/_components/account-bookings-client.tsx>)) only matches `service_name` and the status label — both already exposed as dedicated Select filters in the same bar. It is fully redundant; nothing is searchable that the dropdowns don't already cover.

**Change (client hub only):**

- Remove the `SearchField` import, the `query` state, `changeQuery`, and the `if (!q)…` search branch inside the `filtered` memo (status + service Selects remain the filter set).
- Filter bar keeps: status Select, service Select, Calendar⇄List multiswitch, `ResultCount`.

**Cross-surface check:** Admin hub ([bookings-calendar-client.tsx](<../../../src/app/(site)/(admin)/admin/bookings/_components/bookings-calendar-client.tsx>)) searches by `client_name` — genuinely useful, **untouched**. No shared component; deleting client search cannot affect admin.

**Interactions:** Calendar view, pagination, and result count are all driven by `filtered`, which still recomputes from status/service. No behavior change beyond losing the (redundant) text box.

---

## Item 2 — Bookings list shows "Service" for every row (bug)

**Root cause:** [page.tsx:102](<../../../src/app/(site)/(account)/account/bookings/page.tsx>) reads `b.services?.[0]?.name ?? "Service"`. The `bookings → services` relationship is **to-one**, so Supabase nests it as a single object, not an array. `[0]` is always `undefined` → every row falls back to the literal `"Service"`. The sibling `parsePets` helper already handles the object-or-array ambiguity; `services` was simply missed.

**Change (client page only):**

- Widen `RawBookingRow.services` to `{ name: string; slug: string } | { name: string; slug: string }[] | null`.
- Add a small normalizer (mirroring `parsePets`) that returns the first/only service object, and use it for both `service_name` and `service_slug`. Keep `"Service"` / `""` as the genuine no-service fallback.

**Cross-surface check:** Admin list's `service_name ?? "Service"` is fed by the repository (already flattened) and both edit pages read `serviceRow.name` from a `.single()` object — none share this bug. Isolated fix.

**Verification:** A unit test on the row-mapping (extract the normalizer to a testable pure function) asserting an object-shaped `services` yields the real name. Manual: load `/account/bookings` and confirm rows show real service names.

---

## Item 3 — Extra exercise per-night, not per-pet-per-night

**Decision:** Full removal of the `perScale` concept (confirmed).

**Why full removal:** `perScale` has exactly one consumer (the `exercise` allowance modifier), one value (`"perDogPerDay"`), set on one service (house-sitting). That value is now deemed wrong-by-policy. A dormant "multiply by dogs" flag that produces incorrect pricing is a footgun, so the whole option is removed rather than left dead.

**Changes:**

- **Migration** (`supabase/migrations/2026XXXXXXXXXX_exercise_per_night.sql`): for `pricing_type = 'house_sitting'`, rewrite the `Extra exercise` modifier object to drop the `perScale` key. Use a `jsonb` update that rebuilds the modifiers array (or `#-` to remove the nested key) so existing prod/local configs are corrected.
- **`src/features/pricing/modifier-types.ts`:** remove `perScale?: "perDogPerDay"` from the `allowance_then_per_unit` member.
- **`src/features/pricing/config-schemas.ts`:** remove the `perScale` zod field. Zod object strips unknown keys, so any stored config still carrying `perScale` parses fine (key dropped) — but the migration cleans them anyway.
- **`src/features/pricing/modifiers/evaluate.ts`:** delete the `scale` line; the exercise line becomes `blocks * cents * days`.
- **Tests:** update `evaluate.test.ts`, `quote.test.ts`, `config-schemas.test.ts` to drop `perScale` from fixtures and assert per-night (×1) pricing.

**Interactions:** Pricing flows through `evaluate` for every surface (public/admin-create/edit previews and persisted quotes), so all inherit the corrected amount. The "Extra exercise" quote line label is unchanged; only the amount drops for multi-dog house-sits. No UI change.

---

## Item 4 — Remove repeat-weekly UI, keep backend

**Decision:** Feature-flag constant (confirmed). Keep `RecurringControls.tsx`.

**Why:** Backend (recurring rule build in `use-booking-scheduler`, series-cron, actions, settings) stays intact and dormant; re-enabling is flipping one flag. `recurringOn` defaults `false`, so with the UI gone no recurring rule is ever built.

**Changes (the two create surfaces — public + admin-create):**

- Introduce `const RECURRING_UI_ENABLED = false;` (one per create-surface hook, or a single shared constant in the booking feature — implementer's call during plan).
- Gate both the `extraSection` render **and** the step-counter increment on `supportsRecurring && RECURRING_UI_ENABLED`:
  - Public: [use-service-booking.ts:485](<../../../src/app/(site)/(marketing)/book/[serviceSlug]/_components/use-service-booking.ts>) — `recurringStepLabel` only increments `stepCounter` when the flag is on, so Forms/Notes renumber with no gap.
  - Admin-create: same treatment for its `step4Label` / equivalent.
- `booking-flow` already renders `{extraSection && …}`, so a falsy section drops the whole step shell. Both create surfaces' `extraSection` is recurring-only → it becomes empty and the step disappears. (Edit's `extraSection` is the notes card — unaffected, edit never had recurring.)
- Leave `RecurringControls.tsx` in place (unused but ready).

**Interactions / step numbering:** This is the one item with a cross-step interaction. Public flow steps go 1 Schedule · 2 Pets · 3 Details · ~~4 Repeat~~ · 4 Forms · 5 Notes. Admin-create similarly. Verify the numbered heads are contiguous after the flag is off. No edit-surface impact.

---

## Item 5 — Remove "admin test description" pollution

**Decision:** Test fix + local reset; flag prod (confirmed).

**Root cause:** The integration test [admin.test.ts](../../../src/features/admin/admin.test.ts) "valid update persists" calls `updateServiceCore` against a real Supabase and sets the **walk** service's `description` to `Admin test description <ts>`, never restoring it. That value persists and renders wherever `service.description` shows (e.g. `/book/walk` header). Not intentional copy.

**Changes:**

- **Make the test hermetic:** capture the walk service's original `description` in `beforeAll` (or before the assertion) and restore it in `afterAll`. The assertion logic is unchanged; it just no longer leaves residue. (Confirm no other test in the file leaves comparable writes; if found, same restore pattern.)
- **Local reset:** restore the walk description to its seed value via re-seed / `supabase db reset` (or a targeted UPDATE) so the local DB no longer shows the polluted string.
- **Prod:** the prod project (`mvrbmrzrifamkbnjfrvd`) may carry the polluted walk description from a past test run. **Flag for the maintainer** — provide a one-line `UPDATE services SET description = <seed value> WHERE slug = 'walk'` to run (or run on explicit approval). Do **not** touch prod silently.

**Interactions:** None functional — `service.description` is display-only copy. Cleaning it just restores the intended marketing/service text.

---

## Global constraints (inherited)

- TypeScript `strict`, no `any`. Design tokens only. No new drop shadows.
- Commit messages: subject-line-only Conventional Commits, no body/trailers, no internal identifiers.
- Single `main` branch; commit only after verification; stage files by name.
- PowerShell mojibakes UTF-8 — use Edit/Write for source edits.
- Same-commit doc rule for any file add/move/delete.
- Per-task unit tests via `npx vitest run <path>` (not full `vitest run` — integration tests need the local stack).

## Self-review notes

- **Independence:** items 1, 2, 5 are single-file/single-concern; item 3 spans pricing + a migration; item 4 spans the two create hooks. No item depends on another — any commit order works.
- **Bug vs. feature:** item 2 is a genuine data-shape bug masked by a fallback; item 5 is test pollution. Both are corrections, not redesigns.
- **Reversibility:** item 4 is one-flag reversible; item 3 is intentionally non-reversible (the wrong option is deleted).
- **Prod safety:** item 5 prod cleanup is gated on explicit maintainer action.
