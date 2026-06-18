# Pricing Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 hand-written `quote*()` functions with one generic evaluator over a closed modifier vocabulary, expressing every TEMP.md formula as editable `pricing_config` data, plus typed client-facing approval reasons.

**Architecture:** A `Modifier` discriminated union + `Constraints` block form `ServicePricingConfig`, stored as `services.pricing_config` jsonb and Zod-validated at the DB boundary. A pure `evaluate(config, inputs)` buckets modifiers into a fixed 7-phase canonical order and emits itemized `QuoteLine`s. `quote()` keeps its signature by delegating to `evaluate`. Approval reasons are derived by a pure `deriveApprovalWithReasons`.

**Tech Stack:** TypeScript (strict, no `any`), Zod, Vitest, Supabase SQL migrations.

## Global Constraints

- TypeScript `strict`, no `any` (cast at DB boundary only, via Zod).
- Core logic pure: no IO, no clock reads, deterministic. Integer cents everywhere; `roundCents` (Math.round) per emitted line.
- `QuoteBreakdown = { lines: {label:string; amountCents:number}[]; finalCents:number }` is **frozen** (persisted shape).
- Public `quote(input): QuoteBreakdown` name/return unchanged; all current callers compile untouched.
- Commits: Conventional Commits, **subject line only** — no body, no `Co-Authored-By`/trailer/footer.
- Tests live beside source as `*.test.ts`. Run with `npx vitest run <path>`.
- Canonical phase order (NOT array order): 1 base · 2 per-unit add-ons · 3 pct_surcharge · 4 min_floor · 5 auto discounts · 6 manual discounts + custom · 7 travel (never discounted).

---

## File Structure

- `src/features/pricing/modifier-types.ts` — **create.** `Modifier` union, `Constraints`, `ServicePricingConfig`, `Unit`, `Tier`, `Condition`, new `QuoteInput`.
- `src/features/pricing/modifiers/evaluate.ts` — **create.** Pure `evaluate(config, inputs): QuoteBreakdown`; per-phase helpers.
- `src/features/pricing/modifiers/evaluate.test.ts` — **create.** Phase + golden tests.
- `src/features/pricing/config-schemas.ts` — **rewrite.** Zod for the modifier union + constraints; `parsePricingConfig(raw): ServicePricingConfig`.
- `src/features/pricing/quote.ts` — **rewrite.** `quote()` delegates to `evaluate`; keep exported constants.
- `src/features/pricing/quote.test.ts` — **rewrite** against new seed numbers.
- `src/features/pricing/display.ts` — **rewrite.** `headlineRate`/`pricingBreakdown` re-derive from `modifiers`.
- `src/features/pricing/distance.ts` — **modify.** Add `ApprovalReason*` types + `deriveApprovalWithReasons`.
- `src/features/pricing/distance.test.ts` — **modify.** Reason cases.
- `src/features/pricing/types.ts` — **modify.** Re-export new shapes; deprecate per-type config interfaces (keep until callers migrate in Task 9).
- `supabase/migrations/<ts>_pricing_modifier_config.sql` — **create.** Convert config shape + reseed TEMP.md values.
- `src/features/booking/booking-service-shared.ts` — **modify (Task 9).** Build new `QuoteInput`; thread `approvalReasons`.
- `src/features/booking/quote-core.ts` — **modify (Task 9).** Add `approvalReasons` to `BookingQuotePreview`.
- `src/features/booking/kiche.ts` — **modify (Task 9).** `requoteWithManual` + `requoteWithKiche` shim.

---

### Task 1: Domain types — modifier vocabulary

**Files:**

- Create: `src/features/pricing/modifier-types.ts`
- Test: `src/features/pricing/modifier-types.test.ts`

**Interfaces:**

- Produces: `Modifier`, `Constraints`, `ServicePricingConfig`, `QuoteInput`, `Unit`, `Tier`, `Condition`, `Species`.

- [ ] **Step 1: Write the file** (types only — compile is the test)

