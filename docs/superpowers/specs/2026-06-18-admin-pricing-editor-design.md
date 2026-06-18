# Admin pricing editor (P4) — design

> Rebuilds the disabled `/admin/services` pricing editor to read and write the
> modifier-list `pricing_config` (`{ modifiers, constraints }`). Phase 4 of the
> pricing-engine overhaul. Read [PRICING-HANDOFF](../PRICING-HANDOFF.md) and the
> docs `AGENTS.md` routes to first.

## Goal

Restore in-app editing of service pricing. After the Phase-1 config refactor the
editor was disabled (a read-only "Phase 4" note) because the old flat-field
editor (`pricingFields`/`fieldsToConfig`) emits a shape `parsePricingConfig`
rejects. This phase ships a **curated, value-only** editor that lets an admin
change the numeric values of a service's existing pricing — built so it can later
expand to full modifier control without a rewrite.

### Scope decisions (locked with maintainer)

- **Audience / ambition:** curated common-rates editor, architected for later
  expansion to full control.
- **Editable in v1:** every **numeric value leaf** of the modifiers that already
  exist (`cents`, `pct`, `freeUnits`, and each `tiers[i].cents/pct`), plus the
  numeric **constraints** and the live `default_duration_min` column.
  Structure/identity (`kind`, `id`, `label`, `unit`, `condition`, `source`,
  `manual`, `optIn`, `perScale`, `from`) is **read-only** — no add/remove/relabel.
  `allowedSpecies` is shown read-only.
- **Validation guards:** editor-side inline guards **and** a hardened Zod schema
  (defense in depth).
- **`max_pets` column:** removed from the admin write path (dead/competing source
  of truth — booking enforces `constraints.maxDogs`).
- **`default_duration_min` column:** surfaced in the editor (a live booking knob
  currently editable nowhere).

## Why this is safe (and why value-only)

`updateServiceCore` already accepts `pricing_config`, validates it with
`parsePricingConfig` (ZodError → `validation_error`, never throws across the
boundary), and revalidates `/admin/services` + the static public `/services`.
**The server is complete; this phase is client-side** plus a small schema
refinement and one dead-path removal.

