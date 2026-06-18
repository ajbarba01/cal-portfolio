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
          amountCents: round(n * mod.cents * nightsOr1(nights)),
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

  // --- after phase 2, before return ---
  const conditionHolds = (
    c: import("../modifier-types").Condition,
  ): boolean => {
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
      mod.scope === "perPremiumNight" && nights > 0
        ? premiumNights / nights
        : 1;
    const amt = round((mod.pct / 100) * subtotal * factor);
    if (amt !== 0) lines.push({ label: mod.label, amountCents: amt });
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
    if (amt !== 0)
      lines.push({ label: adj.label, amountCents: -Math.abs(amt) });
  }

  // Phase 7 — travel (never discounted)
  for (const mod of m) {
    if (mod.kind !== "allowance_then_per_unit" || mod.unit !== "mile") continue;
    const billable = Math.max(0, (i.billableMiles ?? 0) - mod.freeUnits);
    if (billable > 0)
      lines.push({
        label: mod.label,
        amountCents: round(billable * mod.cents),
      });
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
