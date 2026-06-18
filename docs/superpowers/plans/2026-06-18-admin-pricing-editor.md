# Admin Pricing Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the disabled `/admin/services` pricing editor so an admin can edit the numeric values of a service's modifier-list `pricing_config` (`{ modifiers, constraints }`) plus the `default_duration_min` column.

**Architecture:** Client-only feature over the already-complete server action (`updateServiceCore` validates `pricing_config` via `parsePricingConfig`). A pure module derives editable numeric-leaf fields from the config and writes single leaves back immutably; the config object itself is the edit state (no edits-accumulator). Two small non-UI changes ride along: a `.superRefine` on the constraints schema (min≤max, maxDogs≥1) and removal of the dead `max_pets` admin write path.

**Tech Stack:** Next.js App Router, TypeScript (strict, no `any`), Zod, React, Tailwind + shadcn/ui primitives, Vitest + @testing-library/react (jsdom).

## Global Constraints

- TypeScript `strict`, no `any`. (CODE_STYLE / ENGINEERING)
- Design tokens are law — components reference semantic tokens, never hardcoded colors. (FRONTEND)
- Accessibility floor — semantic HTML, label/id association, visible focus, keyboard nav. (FRONTEND)
- Single `main` branch; commit only after verification; stage files **by name** — NEVER `git add -A`/`-am`. The worktree carries unrelated uncommitted edits (`TEMP.md`, `docs/DEV_NOTES.md`, `src/content/marketing.ts`, `SYNC.md`) — leave them.
- Commit messages: **subject line only**, Conventional Commits, no body/trailer/footer, no project-internal identifiers (no phase/task numbers).
- Pre-commit hook = lint-staged + full `tsc`; it must pass **without** `--no-verify`.
- Per-task gate = the task's unit tests + `tsc --noEmit`. DB-integration tests need a seeded local Supabase stack and are NOT a per-task gate.
- Money is integer cents in the DB. `pct` is a number in `[0,100]`.
- Editor edits **values only** — never a modifier's `kind`/`id`/`label`/`unit`/`condition`/`source`/`manual`/`optIn`/`perScale`/`tiers[i].from`, and never `allowedSpecies` (shown read-only).
- The pet cap is enforced from `constraints.maxDogs`; the `max_pets` column is dead.

---

### Task 1: Dollar/cent conversion helpers

**Files:**

- Modify: `src/features/pricing/display.ts`
- Modify: `src/features/pricing/index.ts`
- Test: `src/features/pricing/display.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `centsToDollarsNumber(cents: number): number`, `dollarsToCents(dollars: number): number` (exported from `@/features/pricing`).

- [ ] **Step 1: Write the failing test** — append to `src/features/pricing/display.test.ts`:

```ts
import {
  formatCents,
  headlineRate,
  pricingBreakdown,
  centsToDollarsNumber,
  dollarsToCents,
} from "./display";

// ... existing imports/tests stay ...

describe("centsToDollarsNumber", () => {
  it("converts integer cents to a dollar number", () => {
    expect(centsToDollarsNumber(1999)).toBe(19.99);
    expect(centsToDollarsNumber(2500)).toBe(25);
    expect(centsToDollarsNumber(0)).toBe(0);
    expect(centsToDollarsNumber(-2500)).toBe(-25);
  });
});

describe("dollarsToCents", () => {
  it("rounds dollar input to exact integer cents", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(25)).toBe(2500);
    expect(dollarsToCents(0.1)).toBe(10);
    expect(dollarsToCents(-25)).toBe(-2500);
    expect(dollarsToCents(0)).toBe(0);
  });
});
```

(Replace the existing single `import { formatCents, headlineRate, pricingBreakdown } from "./display";` line with the expanded import above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/display.test.ts`
Expected: FAIL — `centsToDollarsNumber`/`dollarsToCents` are not exported.

- [ ] **Step 3: Add the helpers** — append to `src/features/pricing/display.ts`:

```ts
/**
 * Integer cents → a plain dollar number for an editable numeric input.
 * (Use formatCents for display strings; this is for <input type="number">.)
 */
export function centsToDollarsNumber(cents: number): number {
  return cents / 100;
}

/** Dollar input → exact integer cents (round-trips 2-dp without float drift). */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
```

Then export them from `src/features/pricing/index.ts` — change the display export line to:

```ts
export {
  headlineRate,
  formatCents,
  pricingBreakdown,
  centsToDollarsNumber,
  dollarsToCents,
} from "./display";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/pricing/display.test.ts`
Expected: PASS (all existing + new cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add "src/features/pricing/display.ts" "src/features/pricing/display.test.ts" "src/features/pricing/index.ts"
git commit -m "feat(pricing): add dollar/cent conversion helpers"
```

---

### Task 2: Reject incoherent constraints (schema hardening)

**Files:**

- Modify: `src/features/pricing/config-schemas.ts:181-188` (the `constraintsSchema`)
- Test: `src/features/pricing/config-schemas.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `parsePricingConfig` now throws when `minDurationMin > maxDurationMin` or `maxDogs < 1`.

- [ ] **Step 1: Write the failing tests** — append to `src/features/pricing/config-schemas.test.ts` inside the existing `describe("parsePricingConfig — constraints", ...)` block (add these `it`s after the existing ones):

```ts
it("rejects minDurationMin greater than maxDurationMin", () => {
  expect(() =>
    parsePricingConfig({
      modifiers: [],
      constraints: {
        intervalMin: 15,
        minDurationMin: 180,
        maxDurationMin: 30,
        allowedSpecies: ["dog"],
      },
    }),
  ).toThrow();
});

it("rejects maxDogs = 0", () => {
  expect(() =>
    parsePricingConfig({
      modifiers: [],
      constraints: {
        intervalMin: 15,
        maxDogs: 0,
        allowedSpecies: ["dog"],
      },
    }),
  ).toThrow();
});

it("accepts minDurationMin equal to maxDurationMin", () => {
  expect(() =>
    parsePricingConfig({
      modifiers: [],
      constraints: {
        intervalMin: 15,
        minDurationMin: 60,
        maxDurationMin: 60,
        allowedSpecies: ["dog"],
      },
    }),
  ).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts`
Expected: FAIL — the two `rejects` cases do not throw yet.

- [ ] **Step 3: Add `.superRefine`** — in `src/features/pricing/config-schemas.ts`, replace the `constraintsSchema` definition (currently `z.object({ ... })`) with:

```ts
const constraintsSchema = z
  .object({
    intervalMin: positiveIntSchema,
    minDurationMin: nonNegSchema.optional(),
    maxDurationMin: nonNegSchema.optional(),
    maxDogs: nonNegSchema.optional(),
    allowedSpecies: z.array(speciesSchema).nonempty(),
    softDistanceWarnMiles: nonNegSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (
      c.minDurationMin !== undefined &&
      c.maxDurationMin !== undefined &&
      c.minDurationMin > c.maxDurationMin
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDurationMin"],
        message:
          "maxDurationMin must be greater than or equal to minDurationMin",
      });
    }
    if (c.maxDogs !== undefined && c.maxDogs < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDogs"],
        message: "maxDogs must be at least 1",
      });
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/pricing/config-schemas.test.ts`
Expected: PASS — including the existing seed round-trip tests (seeds satisfy the new rules: walk maxDogs 2, training 1, all min≤max).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → exit 0.

```bash
git add "src/features/pricing/config-schemas.ts" "src/features/pricing/config-schemas.test.ts"
git commit -m "feat(pricing): reject incoherent constraint bounds"
```

---

### Task 3: Derive editable fields from the config (pure module)

**Files:**

- Rewrite: `src/features/admin/pricing-config-fields.ts` (replace the dead flat-config helpers)
- Rewrite: `src/features/admin/pricing-config-fields.test.ts`
- Modify: `src/features/admin/index.ts:128-130` (barrel exports)

**Interfaces:**

- Consumes: `ServicePricingConfig`, `Modifier`, `Constraints` from `@/features/pricing`.
- Produces (exported from `@/features/admin`):
  - `type PricingFieldKind = "cents" | "pct" | "int" | "minutes"`
  - `interface PricingEditField { path; label; kind; value; group: "rates"|"limits"; min?; max?; allowNegative? }`
  - `deriveEditableFields(config: ServicePricingConfig): PricingEditField[]`
  - `setLeaf(config: ServicePricingConfig, path: string, value: number): ServicePricingConfig`
  - `validateEditableFields(config: ServicePricingConfig, defaultDurationMin: number | null): Record<string, string>`

- [ ] **Step 1: Confirm the old helpers have no other importers**

Run (PowerShell): use the Grep tool for `pricingFields|fieldsToConfig` across the repo.
Expected: only `src/features/admin/pricing-config-fields.ts`, its test, and `src/features/admin/index.ts`. (If anything else imports them, stop and reassess.)

- [ ] **Step 2: Write the failing test** — replace the entire contents of `src/features/admin/pricing-config-fields.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveEditableFields,
  setLeaf,
  validateEditableFields,
} from "./pricing-config-fields";
import type { ServicePricingConfig } from "@/features/pricing";

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
    {
      kind: "allowance_then_per_unit",
      unit: "mile",
      label: "Travel",
      freeUnits: 5,
      cents: 200,
    },
    { kind: "min_floor", cents: 1500 },
    {
      kind: "pct_discount",
      id: "kiche",
      label: "Kiche discount (-15%)",
      pct: 15,
      condition: "always",
      manual: true,
    },
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

const HOUSE_SIT: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_night", cents: 6000 },
    {
      kind: "flat_per_night_toggle",
      id: "cat_only",
      label: "Cat-only home",
      cents: -2500,
      source: { kind: "condition", condition: "noDogs" },
    },
    { kind: "flat_per_unit", unit: "cat", cents: 800 },
  ],
  constraints: {
    intervalMin: 15,
    allowedSpecies: ["dog", "cat", "bird"],
    softDistanceWarnMiles: 15,
  },
};

const MEET_GREET: ServicePricingConfig = {
  modifiers: [],
  constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
};

describe("deriveEditableFields — modifier value leaves", () => {
  it("emits the base rate as a cents field addressed by index", () => {
    const fields = deriveEditableFields(WALK);
    const base = fields.find((f) => f.path === "m.0.cents");
    expect(base).toMatchObject({ kind: "cents", value: 2500, group: "rates" });
  });

  it("emits a tier pct leaf addressed by tier index", () => {
    const fields = deriveEditableFields(WALK);
    const tier = fields.find((f) => f.path === "m.1.tiers.0.pct");
    expect(tier).toMatchObject({ kind: "pct", value: 50, min: 0, max: 100 });
  });

  it("emits both leaves of allowance_then_per_unit", () => {
    const fields = deriveEditableFields(WALK);
    expect(fields.find((f) => f.path === "m.3.freeUnits")).toMatchObject({
      kind: "int",
      value: 5,
    });
    expect(fields.find((f) => f.path === "m.3.cents")).toMatchObject({
      kind: "cents",
      value: 200,
    });
  });

  it("marks discount cents as allowNegative", () => {
    const fields = deriveEditableFields(HOUSE_SIT);
    const catOnly = fields.find((f) => f.path === "m.1.cents");
    expect(catOnly).toMatchObject({ value: -2500, allowNegative: true });
    const catFlat = fields.find((f) => f.path === "m.2.cents");
    expect(catFlat?.allowNegative).toBe(true);
  });

  it("never emits structure/identity as a field", () => {
    const paths = deriveEditableFields(WALK).map((f) => f.path);
    expect(paths.some((p) => p.endsWith(".from"))).toBe(false);
    expect(paths).not.toContain("m.0.kind");
  });
});

describe("deriveEditableFields — constraints", () => {
  it("emits present numeric constraints in the limits group", () => {
    const fields = deriveEditableFields(WALK).filter(
      (f) => f.group === "limits",
    );
    const byPath = Object.fromEntries(fields.map((f) => [f.path, f]));
    expect(byPath["c.intervalMin"]).toMatchObject({ value: 15, min: 1 });
    expect(byPath["c.minDurationMin"]).toMatchObject({ value: 30 });
    expect(byPath["c.maxDurationMin"]).toMatchObject({ value: 180 });
    expect(byPath["c.maxDogs"]).toMatchObject({ value: 2, min: 1 });
  });

  it("omits absent constraints (no maxDogs / durations on house-sit)", () => {
    const paths = deriveEditableFields(HOUSE_SIT).map((f) => f.path);
    expect(paths).not.toContain("c.maxDogs");
    expect(paths).not.toContain("c.minDurationMin");
    expect(paths).toContain("c.softDistanceWarnMiles");
  });

  it("meet_greet yields no rate fields", () => {
    const fields = deriveEditableFields(MEET_GREET);
    expect(fields.filter((f) => f.group === "rates")).toHaveLength(0);
  });
});

describe("setLeaf — immutable single-leaf updates", () => {
  it("updates a modifier cents leaf without mutating the input", () => {
    const next = setLeaf(WALK, "m.0.cents", 3000);
    expect((next.modifiers[0] as { cents: number }).cents).toBe(3000);
    expect((WALK.modifiers[0] as { cents: number }).cents).toBe(2500);
  });

  it("rounds cents but keeps pct as entered", () => {
    expect(
      (setLeaf(WALK, "m.0.cents", 2999.6).modifiers[0] as { cents: number })
        .cents,
    ).toBe(3000);
    const tierMod = setLeaf(WALK, "m.1.tiers.0.pct", 40).modifiers[1] as {
      tiers: { pct: number }[];
    };
    expect(tierMod.tiers[0].pct).toBe(40);
  });

  it("updates a constraint leaf", () => {
    expect(setLeaf(WALK, "c.maxDogs", 3).constraints.maxDogs).toBe(3);
  });

  it("preserves ids/sources/structure of untouched modifiers", () => {
    const next = setLeaf(HOUSE_SIT, "m.0.cents", 7000);
    expect(next.modifiers[1]).toEqual(HOUSE_SIT.modifiers[1]);
  });

  it("throws on an unknown path", () => {
    expect(() => setLeaf(WALK, "m.0.bogus", 1)).toThrow();
    expect(() => setLeaf(WALK, "x.y", 1)).toThrow();
  });
});

describe("validateEditableFields", () => {
  it("returns no errors for a valid config", () => {
    expect(validateEditableFields(WALK, 60)).toEqual({});
  });

  it("flags below-min values", () => {
    const bad = setLeaf(WALK, "c.maxDogs", 0);
    expect(validateEditableFields(bad, 60)["c.maxDogs"]).toBeDefined();
  });

  it("flags min duration greater than max duration", () => {
    const bad = setLeaf(WALK, "c.minDurationMin", 200);
    expect(validateEditableFields(bad, 60)["c.maxDurationMin"]).toBeDefined();
  });

  it("flags a NaN value (empty input)", () => {
    const bad = setLeaf(WALK, "m.0.cents", NaN);
    expect(validateEditableFields(bad, 60)["m.0.cents"]).toBeDefined();
  });

  it("flags a missing/too-small default duration", () => {
    expect(
      validateEditableFields(WALK, null)["col.defaultDurationMin"],
    ).toBeDefined();
    expect(
      validateEditableFields(WALK, 0)["col.defaultDurationMin"],
    ).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/features/admin/pricing-config-fields.test.ts`
Expected: FAIL — new exports don't exist.

- [ ] **Step 4: Rewrite the module** — replace the entire contents of `src/features/admin/pricing-config-fields.ts` with:

```ts
/**
 * Pure helpers for the modifier-aware admin pricing editor.
 *
 * deriveEditableFields turns a ServicePricingConfig into an ordered list of
 * editable NUMERIC-LEAF fields (cents / pct / freeUnits / tier values) plus the
 * present numeric constraints. Structure/identity (kind, id, label, unit,
 * condition, source, manual, optIn, perScale, tiers[i].from) is never emitted —
 * the editor changes values only. setLeaf writes one addressed leaf back
 * immutably; validateEditableFields runs the admin-facing guards.
 *
 * No IO, no React — safe to unit-test and import anywhere.
 */

import type {
  ServicePricingConfig,
  Modifier,
  Constraints,
} from "@/features/pricing";

export type PricingFieldKind = "cents" | "pct" | "int" | "minutes";

export interface PricingEditField {
  /** Stable address: "m.<i>.cents" | "m.<i>.tiers.<j>.pct" | "c.maxDogs". */
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

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

const PCT: Pick<PricingEditField, "kind" | "min" | "max"> = {
  kind: "pct",
  min: 0,
  max: 100,
};

function unitNoun(unit: "dog" | "cat" | "other"): string {
  return unit === "dog" ? "dog" : unit === "cat" ? "cat" : "animal";
}

/** Fields for one modifier at array index `i`. Returns [] for nothing editable. */
function fieldsForModifier(mod: Modifier, i: number): PricingEditField[] {
  const base = `m.${i}`;
  switch (mod.kind) {
    case "base_per_night":
      return [
        {
          path: `${base}.cents`,
          label: "Base rate (per night)",
          kind: "cents",
          value: mod.cents,
          group: "rates",
          min: 0,
        },
      ];
    case "base_per_hour":
      return [
        {
          path: `${base}.cents`,
          label: "Base rate (per hour)",
          kind: "cents",
          value: mod.cents,
          group: "rates",
          min: 0,
        },
      ];
    case "min_floor":
      return [
        {
          path: `${base}.cents`,
          label: "Minimum charge",
          kind: "cents",
          value: mod.cents,
          group: "rates",
          min: 0,
        },
      ];
    case "flat_per_unit":
      return [
        {
          path: `${base}.cents`,
          label: `Each ${unitNoun(mod.unit)}`,
          kind: "cents",
          value: mod.cents,
          group: "rates",
          allowNegative: true,
        },
      ];
    case "flat_per_night_toggle":
      return [
        {
          path: `${base}.cents`,
          label: mod.label,
          kind: "cents",
          value: mod.cents,
          group: "rates",
          allowNegative: true,
        },
      ];
    case "per_hour_addon":
      return [
        {
          path: `${base}.cents`,
          label: mod.label,
          kind: "cents",
          value: mod.cents,
          group: "rates",
          min: 0,
        },
      ];
    case "pct_surcharge":
      return [
        {
          path: `${base}.pct`,
          label: mod.label,
          value: mod.pct,
          group: "rates",
          ...PCT,
        },
      ];
    case "pct_discount":
      return [
        {
          path: `${base}.pct`,
          label: mod.label,
          value: mod.pct,
          group: "rates",
          ...PCT,
        },
      ];
    case "allowance_then_per_unit": {
      const freeWord = mod.unit === "mile" ? "miles" : "minutes";
      const perWord = mod.unit === "mile" ? "mile" : "minute";
      return [
        {
          path: `${base}.freeUnits`,
          label: `${mod.label} — free ${freeWord}`,
          kind: "int",
          value: mod.freeUnits,
          group: "rates",
          min: 0,
        },
        {
          path: `${base}.cents`,
          label: `${mod.label} — per ${perWord}`,
          kind: "cents",
          value: mod.cents,
          group: "rates",
          min: 0,
        },
      ];
    }
    case "tiered_per_unit": {
      const noun = unitNoun(mod.unit);
      const out: PricingEditField[] = [];
      mod.tiers.forEach((tier, j) => {
        if (tier.cents !== undefined) {
          out.push({
            path: `${base}.tiers.${j}.cents`,
            label: `Each extra ${noun} (from ${tier.from})`,
            kind: "cents",
            value: tier.cents,
            group: "rates",
            min: 0,
          });
        }
        if (tier.pct !== undefined) {
          out.push({
            path: `${base}.tiers.${j}.pct`,
            label: `Each extra ${noun} (from ${tier.from})`,
            value: tier.pct,
            group: "rates",
            ...PCT,
          });
        }
      });
      return out;
    }
  }
}

/** Present numeric constraint fields (limits group), in a fixed order. */
function constraintFields(c: Constraints): PricingEditField[] {
  const out: PricingEditField[] = [];
  out.push({
    path: "c.intervalMin",
    label: "Slot interval",
    kind: "minutes",
    value: c.intervalMin,
    group: "limits",
    min: 1,
  });
  if (c.minDurationMin !== undefined)
    out.push({
      path: "c.minDurationMin",
      label: "Minimum duration",
      kind: "minutes",
      value: c.minDurationMin,
      group: "limits",
      min: 0,
    });
  if (c.maxDurationMin !== undefined)
    out.push({
      path: "c.maxDurationMin",
      label: "Maximum duration",
      kind: "minutes",
      value: c.maxDurationMin,
      group: "limits",
      min: 0,
    });
  if (c.maxDogs !== undefined)
    out.push({
      path: "c.maxDogs",
      label: "Max dogs",
      kind: "int",
      value: c.maxDogs,
      group: "limits",
      min: 1,
    });
  if (c.softDistanceWarnMiles !== undefined)
    out.push({
      path: "c.softDistanceWarnMiles",
      label: "Soft distance warning (mi)",
      kind: "int",
      value: c.softDistanceWarnMiles,
      group: "limits",
      min: 0,
    });
  return out;
}

export function deriveEditableFields(
  config: ServicePricingConfig,
): PricingEditField[] {
  const rates = config.modifiers.flatMap((mod, i) => fieldsForModifier(mod, i));
  return [...rates, ...constraintFields(config.constraints)];
}

// ---------------------------------------------------------------------------
// Immutable single-leaf write
// ---------------------------------------------------------------------------

/**
 * Returns a new config with the single addressed numeric leaf replaced. cents /
 * int / minutes are rounded to integers; pct is kept as entered. Throws on an
 * un-addressable path (a derive/UI mismatch is a bug, not a silent no-op).
 */
export function setLeaf(
  config: ServicePricingConfig,
  path: string,
  value: number,
): ServicePricingConfig {
  const next = structuredClone(config);
  const parts = path.split(".");

  if (parts[0] === "c" && parts.length === 2) {
    (next.constraints as unknown as Record<string, number>)[parts[1]] =
      Math.round(value);
    return next;
  }

  if (parts[0] === "m") {
    const i = Number(parts[1]);
    const mod = next.modifiers[i] as unknown as Record<string, unknown>;
    if (mod === undefined)
      throw new Error(`Unknown pricing field path: ${path}`);

    if (parts[2] === "tiers" && parts.length === 5) {
      const j = Number(parts[3]);
      const prop = parts[4];
      const tiers = mod.tiers as Array<Record<string, number>>;
      if (tiers?.[j] === undefined || (prop !== "cents" && prop !== "pct"))
        throw new Error(`Unknown pricing field path: ${path}`);
      tiers[j][prop] = prop === "pct" ? value : Math.round(value);
      return next;
    }

    const prop = parts[2];
    if (
      parts.length === 3 &&
      (prop === "cents" || prop === "pct" || prop === "freeUnits")
    ) {
      (mod as Record<string, number>)[prop] =
        prop === "pct" ? value : Math.round(value);
      return next;
    }
  }

  throw new Error(`Unknown pricing field path: ${path}`);
}

// ---------------------------------------------------------------------------
// Admin-facing validation guards
// ---------------------------------------------------------------------------

/**
 * Per-field + cross-field guards run before save. Keyed by field path
 * (plus "col.defaultDurationMin" for the column-backed duration field).
 */
export function validateEditableFields(
  config: ServicePricingConfig,
  defaultDurationMin: number | null,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const f of deriveEditableFields(config)) {
    if (Number.isNaN(f.value)) {
      errors[f.path] = "Enter a value.";
      continue;
    }
    if (!f.allowNegative && f.min !== undefined && f.value < f.min) {
      errors[f.path] =
        f.kind === "cents"
          ? `Must be at least $${f.min / 100}.`
          : `Must be at least ${f.min}.`;
    }
    if (f.max !== undefined && f.value > f.max) {
      errors[f.path] = `Must be at most ${f.max}.`;
    }
  }

  const c = config.constraints;
  if (
    c.minDurationMin !== undefined &&
    c.maxDurationMin !== undefined &&
    c.minDurationMin > c.maxDurationMin
  ) {
    errors["c.maxDurationMin"] = "Max duration must be at least the minimum.";
  }

  if (
    defaultDurationMin === null ||
    Number.isNaN(defaultDurationMin) ||
    defaultDurationMin < 1
  ) {
    errors["col.defaultDurationMin"] = "Enter a duration of at least 1 minute.";
  }

  return errors;
}
```

- [ ] **Step 5: Update the barrel** — in `src/features/admin/index.ts`, replace the `pricing-config-fields` export block (lines ~128-130) with:

```ts
// pricing-config-fields (pure helpers for the modifier-aware pricing editor)
export {
  deriveEditableFields,
  setLeaf,
  validateEditableFields,
} from "./pricing-config-fields";
export type {
  PricingEditField,
  PricingFieldKind,
} from "./pricing-config-fields";
```

- [ ] **Step 6: Run tests + typecheck to verify they pass**

Run: `npx vitest run src/features/admin/pricing-config-fields.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: exit 0 (no dangling importer of the removed `pricingFields`/`fieldsToConfig`).

- [ ] **Step 7: Commit**

```bash
git add "src/features/admin/pricing-config-fields.ts" "src/features/admin/pricing-config-fields.test.ts" "src/features/admin/index.ts"
git commit -m "feat(admin): derive editable pricing fields from config"
```

---

### Task 4: Drop the dead `max_pets` admin write path

**Files:**

- Modify: `src/features/admin/services-actions.ts:116-126` (input schema) and `:172-183` (update payload)

**Interfaces:**

- Consumes: nothing new.
- Produces: `UpdateServiceInput` no longer has `max_pets`; `updateServiceCore` never writes the `max_pets` column.

- [ ] **Step 1: Remove `max_pets` from the input schema** — in `updateServiceInputSchema`, delete the line:

```ts
  max_pets: z.number().int().positive().optional(),
```

- [ ] **Step 2: Remove the `max_pets` write** — delete the line in the payload builder:

```ts
if (rest.max_pets !== undefined) update.max_pets = rest.max_pets;
```

- [ ] **Step 3: Verify the column is gone from the write path**

Use the Grep tool for `max_pets` in `src/features/admin/services-actions.ts`.
Expected: matches only in the SELECT string (read) and the `serviceAdminRowSchema`/doc comment — NOT in `updateServiceInputSchema` or the `update` payload.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (`rest` no longer carries `max_pets`; no consumer of `UpdateServiceInput.max_pets` exists — the UI never sent it.)

- [ ] **Step 5: Commit**

```bash
git add "src/features/admin/services-actions.ts"
git commit -m "refactor(admin): drop dead max_pets write path"
```

---

### Task 5: Pricing fields editor components

**Files:**

- Create: `src/app/(site)/(admin)/admin/services/_components/pricing-field-input.tsx`
- Create: `src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.tsx`
- Test: `src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.test.tsx`

**Interfaces:**

- Consumes: `deriveEditableFields`, `setLeaf`, `PricingEditField` from `@/features/admin`; `centsToDollarsNumber`, `dollarsToCents` from `@/features/pricing`.
- Produces:
  - `PricingFieldInput({ field: PricingEditField; onChange: (value: number) => void; error?: string })`
  - `PricingFieldsEditor({ config: ServicePricingConfig; defaultDurationMin: number | null; onConfigChange: (next: ServicePricingConfig) => void; onDefaultDurationChange: (value: number) => void; errors: Record<string, string> })`

- [ ] **Step 1: Write the failing test** — create `pricing-fields-editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PricingFieldsEditor } from "./pricing-fields-editor";
import type { ServicePricingConfig } from "@/features/pricing";

