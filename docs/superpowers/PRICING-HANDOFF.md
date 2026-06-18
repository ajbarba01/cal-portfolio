# Pricing engine — next-session handoff

> Paste/point the next agent here to continue the pricing-engine overhaul. Read [../../AGENTS.md](../../AGENTS.md) + the docs it routes to first. Communication: caveman-full.

## Where things stand (2026-06-18)

**Phase 1 (Pricing Engine Core) + P3 (Constraints + Approval Reasons): COMPLETE on local `main`, UNPUSHED.** P3 adds 11 commits (`1ba8d3f..34dd397`) atop Phase 1; whole branch reviewed, `tsc` clean. The next sections detail Phase 1; P3 specifics are under "Carry-forward phases → P3" below.

**Phase 1 — Pricing Engine Core.** 11 commits, `a79263d..f88e863`.

What landed:

- Replaced the 5 hand-written `quote*()` fns with one generic `evaluate(config, inputs)` over a closed `Modifier` discriminated union (fixed 7-phase order: base · per-unit · pct_surcharge · min_floor · auto-discount · manual+custom · travel).
- `services.pricing_config` is now Zod-validated `{ modifiers, constraints }` jsonb; `parsePricingConfig(raw)` is **single-arg**.
- `quote(input)` preserved (delegates to `evaluate`); `QuoteBreakdown`/`QuoteLine` shape frozen (persisted).
- Typed client-facing approval reasons: `deriveApprovalWithReasons` → `{ decision, reasons }`, carried on `BookingQuotePreview.approvalReasons`.
- Reseeded all 4 services + meet_greet to modifier configs (migration `20260618120000_pricing_modifier_config.sql` + `seed.sql`).
- Threaded the new flat `QuoteInput` through every caller (booking cores, kiche, services-repo, admin, marketing page).
- Last commit `f88e863`: booking-flow forms-gate UX — the price preview no longer withholds the quote for incomplete profiles; `requirements` rides along on the preview and the gate moves to **commit** (client blocks, admin warns). Maintainer-verified.

Source of record:

- Plan: [plans/2026-06-18-pricing-engine-core.md](plans/2026-06-18-pricing-engine-core.md)
- Spec: [specs/2026-06-18-pricing-engine-core-design.md](specs/2026-06-18-pricing-engine-core-design.md)
- Umbrella: `~/.claude/plans/i-d-like-to-do-foamy-flamingo.md`
- Full task-by-task record + every controller/maintainer decision: `.git/sdd/progress.md` (SDD ledger) — **read this before touching pricing.**

Build: `tsc --noEmit` clean; pricing unit tests 101/101; pre-commit hook passes with **no** `--no-verify`. Local DB migrated (`npx supabase migration up --local` applied `20260618120000`).

## Do next / pending

1. **Prod migration NOT pushed.** Prod Supabase still holds old-shape `pricing_config`; `services-repo` silently skips unparseable rows → the live site would show "services coming soon" and quotes would parse-error. Push `20260618120000_pricing_modifier_config.sql` to the prod project (separate project — only with maintainer ask; see the `deploy-env-topology` memory).
2. **Maintainer to confirm live behavioral changes before the prod ship** (all accepted in-session; they change what clients see/can book):
   - _From Phase 1 (quote amounts):_ house_sitting now bills per-mile travel (5 free, then per-mile) — old model billed $0 for house-sit travel; needy-pet surcharge + puppy discounts + leash-manners add-on are **dormant** until Phase 2 sources their inputs; recurring/premium percentages now live in the config (`settings.recurring_discount_pct` / `holiday_surcharge_cents` vestigial for pricing).
   - _From P3 (what clients can book):_ **walks now cap at 2 dogs** (was unlimited); walk/check_in/training **booking durations are clamped** to seeded min/max (walk 30–180, check_in 15–60, training 30–60); check_in/training get a **finer 5-min slot-start grid**. House-sit's config `allowedSpecies:[all 7]` is intentionally **inert** (pets are dog/cat by DB enum).

## Carry-forward phases

- **P2 — source the deferred inputs.** `needyTier`, `anyDogUnder6mo`, `leashManners` (and `others`/fish exclusion) are left at defaults in `buildQuoteInput` (`booking-service-shared.ts`). Wire them from pet species/birthdate so the needy/puppy/leash modifiers fire.
- **P3 — enforce + render. DONE (local main, unpushed).** Spec `2026-06-18-pricing-constraints-and-reasons-design.md`, plan `2026-06-18-pricing-constraints-and-reasons.md`, ledger `.git/sdd/progress.md`. `approvalReasons` now render in `quote-panel.tsx` by severity; `constraints` carried on `ServiceDetail` and drive allowed-species, pet cap (`maxDogs`), duration clamp, at-cap feedback, and the slot-start grid (`intervalMin`). Added `@testing-library/jest-dom` test infra. tsc clean; per-task + final review done. **Follow-up I1 RESOLVED by P3.1 below** (client-edit now caps; admin-create intentionally uncapped). Plus the deferred Minors in the ledger.
- **P3.1 — pet-cap surface consistency. DONE (local main, unpushed).** Commit `e799d83` (`feat(booking): enforce pet cap on client-edit`). Client-edit now threads `maxPets` (`use-edit-booking.ts` → `edit-booking-client.tsx` `maxSelect={maxPets}`), mirroring the `durationBounds` passthrough; the at-cap notice in `pet-assignment.tsx` fires automatically, so walk caps at 2 dogs and training is single-select on edit. **Admin-create stays uncapped by decision** — it is an intentional override surface (warn-not-block elsewhere), so no `maxSelect` there. Guarded by a new render test `edit-booking-client.cap.test.tsx`. Note: a legacy over-cap booking's seeded pets are not force-removed (the cap only blocks growth) — consistent with the public surface. tsc clean; cap + characterization + scheduler-constraint + pet-assignment suites green.
- **P4 — admin pricing editor.** `/admin/services` pricing fields are currently **disabled** (read-only Phase-4 note); `fieldsToConfig`/`pricingFields` in `pricing-config-fields.ts` are dead. Rebuild the editor to emit `{ modifiers, constraints }`.
- **Deferred Minors** (OK-to-defer, enumerated in the ledger): schema hardening (`.nonempty()`/`.int()` on tiers/`from`/`pct`/`maxDogs`); `distance_unlikely` can stack after `distance_refuse`; a few test-quality nits; `admin-actions-core` duplicated kiche-toggle computation.

## Decisions locked (do not relitigate)

- `billableMiles` = **one-way** road miles (`haversineMiles × road_factor`).
- `flat_per_unit` multiplies by nights.
- `quote()` public signature + `QuoteBreakdown` shape are frozen.

## Gotchas

- The worktree has **unrelated, pre-existing** uncommitted edits: `TEMP.md`, `docs/DEV_NOTES.md`, `src/content/marketing.ts`, `SYNC.md`. NOT part of pricing — leave them unless told.
- Pre-commit hook = `lint-staged` + full `tsc`. Local Supabase stack is usually running (`npx supabase status`); never point local tooling at prod without an explicit ask.
- For execution use `superpowers:subagent-driven-development` (fresh subagent per task, review each diff).

_Last reviewed: 2026-06-18_
