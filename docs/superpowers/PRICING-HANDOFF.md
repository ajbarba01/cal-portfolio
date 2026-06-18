# Pricing engine — next-session handoff

> Paste/point the next agent here to continue the pricing-engine overhaul. Read [../../AGENTS.md](../../AGENTS.md) + the docs it routes to first. Communication: caveman-full.

## Where things stand (2026-06-18)

**Phase 1 — Pricing Engine Core: COMPLETE on local `main`, UNPUSHED.** 11 commits, `a79263d..f88e863`.

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
2. **Maintainer to confirm 3 live behavioral changes** (correct per TEMP/spec, but they change real quote amounts):
   - house_sitting now bills per-mile travel (5 free, then per-mile) — old model billed $0 for house-sit travel.
   - needy-pet surcharge + puppy discounts + leash-manners add-on are **dormant** until Phase 2 sources their inputs.
   - recurring/premium percentages now live in the config; `settings.recurring_discount_pct` / `holiday_surcharge_cents` are vestigial for pricing.

## Carry-forward phases

- **P2 — source the deferred inputs.** `needyTier`, `anyDogUnder6mo`, `leashManners` (and `others`/fish exclusion) are left at defaults in `buildQuoteInput` (`booking-service-shared.ts`). Wire them from pet species/birthdate so the needy/puppy/leash modifiers fire.
- **P3 — enforce + render.** Enforce `constraints` (intervalMin / min-max duration / maxDogs / allowedSpecies) in the pickers; render `approvalReasons` in `quote-panel.tsx` (carried but not yet shown).
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