```ts
// modifier-types.ts
export type Species =
  | "dog"
  | "cat"
  | "bird"
  | "rodent"
  | "reptile"
  | "fish"
  | "other";
export type Unit = "dog" | "cat" | "other";
export type Tier = { from: number; cents?: number; pct?: number };
export type Condition =
  | "always"
  | "noDogs"
  | "anyDogUnder6mo"
  | "recurringSeries"
  | "nightsOver4"
  | "nightsOver6";

export type Modifier =
  | { kind: "base_per_night"; cents: number }
  | { kind: "base_per_hour"; cents: number }
  | { kind: "flat_per_unit"; unit: Unit; cents: number }
  | { kind: "tiered_per_unit"; unit: Unit; tiers: Tier[] }
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
      label: string;
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

export interface Constraints {
  intervalMin: number;
  minDurationMin?: number;
  maxDurationMin?: number;
  maxDogs?: number;
  allowedSpecies: Species[];
  softDistanceWarnMiles?: number;
}

export interface ServicePricingConfig {
  modifiers: Modifier[];
  constraints: Constraints;
}

export interface CustomAdjustment {
  label: string;
  amountCents?: number;
  pct?: number;
}

export interface QuoteInput {
  config: ServicePricingConfig;
  dogs?: number;
  cats?: number;
  others?: number; // others EXCLUDES fish
  nights?: number;
  hours?: number;
  premiumNights?: number;
  needyTier?: 0 | 1 | 2 | 3 | 4;
  exerciseMinutesPerDay?: number;
  billableMiles?: number; // road-adjusted miles (engine subtracts freeUnits)
  anyDogUnder6mo?: boolean;
  leashManners?: boolean;
  recurringSeries?: boolean;
  enabledManualIds?: string[];
  customAdjustments?: CustomAdjustment[];
}
```

- [ ] **Step 2: Type-only smoke test**

```ts
// modifier-types.test.ts
import { describe, it, expect } from "vitest";
import type { ServicePricingConfig } from "./modifier-types";
describe("modifier-types", () => {
  it("constructs a config literal", () => {
    const cfg: ServicePricingConfig = {
      modifiers: [{ kind: "base_per_hour", cents: 2500 }],
      constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
    };
    expect(cfg.modifiers).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/features/pricing/modifier-types.test.ts` → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit** `git add src/features/pricing/modifier-types.ts src/features/pricing/modifier-types.test.ts && git commit -m "feat(pricing): add modifier vocabulary domain types"`

---

### Task 2: Evaluator — phases 1–2 (base + per-unit add-ons)

**Files:**

- Create: `src/features/pricing/modifiers/evaluate.ts`, `src/features/pricing/modifiers/evaluate.test.ts`

**Interfaces:**

- Consumes: `ServicePricingConfig`, `QuoteInput`, `Modifier` (Task 1); `QuoteBreakdown`, `QuoteLine` (types.ts).
- Produces: `evaluate(config: ServicePricingConfig, inputs: QuoteInput): QuoteBreakdown`.

