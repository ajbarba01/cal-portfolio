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