const WALK: ServicePricingConfig = {
  modifiers: [
    { kind: "base_per_hour", cents: 2500 },
    { kind: "min_floor", cents: 1500 },
  ],
  constraints: {
    intervalMin: 15,
    minDurationMin: 30,
    maxDurationMin: 180,
    maxDogs: 2,
    allowedSpecies: ["dog"],
  },
};

function setup(errors: Record<string, string> = {}) {
  const onConfigChange = vi.fn();
  const onDefaultDurationChange = vi.fn();
  render(
    <PricingFieldsEditor
      config={WALK}
      defaultDurationMin={60}
      onConfigChange={onConfigChange}
      onDefaultDurationChange={onDefaultDurationChange}
      errors={errors}
    />,
  );
  return { onConfigChange, onDefaultDurationChange };
}

describe("PricingFieldsEditor", () => {
  it("renders the base rate in dollars and the limits", () => {
    setup();
    expect(
      (screen.getByLabelText("Base rate (per hour)") as HTMLInputElement).value,
    ).toBe("25");
    expect(screen.getByLabelText("Max dogs")).toBeInTheDocument();
    // allowedSpecies is read-only text, not an input.
    expect(screen.queryByLabelText("Allowed species")).toBeNull();
    expect(screen.getByText("dog")).toBeInTheDocument();
  });

  it("converts a dollar edit back to cents via onConfigChange", () => {
    const { onConfigChange } = setup();
    fireEvent.change(screen.getByLabelText("Base rate (per hour)"), {
      target: { value: "30" },
    });
    const next = onConfigChange.mock.calls[0][0] as ServicePricingConfig;
    expect((next.modifiers[0] as { cents: number }).cents).toBe(3000);
  });

  it("shows a field error from the errors map", () => {
    setup({ "c.maxDogs": "Must be at least 1." });
    expect(screen.getByText("Must be at least 1.")).toBeInTheDocument();
  });

  it("renders the column-backed default duration field", () => {
    const { onDefaultDurationChange } = setup();
    fireEvent.change(screen.getByLabelText("Default duration"), {
      target: { value: "45" },
    });
    expect(onDefaultDurationChange).toHaveBeenCalledWith(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.test.tsx"`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Create `pricing-field-input.tsx`:**

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDollarsNumber, dollarsToCents } from "@/features/pricing";
import type { PricingEditField } from "@/features/admin";

/**
 * One editable numeric pricing field. cents render as a $-adorned dollar input
 * (round-tripped to integer cents on change); pct/minutes show their unit;
 * int is a plain number. Conveys errors by text + aria, never color alone.
 */
export function PricingFieldInput({
  field,
  onChange,
  error,
}: {
  field: PricingEditField;
  onChange: (value: number) => void;
  error?: string;
}) {
  const id = `pf-${field.path}`;
  const errId = `${id}-err`;
  const display =
    field.kind === "cents" ? centsToDollarsNumber(field.value) : field.value;
  const suffix =
    field.kind === "pct" ? "%" : field.kind === "minutes" ? "min" : null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    onChange(field.kind === "cents" ? dollarsToCents(num) : num);
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{field.label}</Label>
      <div className="flex items-center gap-2">
        {field.kind === "cents" && (
          <span className="text-muted-foreground text-sm">$</span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={field.kind === "cents" ? "0.01" : "1"}
          min={field.allowNegative ? undefined : field.min}
          max={field.max}
          value={Number.isNaN(display) ? "" : display}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={handleChange}
          className="max-w-40"
        />
        {suffix && (
          <span className="text-muted-foreground text-sm">{suffix}</span>
        )}
      </div>
      {error && (
        <p id={errId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `pricing-fields-editor.tsx`:**

```tsx
"use client";

import {
  deriveEditableFields,
  setLeaf,
  type PricingEditField,
} from "@/features/admin";
import type { ServicePricingConfig } from "@/features/pricing";
import { PricingFieldInput } from "./pricing-field-input";

const SECTION_HEAD =
  "text-brand-strong text-xs font-semibold tracking-widest uppercase";

/**
 * Renders a service's editable pricing as two grouped sections — Rates &
 * discounts (modifier value leaves) and Booking limits (numeric constraints +
 * the column-backed default duration + read-only allowed species). The config
 * object is the source of truth: each input writes one leaf back via setLeaf.
 */
export function PricingFieldsEditor({
  config,
  defaultDurationMin,
  onConfigChange,
  onDefaultDurationChange,
  errors,
}: {
  config: ServicePricingConfig;
  defaultDurationMin: number | null;
  onConfigChange: (next: ServicePricingConfig) => void;
  onDefaultDurationChange: (value: number) => void;
  errors: Record<string, string>;
}) {
  const fields = deriveEditableFields(config);
  const rates = fields.filter((f) => f.group === "rates");
  const limits = fields.filter((f) => f.group === "limits");

  const durationField: PricingEditField = {
    path: "col.defaultDurationMin",
    label: "Default duration",
    kind: "minutes",
    value: defaultDurationMin ?? NaN,
    group: "limits",
    min: 1,
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className={SECTION_HEAD}>Rates &amp; discounts</p>
        {rates.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            No priced fields for this service.
          </p>
        ) : (
          rates.map((f) => (
            <PricingFieldInput
              key={f.path}
              field={f}
              error={errors[f.path]}
              onChange={(v) => onConfigChange(setLeaf(config, f.path, v))}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <p className={SECTION_HEAD}>Booking limits</p>
        {limits.map((f) => (
          <PricingFieldInput
            key={f.path}
            field={f}
            error={errors[f.path]}
            onChange={(v) => onConfigChange(setLeaf(config, f.path, v))}
          />
        ))}
        <PricingFieldInput
          field={durationField}
          error={errors["col.defaultDurationMin"]}
          onChange={onDefaultDurationChange}
        />
        <div className="space-y-1">
          <p className="text-foreground text-sm font-medium">Allowed species</p>
          <p className="text-muted-foreground text-sm">
            {config.constraints.allowedSpecies.join(", ")}
          </p>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `npx vitest run "src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.test.tsx"`
Expected: PASS.
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(site)/(admin)/admin/services/_components/pricing-field-input.tsx" "src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.tsx" "src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.test.tsx"
git commit -m "feat(admin): pricing fields editor component"
```

---

### Task 6: Wire the editor into the services editor (ServiceEditForm)

**Files:**

- Create: `src/app/(site)/(admin)/admin/services/_components/service-edit-form.tsx`
- Modify: `src/app/(site)/(admin)/admin/services/_components/services-client.tsx` (slim to list + render `ServiceEditForm`)
- Test: `src/app/(site)/(admin)/admin/services/_components/service-edit-form.test.tsx`

**Interfaces:**

- Consumes: `deriveEditableFields`/`setLeaf`/`validateEditableFields` (via `PricingFieldsEditor`), `updateService`, `ServiceAdminRow` from `@/features/admin`; `parsePricingConfig` from `@/features/pricing`.
- Produces: `ServiceEditForm({ service: ServiceAdminRow; onCancel: () => void; onSaved: (serviceId: string) => void })`.

- [ ] **Step 1: Write the failing test** — create `service-edit-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { updateServiceMock } = vi.hoisted(() => ({
  updateServiceMock: vi.fn(async () => ({ kind: "success" as const })),
}));

vi.mock("@/features/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/features/admin")>();
  return { ...actual, updateService: updateServiceMock };
});

import { ServiceEditForm } from "./service-edit-form";
import type { ServiceAdminRow } from "@/features/admin";

const WALK_ROW: ServiceAdminRow = {
  id: "svc-walk",
  slug: "walk",
  name: "Walk",
  description: null,
  pricing_type: "walk",
  pricing_config: {
    modifiers: [{ kind: "base_per_hour", cents: 2500 }],
    constraints: {
      intervalMin: 15,
      minDurationMin: 30,
      maxDurationMin: 180,
      maxDogs: 2,
      allowedSpecies: ["dog"],
    },
  },
  default_duration_min: 60,
  max_pets: null,
  concurrency: "exclusive",
  form_key: null,
  requires_approval: false,
  active: true,
  sort_order: 0,
};

describe("ServiceEditForm", () => {
  it("saves a rate edit as a rebuilt pricing_config", async () => {
    render(
      <ServiceEditForm
        service={WALK_ROW}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Base rate (per hour)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateServiceMock).toHaveBeenCalledTimes(1));
    const arg = updateServiceMock.mock.calls[0][0];
    expect(arg.serviceId).toBe("svc-walk");
    expect(arg.pricing_config.modifiers[0].cents).toBe(3000);
    expect(arg.default_duration_min).toBe(60);
  });

  it("blocks save and shows an error for an out-of-range value", async () => {
    render(
      <ServiceEditForm
        service={WALK_ROW}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Max dogs"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/at least 1/i)).toBeInTheDocument();
    expect(updateServiceMock).not.toHaveBeenCalled();
  });

  it("falls back to read-only pricing for an unparseable config", () => {
    const legacy = {
      ...WALK_ROW,
      pricing_config: { rate_cents_per_hour: 2500 },
    } as ServiceAdminRow;
    render(
      <ServiceEditForm
        service={legacy}
        onCancel={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Base rate (per hour)")).toBeNull();
    expect(screen.getByText(/can't be edited here/i)).toBeInTheDocument();
  });
});
```

> Note: `updateServiceMock` is reset per test by Vitest's default isolation; the "blocks save" test asserts it was never called in that render.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/(site)/(admin)/admin/services/_components/service-edit-form.test.tsx"`
Expected: FAIL — `ServiceEditForm` doesn't exist.

- [ ] **Step 3: Create `service-edit-form.tsx`:**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  updateService,
  validateEditableFields,
  type ServiceAdminRow,
} from "@/features/admin";
import { parsePricingConfig } from "@/features/pricing";
import type { ServicePricingConfig } from "@/features/pricing";
import { PricingFieldsEditor } from "./pricing-fields-editor";

/** Maps a ZodError from parsePricingConfig back onto field paths (backstop). */
function zodToFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const p = issue.path;
    if (p[0] === "constraints" && typeof p[1] === "string") {
      out[`c.${p[1]}`] = issue.message;
    } else if (p[0] === "modifiers" && typeof p[1] === "number") {
      out[
        p[2] === "tiers"
          ? `m.${p[1]}.tiers.${p[3]}.${p[4]}`
          : `m.${p[1]}.${p[2]}`
      ] = issue.message;
    } else {
      out._form = issue.message;
    }
  }
  return out;
}

export function ServiceEditForm({
  service,
  onCancel,
  onSaved,
}: {
  service: ServiceAdminRow;
  onCancel: () => void;
  onSaved: (serviceId: string) => void;
}) {
  // Parse the seeded config once. An unparseable (legacy) row → pricing is
  // read-only; name/description/toggles stay editable.
  const initialConfig = useMemo<ServicePricingConfig | null>(() => {
    try {
      return parsePricingConfig(service.pricing_config);
    } catch {
      return null;
    }
  }, [service.pricing_config]);

  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [requiresApproval, setRequiresApproval] = useState(
    service.requires_approval,
  );
  const [active, setActive] = useState(service.active);
  const [config, setConfig] = useState<ServicePricingConfig | null>(
    initialConfig,
  );
  const [defaultDurationMin, setDefaultDurationMin] = useState<number | null>(
    service.default_duration_min,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setErrors({});

    // Pricing is only sent when the config parsed (editable). Validate + send.
    let pricingConfig: ServicePricingConfig | undefined;
    if (config) {
      const fieldErrors = validateEditableFields(config, defaultDurationMin);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        return;
      }
      try {
        parsePricingConfig(config);
      } catch (e) {
        if (e instanceof ZodError) {
          setErrors(zodToFieldErrors(e));
          return;
        }
        setErrors({ _form: "Invalid pricing configuration." });
        return;
      }
      pricingConfig = config;
    }

    startTransition(async () => {
      const result = await updateService({
        serviceId: service.id,
        name,
        description: description || null,
        requires_approval: requiresApproval,
        active,
        ...(pricingConfig
          ? {
              pricing_config: pricingConfig,
              default_duration_min: defaultDurationMin ?? undefined,
            }
          : {}),
      });
      if (result.kind === "success") {
        onSaved(service.id);
      } else {
        setErrors({
          _form:
            "message" in result
              ? result.message
              : `Couldn't save: ${result.kind}`,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="font-medium">{service.name}</span>
        <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs tracking-wide lowercase">
          type: {service.pricing_type}
        </span>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`name-${service.id}`}>Name</Label>
        <Input
          id={`name-${service.id}`}
          maxLength={FIELD_LIMITS.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`desc-${service.id}`}>Description</Label>
        <Input
          id={`desc-${service.id}`}
          maxLength={FIELD_LIMITS.note}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-brand-strong text-xs font-semibold tracking-widest uppercase">
          Pricing
        </p>
        {config ? (
          <PricingFieldsEditor
            config={config}
            defaultDurationMin={defaultDurationMin}
            onConfigChange={setConfig}
            onDefaultDurationChange={setDefaultDurationMin}
            errors={errors}
          />
        ) : (
          <p className="text-muted-foreground text-sm italic">
            This service&apos;s pricing is in an older format and can&apos;t be
            edited here. (Type: {service.pricing_type})
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-3">
          <Switch
            checked={requiresApproval}
            onCheckedChange={setRequiresApproval}
            disabled={isPending}
            aria-label="Requires approval"
          />
          <span className="text-sm font-medium">Requires approval</span>
        </label>
        <label className="flex items-center gap-3">
          <Switch
            checked={active}
            onCheckedChange={setActive}
            disabled={isPending}
            aria-label="Active"
          />
          <span className="text-sm font-medium">Active</span>
        </label>
      </div>

      {errors._form && (
        <p role="alert" className="text-destructive text-sm">
          {errors._form}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Slim `services-client.tsx`** — replace the entire file with the list + `ServiceEditForm` wiring (removes the inline edit form, the old `pricing_config`-omitted save, and now-unused imports):

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type ServiceAdminRow } from "@/features/admin";
import { ServiceEditForm } from "./service-edit-form";

export function ServicesClient({ services }: { services: ServiceAdminRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <ul className="space-y-6">
      {services.map((svc) => (
        <li key={svc.id} className="rounded-md border p-4">
          {editingId === svc.id ? (
            <ServiceEditForm
              service={svc}
              onCancel={() => setEditingId(null)}
              onSaved={(id) => {
                setEditingId(null);
                setSavedId(id);
              }}
            />
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="text-sm">
                <p className="font-medium">{svc.name}</p>
                <p className="text-muted-foreground">
                  {svc.pricing_type} · {svc.concurrency} ·{" "}
                  {svc.active ? "active" : "inactive"}
                </p>
                {svc.description && (
                  <p className="text-muted-foreground">{svc.description}</p>
                )}
                {savedId === svc.id && (
                  <p className="text-muted-foreground text-sm">Saved!</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingId(svc.id);
                  setSavedId(null);
                }}
              >
                Edit
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npx vitest run "src/app/(site)/(admin)/admin/services/_components/service-edit-form.test.tsx"`
Expected: PASS (save rebuilds config, out-of-range blocks, legacy fallback).
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(site)/(admin)/admin/services/_components/service-edit-form.tsx" "src/app/(site)/(admin)/admin/services/_components/service-edit-form.test.tsx" "src/app/(site)/(admin)/admin/services/_components/services-client.tsx"
git commit -m "feat(admin): editable pricing in the services editor"
```

---

### Task 7: Full-suite verification + handoff doc

**Files:**

- Modify: `docs/superpowers/PRICING-HANDOFF.md` (mark P4 done)

- [ ] **Step 1: Run the touched suites together**

Run:

```
npx vitest run src/features/pricing/display.test.ts src/features/pricing/config-schemas.test.ts src/features/admin/pricing-config-fields.test.ts "src/app/(site)/(admin)/admin/services/_components/pricing-fields-editor.test.tsx" "src/app/(site)/(admin)/admin/services/_components/service-edit-form.test.tsx"
```

Expected: all PASS.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Update the handoff** — in `docs/superpowers/PRICING-HANDOFF.md`, change the `P4 — admin pricing editor` carry-forward bullet to mark it DONE (editor edits numeric leaves + constraints + default_duration_min; schema rejects incoherent constraints; max_pets write path removed) and note it is unpushed on local `main`.

- [ ] **Step 4: Commit the doc**

```bash
git add "docs/superpowers/PRICING-HANDOFF.md"
git commit -m "docs(pricing): record admin pricing editor done"
```

---

## Self-Review

**Spec coverage:**

- Pure module (`deriveEditableFields`/`setLeaf` + value-only boundary) → Task 3. ✓
- Money conversion helpers → Task 1. ✓
- Config-as-state, immutable write-back → Task 3 (`setLeaf`) + Task 5/6 wiring. ✓
- `PricingFieldInput` / `PricingFieldsEditor` / `ServiceEditForm` / slim `ServicesClient` → Tasks 5–6. ✓
- Data flow: parse-on-open, legacy read-only fallback, editor guards → `parsePricingConfig` backstop → `updateService` → Task 6. ✓
- Schema hardening (`.superRefine`) → Task 2. ✓
- Dead `max_pets` write-path removal → Task 4. ✓
- `default_duration_min` surfaced → Task 5 (editor field) + Task 6 (save payload). ✓
- Testing: module derive/setLeaf/validate, schema refine, money rounding, editor render, form save + fallback → Tasks 1–6. ✓
- Out-of-scope items are not implemented (no add/remove modifiers, no species edit, no quote preview, no column drop, no `updated_at`). ✓

**Placeholder scan:** none — every code step shows complete code; every run step shows the command + expected result.

**Type consistency:** `PricingEditField`/`PricingFieldKind`/`deriveEditableFields`/`setLeaf`/`validateEditableFields` names are identical across Tasks 3, 5, 6 and the barrel. `setLeaf(config, path, value)` and `validateEditableFields(config, defaultDurationMin)` signatures match every call site. `updateService` payload keys (`serviceId`, `name`, `description`, `requires_approval`, `active`, `pricing_config`, `default_duration_min`) match `UpdateServiceInput` (with `max_pets` removed in Task 4).

_Last reviewed: 2026-06-18_