Because the editor only edits the **values** of modifiers that already exist (it
never changes a modifier's `kind`), it cannot produce a type-inappropriate config
(e.g. a walk can't gain `base_per_night`). Type-appropriateness is preserved by
construction — this is the core reason the value-only boundary is the safe v1.

## Architecture

Three client pieces + two small non-UI changes. No migration.

### 1. Pure module — `src/features/admin/pricing-config-fields.ts` (repurposed)

The old exports (`pricingFields`, `fieldsToConfig`, `PricingField`, `FieldKind`)
are dead (only their test imports them) and are replaced.

```ts
export type PricingFieldKind = "cents" | "pct" | "int" | "minutes";

export interface PricingEditField {
  /** Stable address into the config, e.g. "m.0.cents", "m.3.tiers.0.pct", "c.maxDogs". */
  path: string;
  label: string;
  kind: PricingFieldKind;
  value: number;
  group: "rates" | "limits";
  /** Input/guard bounds; absent = unbounded on that side. */
  min?: number;
  max?: number;
  /** Cents that may legitimately be negative (discount modifiers). */
  allowNegative?: boolean;
}

export function deriveEditableFields(
  config: ServicePricingConfig,
): PricingEditField[];
export function setLeaf(
  config: ServicePricingConfig,
  path: string,
  value: number,
): ServicePricingConfig;
```

- **`deriveEditableFields`** is a pure read used for rendering. It walks
  `config.modifiers` in array order, emitting one field per numeric value leaf,
  then the present numeric `constraints`. Deterministic order.
  - Leaves emitted: `cents`, `pct`, `freeUnits`, `tiers[i].cents`, `tiers[i].pct`.
  - Never emitted (read-only): `kind`, `id`, `label`, `unit`, `condition`,
    `source`, `manual`, `optIn`, `perScale`, `tiers[i].from`.
  - `allowNegative: true` only for `flat_per_unit` and `flat_per_night_toggle`
    cents. All other cents fields use `min: 0`. `pct` fields use `min: 0, max: 100`.
  - **Labels:** use the modifier's own `label` where present. Label-less kinds
    get synthesized labels: `base_per_hour` → "Base rate (per hour)",
    `base_per_night` → "Base rate (per night)", `flat_per_unit` →
    "Each dog/cat/animal" (by unit), `min_floor` → "Minimum charge". Multi-leaf
    modifiers get sub-labels: `allowance_then_per_unit` → "<label> — free
    miles/min" and "<label> — per mile/min"; `tiered_per_unit` tiers →
    "<unit> — from <from>".
  - **Constraints (`group: "limits"`)**, only when present in the config:
    `intervalMin` (int, `min: 1`), `minDurationMin`/`maxDurationMin` (minutes,
    `min: 0`), `maxDogs` (int, `min: 1`), `softDistanceWarnMiles` (int/number,
    `min: 0`).

- **`setLeaf`** deep-clones the config, writes the single addressed leaf
  (`Math.round` for `cents`/`int`/`minutes`; `pct` kept as entered), leaves
  everything else untouched, and returns a new `ServicePricingConfig`. Throws on
  an unknown/un-addressable path (defensive — a derive/UI mismatch is a bug, not
  a silent no-op).

`default_duration_min` is a **column**, not part of the config, so it is **not**
produced by this module. The editor tracks it as a separate column-backed field.

### 2. Money conversion — extend `src/features/pricing/display.ts`

`centsToDollars` (booking `format-money.ts`) and `formatCents` (display.ts) are
display formatters (`"$1,234.56"`) — wrong for an editable input. Add pure,
tested helpers used by the input component:

```ts
export function centsToDollarsNumber(cents: number): number; // 1999 → 19.99
export function dollarsToCents(dollars: number): number; // 19.99 → 1999 (Math.round, exact; supports negatives)
```

Lives in the pricing feature (admin already imports pricing; avoids admin→booking
coupling).

### 3. UI components

**State model — the config is the source of truth.** No edits-accumulator: an
accumulator would force `setLeaf` to be applied against the exact config that
`deriveEditableFields` ran on, an index-drift footgun. Instead the parsed config
object IS the edit state and each input writes back into it immutably.

- **`PricingFieldInput`** (`{ field, value, onChange, error }`) — renders by
  `kind`: `cents` → `$` number input (value `centsToDollarsNumber`, change
  `dollarsToCents`, `step=0.01`, sign allowed when `allowNegative`); `pct` →
  `%` number (`step=1`, 0–100); `int`/`minutes` → plain number. Associates
  `label`/`id` and `aria-describedby` for the error. Reusable — also serves the
  future full editor.

- **`PricingFieldsEditor`** (`{ config, defaultDurationMin, onConfigChange,
onDefaultDurationChange, errors }`) — calls `deriveEditableFields`, groups into
  **Rates & discounts** (`rates`) and **Booking limits** (`limits` +
  `default_duration_min` + read-only `allowedSpecies`), renders a
  `PricingFieldInput` per field wired through `setLeaf`. Pure presentational +
  error display. Empty modifiers (meet_greet) → a "no priced fields" note. This
  is the unit the focused render test targets.

- **`ServiceEditForm`** (`{ service, onSaved }`) — extracted from the current
  `services-client.tsx` (which mixes list + edit + save and would bloat). Owns
  the edit state `{ name, description, requiresApproval, active, config,
defaultDurationMin }`, parses `service.pricing_config` on open, runs
  validation, and saves.

- **`ServicesClient`** — reduced to the list + which row is editing; renders
  `ServiceEditForm` for the editing row.

Frontend-design skill is invoked at implementation time (repo rule): semantic
tokens only, no hardcoded colors, visible focus, keyboard nav, mobile parity;
reuse `Input`/`Label`/`Surface`/`Button` primitives.

## Data flow

1. **Open edit:** `parsePricingConfig(service.pricing_config)`.
   - Throws (legacy/unmigrated row) → **defensive fallback**: pricing section is
     read-only with a note; name/description/toggles remain editable. (Lets the
     editor ship before or after the prod migration.)
   - Succeeds → seed `config` + `defaultDurationMin` into edit state.
2. **Edit:** each `PricingFieldInput` change → `setLeaf(config, path, value)` →
   `onConfigChange(next)` (or `onDefaultDurationChange`). Re-render derives fields
   from the new config.
3. **Save:**
   - **Editor-side guards** (instant): every field non-empty and within
     `min`/`max`; `minDurationMin ≤ maxDurationMin`; `maxDogs ≥ 1`;
     `intervalMin ≥ 1`. Failures → inline per-field errors, block save.
   - **`parsePricingConfig(config)`** (belt-and-suspenders): on `ZodError`, map
     `issue.path` (e.g. `["constraints","maxDogs"]`, `["modifiers",1,"cents"]`)
     back to a field `path` and show inline; else a summary message.
   - `updateService({ serviceId, name, description, requires_approval, active,
pricing_config: config, default_duration_min })`.
   - Server re-validates authoritatively and revalidates `/admin/services` +
     `/services`.

## Non-UI changes

### Schema hardening — `src/features/pricing/config-schemas.ts`

Add a `.refine`/`.superRefine` to `constraintsSchema`:

- when both present, `minDurationMin ≤ maxDurationMin`;
- when present, `maxDogs ≥ 1`.

(`intervalMin` is already `positive`.) This closes the gap where
`parsePricingConfig` accepted incoherent configs that break booking (incoherent
clamp / a 0-cap that blocks all booking). It is the real single source of truth —
used by booking, the seed, and the server. Current seeds already satisfy it.

### Dead-path removal — `src/features/admin/services-actions.ts`

Remove `max_pets` from `updateServiceInputSchema` and the update write payload.
Booking enforces the pet cap from `constraints.maxDogs` (`maxPetsOf`); writing the
`max_pets` column was a silent no-op against booking — a competing source of
truth. The column read/select stays (dropping it is a migration, out of scope).

## Testing

- **`pricing-config-fields.test.ts`** (rewrite): `deriveEditableFields` on the
  walk, house_sitting, and meet_greet seeds → exact field lists
  (path/label/kind/value/group/min/allowNegative); `setLeaf` updates one leaf
  immutably and preserves ids/sources/tiers; unknown path throws; negative-cents
  field derivation; tier field derive + set.
- **`config-schemas.test.ts`** (extend): `minDurationMin > maxDurationMin`
  rejected; `maxDogs: 0` rejected; a valid config still passes; each seed parses.
- **money helpers** (new test): `dollarsToCents`/`centsToDollarsNumber` exact
  rounding incl. `19.99`, `25`, `0.1`, and negatives.
- **`PricingFieldsEditor` render test:** walk config → rate + limit inputs with
  seeded values + read-only species; editing the base rate fires
  `onConfigChange` with updated cents; `min > max` surfaces an error;
  meet_greet → "no priced fields" note.
- **`ServiceEditForm` render test:** edit a walk row, change a rate, Save →
  `updateService` called with a `pricing_config` reflecting the edit +
  `default_duration_min`; an unparseable-config row → read-only fallback.
- **`services-actions`/`admin.test.ts`:** confirm `max_pets` is no longer in the
  update payload.

Unit tests + `tsc` are the per-task gate; DB-integration tests need a seeded
local stack and are not a per-task gate.

## Out of scope (future expansion)

Add/remove/relabel modifiers; edit conditions/sources/`manual`/`optIn`; edit
`allowedSpecies`; add a currently-absent constraint; live quote preview; dropping
the `max_pets` column (migration); optimistic-concurrency on `updateService`
(`updated_at` — accepted limitation for a single-operator business).

_Last reviewed: 2026-06-18_
