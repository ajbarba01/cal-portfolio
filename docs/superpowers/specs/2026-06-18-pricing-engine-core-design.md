# Phase 1 — Pricing Engine Core (design spec)

> Umbrella: `~/.claude/plans/i-d-like-to-do-foamy-flamingo.md`. This spec covers **Phase 1 only**:
> the pure, tested pricing engine + config/seed migration. No UI, no pet-model change, no
> booking-flow enforcement (Phases 2–5). The `constraints` block is _defined and parsed_ here;
> it is _enforced_ in Phase 3.

## Goal

Replace the 5 hand-written `quote*()` functions ([quote.ts](../../../src/features/pricing/quote.ts)) with
**one generic evaluator** over a closed **modifier vocabulary**, so every TEMP.md formula is expressed
as data in `services.pricing_config` and Cal can edit every value. Keep the public surface stable.

## Stable public contract (must not break)

- `quote(input: QuoteInput): QuoteBreakdown` — same name/return. Callers
  ([quote-action.ts], [quote-core.ts], [kiche.ts]) keep compiling.
- `QuoteBreakdown = { lines: {label, amountCents}[]; finalCents }` — **unchanged** (persisted in
  `bookings.quote_breakdown`; existing rows must still render).
- `requoteWithKiche(storedQuoteInput, applyKiche)` ([kiche.ts:51](../../../src/features/booking/kiche.ts#L51))
  re-runs a frozen `QuoteInput` toggling one manual discount. Generalize to `requoteWithManual(input, id, on)`
  but keep a `requoteWithKiche` shim so the admin apply action is untouched in Phase 1.
- `kichePreview` tolerates malformed stored inputs by returning null — preserve that guard.

## New domain model

### `Modifier` (discriminated union on `kind`)

```ts
type Modifier =
  | { kind: "base_per_night"; cents: number } // pet-priority base
  | { kind: "base_per_hour"; cents: number }
  | { kind: "flat_per_unit"; unit: Unit; cents: number } // per extra pet/other
  | { kind: "tiered_per_unit"; unit: Unit; tiers: Tier[] } // 2nd/3rd dog; walk +50%
  | {
      kind: "flat_per_night_toggle";
      id: string;
      label: string;
      cents: number;
      source:
        | { kind: "condition"; condition: Condition }
        | { kind: "ladder"; input: "needyTier"; maxTier: number };
      manual?: boolean;
    }
  | {
      kind: "per_hour_addon";
      id: string;
      label: string;
      cents: number;
      optIn: true;
    }
  | {
      kind: "allowance_then_per_unit";
      unit: "mile" | "exercise";
      freeUnits: number;
      cents: number;
      perScale?: "perDogPerDay";
    }
  | {
      kind: "pct_surcharge";
      id: string;
      label: string;
      pct: number;
      scope: "wholeBooking" | "perPremiumNight";
      condition: "premiumDays";
    }
  | {
      kind: "pct_discount";
      id: string;
      label: string;
      pct: number;
      condition: Condition;
      manual?: boolean;
    }
  | { kind: "min_floor"; cents: number };

type Unit = "dog" | "cat" | "other";
type Tier = { from: number; cents?: number; pct?: number }; // pct = % of base line, per unit ≥ from
type Condition =
  | "always"
  | "noDogs"
  | "anyDogUnder6mo"
  | "recurringSeries"
  | "nightsOver4"
  | "nightsOver6";
```

`custom_discount` (Cal's Discount) is **not** a config modifier — it is a per-booking ad-hoc adjustment
appended at evaluation time from booking data (Phase 3 supplies it; Phase 1 just supports an
optional `customAdjustments: {label; amountCents?; pct?}[]` on `QuoteInput`, evaluated in the manual phase).

### `Constraints` (parsed in Phase 1, enforced in Phase 3)

```ts
interface Constraints {
  intervalMin: number; // 5 or 15
  minDurationMin?: number;
  maxDurationMin?: number;
  maxDogs?: number;
  allowedSpecies: Species[]; // ["dog"] | ["dog","cat"] | ...
  softDistanceWarnMiles?: number;
}
```

### `ServicePricingConfig`

```ts
interface ServicePricingConfig {
  modifiers: Modifier[];
  constraints: Constraints;
}
```

Stored in `services.pricing_config` (jsonb). Validated by Zod per-kind at the DB boundary —
extend [config-schemas.ts](../../../src/features/pricing/config-schemas.ts) `parsePricingConfig`
to parse this shape (keep the exhaustive `never` discipline).

### `QuoteInput` (new flat shape)

One shape (no longer a per-type union), since the engine is generic:

```ts
interface QuoteInput {
  pricingType: PricingType;
  config: ServicePricingConfig;
  // quantities (all optional; defaulted 0):
  dogs?: number;
  cats?: number;
  others?: number; // others EXCLUDES fish (fish free, never counted)
  nights?: number;
  hours?: number;
  premiumNights?: number; // server-derived (housesit: # premium nights; hourly: 0/1)
  needyTier?: 0 | 1 | 2 | 3 | 4; // cumulative ladder
  exerciseMinutesPerDay?: number; // housesit
  billableMiles?: number; // road-adjusted miles BEYOND nothing; engine subtracts freeUnits
  anyDogUnder6mo?: boolean; // server-derived from estimated birth_date (Phase 2)
  leashManners?: boolean; // walk opt-in
  recurringSeries?: boolean; // qualifies for recurring discount
  // manual application (admin only):
  enabledManualIds?: string[]; // which config manual modifiers Cal turned on
  customAdjustments?: { label: string; amountCents?: number; pct?: number }[];
}
```

A thin **adapter** maps the old booking-service inputs to this shape so callers stay stable
([booking-service-shared.ts] builds `QuoteInput`).

## The evaluator — canonical order of effect

`evaluate(config, inputs): QuoteBreakdown`. Modifiers are bucketed into fixed **phases** (order is
_not_ taken from array position — admin reordering is cosmetic within a phase). Each phase appends
QuoteLines; the running subtotal is the sum of lines so far. `roundCents` per emitted line.

1. **Base** — `base_per_night` (× nights, pet-priority: emitted only if ≥1 priced pet; absorbs dog#1, or cat#1 if no dogs) / `base_per_hour` (× hours).
2. **Per-unit add-ons** — `flat_per_unit` (counts offset by pet-priority, mirroring [quote.ts:160-182]), `tiered_per_unit` (cents tiers, or pct-of-base-line per unit), `flat_per_night_toggle` non-manual auto/ladder (× nights), `per_hour_addon` opt-in (× hours), allowance overage (`exercise`: free = 45 × dogs × days).
3. **Surcharge** — `pct_surcharge` premium on running subtotal of 1–2. Scope `perPremiumNight` → `pct × (premiumNights / totalNights) × subtotal`; `wholeBooking` → `pct × subtotal`.
4. **min_floor** — clamp running subtotal up to `cents` (adds a positive "Minimum" top-up line if needed). _Pre-discount_ (see open Q in umbrella).
5. **Auto discounts** — `pct_discount` where `!manual` whose `condition` holds (compounding on running subtotal).
6. **Manual discounts** — `pct_discount`/`flat_per_night_toggle` where `manual` AND id ∈ `enabledManualIds`, then `customAdjustments`. Compounding. **Excluded from any client-facing preview** (caller passes `enabledManualIds: []` for client quotes).
7. **Travel** — `allowance_then_per_unit(mile)`: billable = max(0, miles − freeUnits); line = billable × cents. Appended last; **never** part of any discount subtotal.

Every modifier owns its label template → receipt lines auto-derive (delete the per-type display map in
[display.ts]; `headlineRate`/`pricingBreakdown` re-derive from the modifier list).

## Seed values (TEMP.md → modifier lists, exact cents)

Rewrite [seed.sql](../../../supabase/migrations/20260529205144_seed.sql) + a forward data-migration.

**house_sitting** — constraints `{intervalMin:15, allowedSpecies:[dog,cat,bird,rodent,reptile,fish,other], softDistanceWarnMiles:15}`

- base_per_night 6000
- flat_per_night_toggle `cat_only` −2500, condition `noDogs`
- flat_per_night_toggle `puppy_household` −1000, condition `anyDogUnder6mo`
- tiered_per_unit dog tiers `[{from:2,cents:1500},{from:3,cents:1000}]`
- flat_per_unit cat 800 · flat_per_unit other 500
- flat_per_night_toggle `needy` 500, source ladder maxTier 4
- allowance_then_per_unit exercise free 45 (perDogPerDay) cents 500 · allowance_then_per_unit mile free 5 cents 250
- pct_surcharge `premium` 20 perPremiumNight
- pct_discount `long_a` 5 nightsOver4 · pct_discount `long_b` 5 nightsOver6
- pct_discount `kiche` 15 manual

**check_in** — constraints `{intervalMin:5, minDurationMin:15, maxDurationMin:60, allowedSpecies:[dog]}`

- base_per_hour 4500 · min_floor 1500
- allowance_then_per_unit mile free 5 cents 200
- pct_surcharge `premium` 20 wholeBooking
- pct_discount `recurring` 5 recurringSeries · pct_discount `puppy_training` 15 anyDogUnder6mo

**walk** — constraints `{intervalMin:15, minDurationMin:30, maxDurationMin:180, maxDogs:2, allowedSpecies:[dog]}`

- base_per_hour 2500
- tiered_per_unit dog tiers `[{from:2,pct:50}]`
- per_hour_addon `leash_manners` 1000 optIn
- allowance_then_per_unit mile free 5 cents 200 · min_floor 1500
- pct_surcharge `premium` 20 wholeBooking · pct_discount `recurring` 5 recurringSeries
- pct_discount `kiche` 15 manual · pct_discount `off_leash` 15 manual · pct_discount `vetted_2nd_dog` 25 manual

**training** — constraints `{intervalMin:5, minDurationMin:30, maxDurationMin:60, maxDogs:1, allowedSpecies:[dog]}`

- base_per_hour 2500 · min_floor 1500
- allowance_then_per_unit mile free 5 cents 150
- pct_surcharge `premium` 20 wholeBooking · pct_discount `recurring` 5 recurringSeries
- pct_discount `puppy_training` 15 anyDogUnder6mo

**meet_greet** (if enum/service retained) — `{ modifiers: [], constraints: {intervalMin:15, allowedSpecies:[dog,cat]} }` → free.

## Golden test cases (must pass to the cent)

TDD: write these first. Examples (full table in the test file):

- **Walk** 1h, 2 dogs, leash on, 8 road-mi, premium, recurring(3+), kiche on:
  base 2500 → +50% 2nd dog 1250 → leash +1000 → subtotal 4750; premium +20% 950 → 5700; min-floor n/a;
  recurring −5% 285 → 5415; kiche −15% 812 → 4603; travel (8−5)×200=600 → **5203**.
- **Housesit** 5 nights, 2 dogs (1 puppy), 0 cats, exercise 60/day, 1 premium night, 8 mi:
  base 6000×5=30000 → 2nd dog tier 1500×5=7500 → puppy_household −1000×5=−5000 → exercise (60−45)/15=1 block ×500×2dogs×5days=5000 → subtotal 37500;
  premium +20% × (1/5) × 37500 = 1500 → 39000; long_a −5% (>4) 1950 → 37050; travel (8−5)×250=750 → **37800**.
- **Check-in** 0.5h, premium, recurring: base max(2250,1500)=2250; premium +20% 450 → 2700; recurring −5% 135 → **2565**.
- **Cat-only** housesit 2 nights, 2 cats: base 6000×2 + cat_only −2500×2 + extra cat 800×2 = 12000−5000+1600 = **8600**.
- Plus: ladder needy (tier 4 = 4×500×nights), fish-free (others excludes fish), travel-never-discounted, manual hidden when `enabledManualIds=[]`, `finalCents === Σ lines`.

The **existing** [quote.test.ts] cases will be rewritten against the new seed values (numbers change:
e.g. housesit base 6000 not 5000); the _behaviors_ (pet-priority, premium, travel-last, sum-invariant) are preserved.

## Approval reasons (client-facing "why")

Today `deriveApproval(miles, cfg)` ([distance.ts:37](../../../src/features/pricing/distance.ts#L37)) returns
only `"auto" | "manual" | "refuse"`, and the panel shows a generic line. Clients must see **exactly why**
a booking needs approval (or is refused). Add a pure, typed reason model:

```ts
type ApprovalReasonCode =
  | "service_manual_only" // service.requires_approval (e.g. all house-sits)
  | "location_unknown" // client profile has no coordinates → can't gate distance
  | "distance_manual" // gatedMiles > autoApproveMiles
  | "distance_unlikely" // gatedMiles > constraints.softDistanceWarnMiles (housesit >15mi: warn, not block)
  | "distance_refuse"; // gatedMiles > hardCutoffMiles

interface ApprovalReason {
  code: ApprovalReasonCode;
  message: string;
  severity: "info" | "warn" | "block";
}
```

- New pure fn `deriveApprovalWithReasons(args): { decision: ApprovalDecision; reasons: ApprovalReason[] }`
  (extends/wraps `deriveApproval`). Inputs: gated miles, settings thresholds, `service.requiresApproval`,
  `constraints.softDistanceWarnMiles`, whether coordinates are known. Messages are human, specific, and quote
  the actual number ("This stay is ~18 mi away; Cal personally confirms house-sits and is unlikely to accept
  bookings beyond 15 mi.").
- `decision` stays the gate (`refuse` if any block reason; `manual` if any manual reason or `requiresApproval`;
  else `auto`). `distance_unlikely` is `warn` severity — it informs without forcing refusal.
- Carried on the preview as `approvalReasons: ApprovalReason[]` (added to `BookingQuotePreview` in
  [quote-core.ts](../../../src/features/booking/quote-core.ts)); **Phase 3** renders them in
  [quote-panel.tsx](../../../src/features/booking/_components/quote-panel.tsx) replacing the generic line.
- Unit-tested here (Phase 1): each code fires on the right threshold; refuse/manual/auto precedence; messages present.

## Migration / back-compat

- New forward migration: rewrite each service's `pricing_config` to `{modifiers, constraints}`; new `seed.sql`.
- Existing bookings: `quote_breakdown` shape-stable → display unaffected. `quote_inputs` frozen in OLD shape →
  `requoteWithManual`/`kichePreview` must still parse old inputs OR the migration is acceptable to apply
  pre-real-data (confirm: low booking volume). Default: keep the null-guard; old inputs that fail the new
  schema return null (control hidden), same as today's malformed-input behavior.

## Out of scope (later phases)

Pet species/birthdate (P2) — `anyDogUnder6mo`/species counts are _inputs_ here, sourced later. Constraint
_enforcement_ in pickers (P3). Admin editor (P4). Public page (P5).

## Verification

`vitest run src/features/pricing` green (new golden table + rewritten existing cases); `tsc --noEmit` clean
(strict, no `any`); all `quote` callers compile unchanged; `requoteWithKiche` shim behaves as before.
