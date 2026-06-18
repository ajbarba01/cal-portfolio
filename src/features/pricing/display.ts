/**
 * Pure pricing display helpers — no IO, no side effects.
 *
 * formatCents: integer cents → formatted dollar string (whole dollars if even).
 * headlineRate: short "from" label derived from ServicePricingConfig modifiers.
 * pricingBreakdown: itemized rate structure rows derived from config.modifiers.
 */

import type { ServicePricingConfig, Modifier } from "./modifier-types";

/**
 * Formats integer cents as a dollar string.
 * Whole dollar amounts drop the decimal (e.g. 5000 → "$50").
 * Fractional amounts show two decimals (e.g. 5050 → "$50.50").
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

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

/** One row of a service's marketing pricing breakdown ("how it's priced"). */
export interface PricingBreakdownRow {
  label: string;
  value: string;
}

/**
 * Returns a short headline rate label for a service marketing card.
 * Scans config.modifiers for the base modifier kind.
 */
export function headlineRate(config: ServicePricingConfig): string {
  for (const mod of config.modifiers) {
    if (mod.kind === "base_per_night") {
      return `from ${formatCents(mod.cents)} / night`;
    }
    if (mod.kind === "base_per_hour") {
      return `${formatCents(mod.cents)} / hour`;
    }
  }
  return "Free";
}

/**
 * Returns the itemized "how it's priced" rows for a service's marketing
 * receipt — derived from config.modifiers, so admin rate edits flow
 * straight through. Descriptive (rate structure), not a computed quote.
 * Manual modifiers (manual: true) are excluded — they are never customer-visible.
 */
export function pricingBreakdown(
  config: ServicePricingConfig,
): PricingBreakdownRow[] {
  const rows: PricingBreakdownRow[] = [];

  // Find base modifier first.
  const baseMod = config.modifiers.find(
    (m): m is Extract<Modifier, { kind: "base_per_night" | "base_per_hour" }> =>
      m.kind === "base_per_night" || m.kind === "base_per_hour",
  );

  // No base → empty array (e.g. free / meet_greet style).
  if (!baseMod) return [];

  const baseValue =
    baseMod.kind === "base_per_night"
      ? `${formatCents(baseMod.cents)} / night`
      : `${formatCents(baseMod.cents)} / hour`;

  rows.push({ label: "Base rate", value: baseValue });

  // Remaining modifiers — customer-visible only (exclude manual).
  for (const mod of config.modifiers) {
    if (mod.kind === "base_per_night" || mod.kind === "base_per_hour") continue;

    switch (mod.kind) {
      case "flat_per_unit": {
        const unitLabel =
          mod.unit === "dog"
            ? "Each dog"
            : mod.unit === "cat"
              ? "Each cat"
              : "Each additional animal";
        rows.push({ label: unitLabel, value: `+${formatCents(mod.cents)}` });
        break;
      }

      case "tiered_per_unit": {
        const unitLabel =
          mod.unit === "dog"
            ? "Each additional dog"
            : mod.unit === "cat"
              ? "Each additional cat"
              : "Each additional animal";
        // Summarise using the first tier rate or pct.
        const firstTier = mod.tiers[0];
        if (firstTier !== undefined) {
          const tierValue =
            firstTier.cents !== undefined
              ? `+${formatCents(firstTier.cents)} / night`
              : firstTier.pct !== undefined
                ? `+${firstTier.pct}%`
                : "tiered";
          rows.push({ label: unitLabel, value: tierValue });
        }
        break;
      }

      case "flat_per_night_toggle": {
        if (mod.manual) break;
        const sign = mod.cents >= 0 ? "+" : "−";
        const absCents = Math.abs(mod.cents);
        rows.push({
          label: mod.label,
          value: `${sign}${formatCents(absCents)} / night`,
        });
        break;
      }

      case "per_hour_addon": {
        rows.push({
          label: mod.label,
          value: `+${formatCents(mod.cents)} / hour`,
        });
        break;
      }

      case "allowance_then_per_unit": {
        const unitWord = mod.unit === "mile" ? "mile" : "exercise min";
        rows.push({
          label: mod.label,
          value: `+${formatCents(mod.cents)} / ${unitWord} (${mod.freeUnits} free)`,
        });
        break;
      }

      case "pct_surcharge": {
        rows.push({ label: mod.label, value: `+${mod.pct}%` });
        break;
      }

      case "pct_discount": {
        if (mod.manual) break;
        rows.push({ label: mod.label, value: `−${mod.pct}%` });
        break;
      }

      case "min_floor": {
        rows.push({ label: "Minimum", value: formatCents(mod.cents) });
        break;
      }
    }
  }

  return rows;
}
