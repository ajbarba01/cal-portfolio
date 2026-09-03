/**
 * Pure pricing display helpers — no IO, no side effects.
 *
 * formatCents: integer cents → formatted dollar string (whole dollars if even).
 * centsToDollars: integer cents → the same amount always at two decimals.
 * headlineRate: short "from" label derived from ServicePricingConfig modifiers.
 * pricingBreakdown: itemized rate structure rows derived from config.modifiers.
 */

import type { ServicePricingConfig, Modifier, Unit } from "./modifier-types";
import { describeModifier } from "./term-descriptions";

/**
 * The customer-facing noun for a pricing unit, so the rate table and the quote
 * receipt name the same animal the same way. The `other` unit covers every pet
 * that is neither a dog nor a cat, and its key must never reach a receipt line.
 */
export function unitNoun(unit: Unit): string {
  return unit === "other" ? "small animal" : unit;
}

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

// Constructed once at module scope: constructing an Intl.NumberFormat costs far
// more than formatting with it, and a ledger formats a money column per row.
// `Number.prototype.toLocaleString` with options allocates one per call, so it
// is deliberately not used here.
const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Formats integer cents as a dollar string with two decimals always shown
 * (5000 → "$50.00"), the format ledger surfaces want — a receipt line, a
 * balance, a refund. Use {@link formatCents} for headline rates instead, which
 * drops the decimals on a whole dollar amount.
 *
 * A debit renders its minus sign ahead of the symbol ("-$25.00"), which is what
 * separates this from a hand-rolled `toFixed(2)` ("$-25.00").
 */
export function centsToDollars(cents: number): string {
  // Negative zero reaches here from differences like `-(paid - owed)`; left
  // alone it would render as "-$0.00".
  return moneyFormat.format(cents === 0 ? 0 : cents / 100);
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
  description?: string;
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
              : "Each additional small animal";
        rows.push({
          label: unitLabel,
          value: `+${formatCents(mod.cents)}`,
          description: describeModifier(mod),
        });
        break;
      }

      case "tiered_per_unit": {
        const unitLabel = `Each additional ${unitNoun(mod.unit)}`;
        // Summarise using the first tier rate or pct.
        const firstTier = mod.tiers[0];
        if (firstTier !== undefined) {
          const tierValue =
            firstTier.cents !== undefined
              ? `+${formatCents(firstTier.cents)} / night`
              : firstTier.pct !== undefined
                ? `+${firstTier.pct}%`
                : "tiered";
          rows.push({
            label: unitLabel,
            value: tierValue,
            description: describeModifier(mod),
          });
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
          description: describeModifier(mod),
        });
        break;
      }

      case "per_hour_addon": {
        rows.push({
          label: mod.label,
          value: `+${formatCents(mod.cents)} / hour`,
          description: describeModifier(mod),
        });
        break;
      }

      case "allowance_then_per_unit": {
        const unitWord = mod.unit === "mile" ? "mile" : "exercise min";
        rows.push({
          label: mod.label,
          value: `+${formatCents(mod.cents)} / ${unitWord} (${mod.freeUnits} free)`,
          description: describeModifier(mod),
        });
        break;
      }

      case "pct_surcharge": {
        rows.push({
          label: mod.label,
          value: `+${mod.pct}%`,
          description: describeModifier(mod),
        });
        break;
      }

      case "pct_discount": {
        if (mod.manual) break;
        rows.push({
          label: mod.label,
          value: `−${mod.pct}%`,
          description: describeModifier(mod),
        });
        break;
      }

      case "min_floor": {
        rows.push({
          label: "Minimum",
          value: formatCents(mod.cents),
          description: describeModifier(mod),
        });
        break;
      }
    }
  }

  return rows;
}