Implements pet-priority + counting rules from [quote.ts:141-209](../../../src/features/pricing/quote.ts#L141-L209). Pet-priority: dog#1 (or cat#1 if 0 dogs) is absorbed by `base_per_night`. `flat_per_unit cat` counts ALL cats when a dog is base, else cats−1. `tiered_per_unit dog` applies to dogs beyond #1.

- [ ] **Step 1: Write failing tests** (base + per-unit)

```ts
// evaluate.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import type { ServicePricingConfig } from "../modifier-types";

const HS: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home",
      cents: -2500,
      source: { kind: "condition", condition: "noDogs" },
    },
    {
      kind: "tiered_per_unit",
      unit: "dog",
      tiers: [
        { from: 2, cents: 1500 },
        { from: 3, cents: 1000 },
      ],
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
    { kind: "flat_per_unit", unit: "other", cents: 500 },
  ],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat", "other"] },
};

describe("evaluate base + per-unit", () => {
  it("1 dog, 1 night → 6000", () => {
    expect(evaluate(HS, { config: HS, dogs: 1, nights: 1 }).finalCents).toBe(
      6000,
    );
  });
  it("2 dogs, 1 night → 7500 (base + 2nd-dog tier 1500)", () => {
    expect(evaluate(HS, { config: HS, dogs: 2, nights: 1 }).finalCents).toBe(
      7500,
    );
  });
  it("3 dogs, 1 night → 8500 (base + 1500 + 1000)", () => {
    expect(evaluate(HS, { config: HS, dogs: 3, nights: 1 }).finalCents).toBe(
      8500,
    );
  });
  it("1 dog + 1 cat, 1 night → 6800 (cat surcharged)", () => {
    expect(
      evaluate(HS, { config: HS, dogs: 1, cats: 1, nights: 1 }).finalCents,
    ).toBe(6800);
  });
  it("cat-only 2 cats, 2 nights → 8600 (6000-2500+800 ×2)", () => {
    expect(
      evaluate(HS, { config: HS, dogs: 0, cats: 2, nights: 2 }).finalCents,
    ).toBe(8600);
  });
  it("others excludes fish: 2 others, 1 night → +1000", () => {
    const r = evaluate(HS, { config: HS, dogs: 1, others: 2, nights: 1 });
    expect(r.finalCents).toBe(7000);
  });
});
```

- [ ] **Step 2: Run** → FAIL (evaluate not defined).
- [ ] **Step 3: Implement phases 1–2**

```ts
// evaluate.ts
import type { QuoteBreakdown, QuoteLine } from "../types";
import type {
  Modifier,
  QuoteInput,
  ServicePricingConfig,
  Unit,
} from "../modifier-types";

const round = (n: number) => Math.round(n);
const sum = (lines: QuoteLine[]) =>
  lines.reduce((a, l) => a + l.amountCents, 0);

function unitCount(unit: Unit, i: QuoteInput): number {
  const dogs = i.dogs ?? 0,
    cats = i.cats ?? 0,
    others = i.others ?? 0;
  const dogIsBase = dogs >= 1;
  if (unit === "dog") return Math.max(0, dogs - 1); // dog#1 in base
  if (unit === "other") return others; // fish never included in `others`
  return dogIsBase ? cats : Math.max(0, cats - 1); // cats: all if dog base, else cats-1
}

export function evaluate(
  config: ServicePricingConfig,
  i: QuoteInput,
): QuoteBreakdown {
  const nights = i.nights ?? 0,
    hours = i.hours ?? 0;
  const dogs = i.dogs ?? 0,
    cats = i.cats ?? 0;
  const dogIsBase = dogs >= 1,
    catIsBase = !dogIsBase && cats >= 1;
  const m = config.modifiers;
  const lines: QuoteLine[] = [];

  // Phase 1 — base
  for (const mod of m) {
    if (mod.kind === "base_per_night" && (dogIsBase || catIsBase)) {
      lines.push({
        label: `House sitting base (${nights === 1 ? "1 night" : `${nights} nights`})`,
        amountCents: round(mod.cents * nights),
      });
    }
    if (mod.kind === "base_per_hour") {
      lines.push({
        label: `Service (${hours}h)`,
        amountCents: round(mod.cents * hours),
      });
    }
  }
  const baseLineCents = sum(lines); // reference for tiered pct

  // Phase 2 — per-unit add-ons
  for (const mod of m) {
    if (mod.kind === "flat_per_unit") {
      const n = unitCount(mod.unit, i);
      if (n > 0)
        lines.push({
          label: `Extra ${mod.unit} (${n})`,
          amountCents: round(n * mod.cents),
        });
    }
    if (mod.kind === "tiered_per_unit") {
      const n = unitCount(mod.unit, i);
      let cents = 0;
      for (let k = 1; k <= n; k++) {
        const idx = k + 1; // this is the (k+1)-th of that unit overall
        const tier = [...mod.tiers].reverse().find((t) => idx >= t.from);
        if (!tier) continue;
        cents +=
          tier.cents != null
            ? tier.cents * nightsOr1(nights)
            : round((tier.pct! / 100) * baseLineCents);
      }
      if (cents > 0)
        lines.push({ label: `Additional ${mod.unit}`, amountCents: cents });
    }
    if (mod.kind === "flat_per_night_toggle" && !mod.manual) {
      const count = toggleCount(mod, i);
      if (count !== 0)
        lines.push({
          label: mod.label,
          amountCents: round(mod.cents * count * nightsOr1(nights)),
        });
    }
    if (mod.kind === "per_hour_addon" && i.leashManners) {
      lines.push({ label: mod.label, amountCents: round(mod.cents * hours) });
    }
    if (mod.kind === "allowance_then_per_unit" && mod.unit === "exercise") {
      const perDay = i.exerciseMinutesPerDay ?? 0;
      const blocks = Math.max(0, Math.ceil((perDay - mod.freeUnits) / 15));
      const days = Math.ceil(nights);
      const scale = mod.perScale === "perDogPerDay" ? Math.max(1, dogs) : 1;
      if (blocks > 0 && days > 0)
        lines.push({
          label: mod.label,
          amountCents: round(blocks * mod.cents * days * scale),
        });
    }
  }
  return { lines, finalCents: sum(lines) };
}

function nightsOr1(nights: number): number {
  return nights > 0 ? nights : 1;
}

function toggleCount(
  mod: Extract<Modifier, { kind: "flat_per_night_toggle" }>,
  i: QuoteInput,
): number {
  if (mod.source.kind === "ladder")
    return Math.min(i.needyTier ?? 0, mod.source.maxTier);
  const c = mod.source.condition;
  if (c === "noDogs") return (i.dogs ?? 0) === 0 ? 1 : 0;
  if (c === "anyDogUnder6mo") return i.anyDogUnder6mo ? 1 : 0;
  return 1; // "always"
}
```

- [ ] **Step 4: Run** `npx vitest run src/features/pricing/modifiers/evaluate.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(pricing): evaluator base + per-unit add-on phases"`

---

### Task 3: Evaluator — phases 3–7 (surcharge, floor, discounts, manual, travel)

**Files:**

- Modify: `src/features/pricing/modifiers/evaluate.ts`, `evaluate.test.ts`

**Interfaces:**

- Consumes/Produces: same `evaluate` signature (extended behavior).

- [ ] **Step 1: Write failing tests** (the spec golden cases)

```ts
// append to evaluate.test.ts
const WALK: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "tiered_per_unit", unit: "dog", tiers: [{ from: 2, pct: 50 }] },
    {
      kind: "per_hour_addon",
      id: "leash_manners",
      label: "Leash manners (+$10/h)",
      cents: 1000,
      optIn: true,
    },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "pct_surcharge",
      id: "premium",
      label: "Premium day (+20%)",
      pct: 20,
      scope: "wholeBooking",
      condition: "premiumDays",
    },
    {
      kind: "pct_discount",
      id: "recurring",
      label: "Recurring discount (−5%)",
      pct: 5,
      condition: "recurringSeries",
    },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (−15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
  ],
  constraints: {
    intervalMin: 15,
    maxDogs: 2,
    maxDurationMin: 180,
    allowedSpecies: ["dog"],
  },
};

describe("evaluate full pipeline (golden)", () => {
  it("walk golden → 5203", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 2,
      leashManners: true,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    expect(r.finalCents).toBe(5203);
    expect(r.lines.find((l) => l.label === "Travel")?.amountCents).toBe(600);
  });
  it("manual hidden when enabledManualIds empty → no kiche line", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 1,
      enabledManualIds: [],
    });
    expect(r.lines.some((l) => l.label.toLowerCase().includes("kiche"))).toBe(
      false,
    );
  });
  it("travel never discounted: recurring ignores travel", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 1,
      billableMiles: 10,
      recurringSeries: true,
    });
    const travel = r.lines.find((l) => l.label === "Travel")!;
    expect(travel.amountCents).toBe(1000); // (10-5)*200, untouched by -5%
  });
  it("min_floor tops short visit up to 1500", () => {
    const r = evaluate(WALK, { config: WALK, hours: 0.25, dogs: 0 }); // 625 base → floor 1500
    expect(r.finalCents).toBe(1500);
  });
  it("finalCents === sum(lines)", () => {
    const r = evaluate(WALK, {
      config: WALK,
      hours: 1,
      dogs: 2,
      billableMiles: 8,
      premiumNights: 1,
      recurringSeries: true,
      enabledManualIds: ["kiche"],
    });
    expect(r.finalCents).toBe(r.lines.reduce((a, l) => a + l.amountCents, 0));
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement phases 3–7** (replace the `return` in `evaluate` with the tail below; insert before `return`)

```ts
// --- after phase 2, before return ---
const conditionHolds = (c: import("../modifier-types").Condition): boolean => {
  switch (c) {
    case "always":
      return true;
    case "noDogs":
      return (i.dogs ?? 0) === 0;
    case "anyDogUnder6mo":
      return !!i.anyDogUnder6mo;
    case "recurringSeries":
      return !!i.recurringSeries;
    case "nightsOver4":
      return (i.nights ?? 0) > 4;
    case "nightsOver6":
      return (i.nights ?? 0) > 6;
  }
};

// Phase 3 — pct_surcharge (premium) on running subtotal of phases 1-2
for (const mod of m) {
  if (mod.kind !== "pct_surcharge") continue;
  const premiumNights = i.premiumNights ?? 0;
  if (premiumNights <= 0) continue;
  const subtotal = sum(lines);
  const factor =
    mod.scope === "perPremiumNight" && nights > 0 ? premiumNights / nights : 1;
  const amt = round((mod.pct / 100) * subtotal * factor);
  if (amt !== 0) lines.push({ label: mod.label, amountCents: amt });
}

// Phase 4 — min_floor (pre-discount)
for (const mod of m) {
  if (mod.kind !== "min_floor") continue;
  const subtotal = sum(lines);
  if (subtotal > 0 && subtotal < mod.cents)
    lines.push({ label: "Minimum charge", amountCents: mod.cents - subtotal });
}

// Phase 5 — auto discounts (compounding)
for (const mod of m) {
  if (mod.kind !== "pct_discount" || mod.manual) continue;
  if (!conditionHolds(mod.condition)) continue;
  const subtotal = sum(lines);
  const amt = round((mod.pct / 100) * subtotal);
  if (amt !== 0) lines.push({ label: mod.label, amountCents: -amt });
}

// Phase 6 — manual discounts (admin-enabled) + custom adjustments
const enabled = new Set(i.enabledManualIds ?? []);
for (const mod of m) {
  if (
    mod.kind === "pct_discount" &&
    mod.manual &&
    enabled.has(mod.id) &&
    conditionHolds(mod.condition)
  ) {
    const amt = round((mod.pct / 100) * sum(lines));
    if (amt !== 0) lines.push({ label: mod.label, amountCents: -amt });
  }
  if (
    mod.kind === "flat_per_night_toggle" &&
    mod.manual &&
    enabled.has(mod.id)
  ) {
    lines.push({
      label: mod.label,
      amountCents: round(mod.cents * nightsOr1(nights)),
    });
  }
}
for (const adj of i.customAdjustments ?? []) {
  const amt =
    adj.amountCents != null
      ? adj.amountCents
      : round(((adj.pct ?? 0) / 100) * sum(lines));
  if (amt !== 0) lines.push({ label: adj.label, amountCents: -Math.abs(amt) });
}

// Phase 7 — travel (never discounted)
for (const mod of m) {
  if (mod.kind !== "allowance_then_per_unit" || mod.unit !== "mile") continue;
  const billable = Math.max(0, (i.billableMiles ?? 0) - mod.freeUnits);
  if (billable > 0)
    lines.push({ label: mod.label, amountCents: round(billable * mod.cents) });
}

return { lines, finalCents: sum(lines) };
```

(Delete the earlier `return { lines, finalCents: sum(lines) };` left at end of Task 2.)

- [ ] **Step 4: Run** `npx vitest run src/features/pricing/modifiers/evaluate.test.ts` → PASS.
- [ ] **Step 5: Add housesit + check-in golden tests** (spec §Golden), run, PASS.

```ts
it("housesit golden 5nt 2 dogs(1 puppy) ex60 1premiumNight 8mi → 37800", () => {
  const HS2: ServicePricingConfig = {
    modifiers: [
      { kind: "base_per_night", cents: 6000 },
      {
        kind: "flat_per_night_toggle",
        id: "puppy_household",
        label: "Puppy household (−$10/night)",
        cents: -1000,
        source: { kind: "condition", condition: "anyDogUnder6mo" },
      },
      {
        kind: "tiered_per_unit",
        unit: "dog",
        tiers: [
          { from: 2, cents: 1500 },
          { from: 3, cents: 1000 },
        ],
      },
      {
        kind: "allowance_then_per_unit",
        unit: "exercise",
        label: "Extra exercise",
        freeUnits: 45,
        cents: 500,
        perScale: "perDogPerDay",
      },
      {
        kind: "pct_surcharge",
        id: "premium",
        label: "Premium night (+20%)",
        pct: 20,
        scope: "perPremiumNight",
        condition: "premiumDays",
      },
      {
        kind: "pct_discount",
        id: "long_a",
        label: "Long stay (−5%)",
        pct: 5,
        condition: "nightsOver4",
      },
      {
        kind: "allowance_then_per_unit",
        unit: "mile",
        label: "Travel",
        freeUnits: 5,
        cents: 250,
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
  };
  const r = evaluate(HS2, {
    config: HS2,
    dogs: 2,
    nights: 5,
    anyDogUnder6mo: true,
    exerciseMinutesPerDay: 60,
    premiumNights: 1,
    billableMiles: 8,
  });
  expect(r.finalCents).toBe(37800);
});
```

- [ ] **Step 6: Commit** `git commit -am "feat(pricing): evaluator surcharge/floor/discount/travel phases"`

---

### Task 4: Zod schemas + `parsePricingConfig`

**Files:**

- Rewrite: `src/features/pricing/config-schemas.ts`, `config-schemas.test.ts`

**Interfaces:**

- Produces: `parsePricingConfig(raw: unknown): ServicePricingConfig` (throws ZodError on bad shape).

- [ ] **Step 1: Failing test** — valid config round-trips; bad kind rejected; negative cents rejected (except discount toggles/pct_discount which are inherently negative-effect but stored positive). Note: store `cents` as the magnitude for discounts? Decision: discount toggles store **negative** cents (e.g. cat_only −2500) → schema allows negative for `flat_per_night_toggle`/`flat_per_unit`; `pct` ∈ [0,100]; rates non-negative.

```ts
import { describe, it, expect } from "vitest";
import { parsePricingConfig } from "./config-schemas";
describe("parsePricingConfig", () => {
  it("accepts a valid modifier list", () => {
    const cfg = parsePricingConfig({
      modifiers: [{ kind: "base_per_hour", cents: 2500 }],
      constraints: { intervalMin: 5, allowedSpecies: ["dog"] },
    });
    expect(cfg.modifiers[0].kind).toBe("base_per_hour");
  });
  it("rejects unknown kind", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [{ kind: "nope" }],
        constraints: { intervalMin: 5, allowedSpecies: ["dog"] },
      }),
    ).toThrow();
  });
  it("rejects pct > 100", () => {
    expect(() =>
      parsePricingConfig({
        modifiers: [
          {
            kind: "pct_discount",
            id: "x",
            label: "x",
            pct: 150,
            condition: "always",
          },
        ],
        constraints: { intervalMin: 5, allowedSpecies: ["dog"] },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a `z.discriminatedUnion("kind", [...])` matching each `Modifier` variant + `constraintsSchema` + `servicePricingConfigSchema`; export `parsePricingConfig`. Keep the file’s existing JSDoc tone.
- [ ] **Step 4: Run** `npx vitest run src/features/pricing/config-schemas.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(pricing): zod schema for modifier-list pricing_config"`

---

### Task 5: Rewrite `quote()` to delegate; rewrite `quote.test.ts`

**Files:**

- Rewrite: `src/features/pricing/quote.ts`, `src/features/pricing/quote.test.ts`
- Modify: `src/features/pricing/types.ts` (re-export `QuoteInput` from modifier-types; keep `QuoteBreakdown`/`QuoteLine`).

**Interfaces:**

- Produces: `quote(input: QuoteInput): QuoteBreakdown` (now delegates to `evaluate(input.config, input)`).

- [ ] **Step 1:** Point `types.ts` `QuoteInput` export at `modifier-types`; keep `QuoteBreakdown`/`QuoteLine`/`PricingType`. Remove per-type config interfaces only after Task 9 confirms no importers — for now mark `@deprecated`.
- [ ] **Step 2: Rewrite `quote.ts`**

```ts
import type { QuoteBreakdown } from "./types";
import type { QuoteInput } from "./modifier-types";
import { evaluate } from "./modifiers/evaluate";
export function quote(input: QuoteInput): QuoteBreakdown {
  return evaluate(input.config, input);
}
```

- [ ] **Step 3: Rewrite `quote.test.ts`** — re-express the existing behavioral cases (pet-priority, premium, travel, recurring, kiche, sum-invariant) using new-seed configs and the flat `QuoteInput`. Numbers update to TEMP.md ($60 base etc.). Keep meet_greet (empty modifiers → 0).
- [ ] **Step 4: Run** `npx vitest run src/features/pricing` → PASS.
- [ ] **Step 5: Commit** `git commit -am "refactor(pricing): quote delegates to modifier evaluator"`

---

### Task 6: Approval reasons

**Files:**

- Modify: `src/features/pricing/distance.ts`, `src/features/pricing/distance.test.ts`

**Interfaces:**

- Produces: `ApprovalReasonCode`, `ApprovalReason`, `deriveApprovalWithReasons(args): { decision: ApprovalDecision; reasons: ApprovalReason[] }`.

- [ ] **Step 1: Failing tests**

```ts
import { deriveApprovalWithReasons } from "./distance";
const base = {
  autoApproveMiles: 10,
  hardCutoffMiles: 30,
  useRoadMiles: true,
  roadFactor: 1.3,
};
it("house-sit always manual with service_manual_only reason", () => {
  const r = deriveApprovalWithReasons({
    miles: 1,
    ...base,
    requiresApproval: true,
    locationKnown: true,
  });
  expect(r.decision).toBe("manual");
  expect(r.reasons.some((x) => x.code === "service_manual_only")).toBe(true);
});
it("unknown location → manual + location_unknown", () => {
  const r = deriveApprovalWithReasons({
    miles: 0,
    ...base,
    requiresApproval: false,
    locationKnown: false,
  });
  expect(r.decision).toBe("manual");
  expect(r.reasons[0].code).toBe("location_unknown");
});
it("far → refuse with distance_refuse block", () => {
  const r = deriveApprovalWithReasons({
    miles: 40,
    ...base,
    requiresApproval: false,
    locationKnown: true,
  });
  expect(r.decision).toBe("refuse");
  expect(
    r.reasons.some(
      (x) => x.code === "distance_refuse" && x.severity === "block",
    ),
  ).toBe(true);
});
it("soft-warn for housesit beyond softDistanceWarnMiles (warn, not block)", () => {
  const r = deriveApprovalWithReasons({
    miles: 16,
    ...base,
    requiresApproval: true,
    locationKnown: true,
    softDistanceWarnMiles: 15,
  });
  expect(
    r.reasons.some(
      (x) => x.code === "distance_unlikely" && x.severity === "warn",
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `deriveApprovalWithReasons` (reuse `deriveApproval` for the gate; push reasons with specific messages quoting `Math.round(gatedMiles)` mi; precedence refuse > manual > auto; `distance_unlikely` is additive warn).
- [ ] **Step 4: Run** `npx vitest run src/features/pricing/distance.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(pricing): typed approval reasons with deriveApprovalWithReasons"`

---

### Task 7: `display.ts` re-derives from modifiers

**Files:**

- Rewrite: `src/features/pricing/display.ts`, `display.test.ts`

**Interfaces:**

- Produces: `headlineRate(config: ServicePricingConfig): string`, `pricingBreakdown(config: ServicePricingConfig): PricingBreakdownRow[]`, unchanged `formatCents`.

- [ ] **Step 1: Failing tests** — headline reads `base_per_hour`/`base_per_night` from modifiers ("from $60 / night", "$25 / hour"); breakdown lists rate + visible (non-manual) add-ons/discounts derived from modifier labels.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** by scanning `config.modifiers` (find base kind for headline; map non-manual modifiers to rows). Drop the per-type switch.
- [ ] **Step 4: Run** `npx vitest run src/features/pricing/display.test.ts` → PASS.
- [ ] **Step 5: Commit** `git commit -am "refactor(pricing): display helpers derive from modifier list"`

---

### Task 8: Config + seed migration (TEMP.md values)

**Files:**

- Create: `supabase/migrations/<timestamp>_pricing_modifier_config.sql`
- Modify: `supabase/migrations/20260529205144_seed.sql` (so fresh `db reset` seeds the new shape)

**Interfaces:** none (data). Values per spec §Seed values.

- [ ] **Step 1:** Write the migration: `update services set pricing_config = '<json>'::jsonb where slug = '...'` for each of the 4 services using the exact modifier lists + constraints from the spec. Update `seed.sql` to the same JSON.
- [ ] **Step 2: Apply locally** `npx supabase db reset` (or `db push`) — succeeds.
- [ ] **Step 3: Verify parse** — add `config-schemas` test loading each seeded JSON literal through `parsePricingConfig` without throwing.
- [ ] **Step 4: Commit** `git commit -am "feat(pricing): migrate pricing_config to modifier lists with current rates"`

---

### Task 9: Thread new shape through booking callers

**Files:**

- Modify: `src/features/booking/booking-service-shared.ts`, `quote-core.ts`, `kiche.ts` (+ their tests)

**Interfaces:**

- Consumes: `quote`, `evaluate`, `parsePricingConfig`, `deriveApprovalWithReasons`.
- Produces: `BookingQuotePreview` gains `approvalReasons: ApprovalReason[]`; `requoteWithManual(input, id, on)` with `requoteWithKiche` shim.

- [ ] **Step 1: Failing tests** — `computeBookingArtifacts` builds a `QuoteInput` (config from `parsePricingConfig(service.pricing_config)`, quantities from booking input, `billableMiles` from haversine×roadFactor, `premiumNights` from `deriveHolidayDays`, `enabledManualIds` from booking flags) and returns `approvalReasons`. `requoteWithKiche` still flips the kiche line.
- [ ] **Step 2: Run** → FAIL (type errors / missing field).
- [ ] **Step 3: Implement** the adapter mapping + `approvalReasons` plumb-through + `requoteWithManual`/shim. Client preview path passes `enabledManualIds: []`.
- [ ] **Step 4: Run** `npx vitest run src/features/booking && npx tsc --noEmit` → PASS/clean.
- [ ] **Step 5: Commit** `git commit -am "feat(booking): build modifier QuoteInput and surface approval reasons"`

---

## Self-Review

- **Spec coverage:** vocabulary (T1), evaluator phases incl. premium-proration/travel-excluded/min-floor/ladder/allowance (T2–T3), Zod boundary (T4), stable `quote` + rewritten goldens (T5), approval reasons (T6), display re-derivation (T7), seed/migration with TEMP.md values (T8), caller threading + custom/manual hidden + back-compat shim (T9). All spec sections mapped.
- **Placeholder scan:** none — every code step has concrete code; seed values enumerated in spec.
- **Type consistency:** `evaluate(config, inputs)`, `QuoteInput`, `ServicePricingConfig`, `parsePricingConfig`, `deriveApprovalWithReasons`, `requoteWithManual` used consistently across tasks.

## Verification (end of plan)

`npx vitest run src/features/pricing src/features/booking` green · `npx tsc --noEmit` clean · `npx supabase db reset` seeds parseable config · all original `quote` callers compile · `requoteWithKiche` behaves as before.
