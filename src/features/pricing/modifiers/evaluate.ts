// evaluate.ts
import type { QuoteBreakdown, QuoteLine } from "../types";
import type {
  Condition,
  Modifier,
  QuoteInput,
  ServicePricingConfig,
  Unit,
} from "../modifier-types";
import { COMPLIMENTARY_MODIFIER_ID } from "../modifier-types";
import { unitNoun } from "../display";
import { describeModifier } from "../term-descriptions";

const round = (n: number) => Math.round(n);
const sum = (lines: QuoteLine[]) =>
  lines.reduce((a, l) => a + l.amountCents, 0);

/**
 * The booking's pets, defaulted. `others` is every pet that is neither a dog nor
 * a cat.
 */
function petCounts(i: QuoteInput): {
  dogs: number;
  cats: number;
  others: number;
} {
  return { dogs: i.dogs ?? 0, cats: i.cats ?? 0, others: i.others ?? 0 };
}

/**
 * How many pets of `unit` bill as extras.
 *
 * The base night covers the FIRST pet in dog → cat → other order, so whichever
 * species holds that spot bills one fewer than it brought.
 */
function unitCount(unit: Unit, i: QuoteInput): number {
  const { dogs, cats, others } = petCounts(i);
  if (unit === "dog") return Math.max(0, dogs - 1);
  if (unit === "cat") return dogs >= 1 ? cats : Math.max(0, cats - 1);
  return dogs + cats >= 1 ? others : Math.max(0, others - 1);
}

/** Whether a modifier's condition holds for this booking. */
function conditionHolds(c: Condition, i: QuoteInput): boolean {
  switch (c) {
    case "always":
      return true;
    case "noDogs":
      return (i.dogs ?? 0) === 0;
    case "catsOnly":
      // A home with cats and no dogs. Distinct from `noDogs`, which also holds
      // for a stay with no cat in it at all — a bird or a rabbit — and so
      // cannot carry a discount whose label names cats.
      return (i.cats ?? 0) > 0 && (i.dogs ?? 0) === 0;
    case "anyDogUnder6mo":
      return !!i.anyDogUnder6mo;
    case "recurringSeries":
      return !!i.recurringSeries;
    case "nightsOver4":
      return (i.nights ?? 0) > 4;
    case "nightsOver6":
      return (i.nights ?? 0) > 6;
  }
}

export function evaluate(
  config: ServicePricingConfig,
  i: QuoteInput,
): QuoteBreakdown {
  const nights = i.nights ?? 0,
    hours = i.hours ?? 0;
  const { dogs, cats, others } = petCounts(i);
  // The nightly base covers the stay's first pet, whatever species it is. A
  // house-sit for a bird or a rabbit is still a house-sit: gating the base on
  // dogs and cats alone left every other species at a $0 base.
  const hasPet = dogs + cats + others >= 1;
  const m = config.modifiers;
  const lines: QuoteLine[] = [];

  // Phase 1 — base
  for (const mod of m) {
    if (mod.kind === "base_per_night" && hasPet) {
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
          label: `Extra ${unitNoun(mod.unit)} (${n})`,
          amountCents: round(n * mod.cents * nightsOr1(nights)),
          description: describeModifier(mod),
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
      // A fractional night count makes the per-unit rate fractional too, and
      // every line amount is integer cents.
      const amountCents = round(cents);
      if (amountCents > 0)
        lines.push({
          label: `Additional ${unitNoun(mod.unit)}`,
          amountCents,
        });
    }
    if (mod.kind === "flat_per_night_toggle" && !mod.manual) {
      const count = toggleCount(mod, i);
      if (count !== 0)
        lines.push({
          label: mod.label,
          amountCents: round(mod.cents * count * nightsOr1(nights)),
          description: describeModifier(mod),
        });
    }
    if (mod.kind === "per_hour_addon" && i.leashManners) {
      lines.push({ label: mod.label, amountCents: round(mod.cents * hours) });
    }
    if (mod.kind === "allowance_then_per_unit" && mod.unit === "exercise") {
      const perDay = i.exerciseMinutesPerDay ?? 0;
      const blocks = Math.max(0, Math.ceil((perDay - mod.freeUnits) / 15));
      const days = Math.ceil(nights);
      // Extra exercise is a per-night add-on for the stay, not per pet.
      if (blocks > 0 && days > 0)
        lines.push({
          label: mod.label,
          amountCents: round(blocks * mod.cents * days),
        });
    }
  }

  // Phase 3 — pct_surcharge (premium) on running subtotal of phases 1-2
  for (const mod of m) {
    if (mod.kind !== "pct_surcharge") continue;
    const premiumNights = i.premiumNights ?? 0;
    if (premiumNights <= 0) continue;
    const subtotal = sum(lines);
    const factor =
      mod.scope === "perPremiumNight" && nights > 0
        ? premiumNights / nights
        : 1;
    const amt = round((mod.pct / 100) * subtotal * factor);
    if (amt !== 0)
      lines.push({
        label: mod.label,
        amountCents: amt,
        description: describeModifier(mod),
      });
  }

  // Phase 4 — min_floor (pre-discount)
  for (const mod of m) {
    if (mod.kind !== "min_floor") continue;
    const subtotal = sum(lines);
    if (subtotal > 0 && subtotal < mod.cents)
      lines.push({
        label: "Minimum charge",
        amountCents: mod.cents - subtotal,
      });
  }

  // Phase 5 — auto discounts (compounding)
  for (const mod of m) {
    if (mod.kind !== "pct_discount" || mod.manual) continue;
    if (!conditionHolds(mod.condition, i)) continue;
    const subtotal = sum(lines);
    const amt = round((mod.pct / 100) * subtotal);
    if (amt !== 0)
      lines.push({
        label: mod.label,
        amountCents: -amt,
        description: describeModifier(mod),
      });
  }

  // Phase 6 — manual discounts (admin-enabled) + custom adjustments
  const enabled = new Set(i.enabledManualIds ?? []);
  for (const mod of m) {
    if (
      mod.kind === "pct_discount" &&
      mod.manual &&
      enabled.has(mod.id) &&
      conditionHolds(mod.condition, i)
    ) {
      const amt = round((mod.pct / 100) * sum(lines));
      if (amt !== 0)
        lines.push({
          label: mod.label,
          amountCents: -amt,
          description: describeModifier(mod),
        });
    }
    if (
      mod.kind === "flat_per_night_toggle" &&
      mod.manual &&
      enabled.has(mod.id)
    ) {
      lines.push({
        label: mod.label,
        amountCents: round(mod.cents * nightsOr1(nights)),
        description: describeModifier(mod),
      });
    }
  }
  for (const adj of i.customAdjustments ?? []) {
    const amt =
      adj.amountCents != null
        ? adj.amountCents
        : round(((adj.pct ?? 0) / 100) * sum(lines));
    if (amt !== 0)
      lines.push({ label: adj.label, amountCents: -Math.abs(amt) });
  }

  // Phase 7 — travel (never discounted, and skipped outright on a complimentary
  // booking: a discount phase cannot reach a line quoted after it, so the only
  // way to a genuinely free booking is to leave the mileage out). The skip is
  // the tail of the discount itself, so it runs on exactly the test phase 6
  // applied — an id the config does not offer takes no mileage away.
  const complimentary = m.some(
    (mod) =>
      mod.kind === "pct_discount" &&
      mod.manual === true &&
      mod.id === COMPLIMENTARY_MODIFIER_ID &&
      enabled.has(mod.id) &&
      conditionHolds(mod.condition, i),
  );
  if (!complimentary) {
    for (const mod of m) {
      if (mod.kind !== "allowance_then_per_unit" || mod.unit !== "mile")
        continue;
      const billable = Math.max(0, (i.billableMiles ?? 0) - mod.freeUnits);
      if (billable > 0)
        lines.push({
          label: mod.label,
          amountCents: round(billable * mod.cents),
        });
    }
  }

  return { lines, finalCents: sum(lines) };
}

function nightsOr1(nights: number): number {
  return nights > 0 ? nights : 1;
}

/**
 * How many times a per-night toggle applies: a ladder counts its rungs, and a
 * condition counts once when it holds. Every condition is answered by
 * {@link conditionHolds}, so a toggle keyed on a recurring series or a night
 * count cannot fire on a booking that is neither.
 */
function toggleCount(
  mod: Extract<Modifier, { kind: "flat_per_night_toggle" }>,
  i: QuoteInput,
): number {
  if (mod.source.kind === "ladder")
    return Math.min(i.needyTier ?? 0, mod.source.maxTier);
  return conditionHolds(mod.source.condition, i) ? 1 : 0;
}
