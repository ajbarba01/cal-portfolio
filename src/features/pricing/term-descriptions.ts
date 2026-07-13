import type { Modifier } from "./modifier-types";

/**
 * Plain-language definitions for pricing terms customers find confusing.
 *
 * Keys are STRUCTURE-DERIVED (a modifier's condition / ladder input / unit),
 * never the admin-typed `label` or `id` — so the copy can't drift when Cal
 * renames a modifier. These strings are Cal-approved copy (copy-sync); drafts
 * here ship as tooltips and are refined via the copy-sync protocol.
 */
export const TERM_DESCRIPTIONS: Record<string, string> = {
  premiumDays:
    "Holiday & peak-date rate — a surcharge that applies on major holidays and other high-demand dates.",
  needyTier:
    "Extra-attention care — for pets needing more frequent check-ins or hands-on care during the stay.",
  nightsOver4: "Long stay — applies once a booking runs longer than 4 nights.",
  nightsOver6:
    "Extended stay — applies once a booking runs longer than 6 nights.",
  "unit:cat": "Per cat, including the first.",
  "unit:dog": "Per dog, including the first.",
};

/** Stable, structure-derived key for a modifier, or undefined if it has no term. */
export function termKeyForModifier(mod: Modifier): string | undefined {
  switch (mod.kind) {
    case "flat_per_unit":
      return mod.unit === "cat" || mod.unit === "dog"
        ? `unit:${mod.unit}`
        : undefined;
    case "pct_surcharge":
      return mod.condition === "premiumDays" ? "premiumDays" : undefined;
    case "flat_per_night_toggle":
      return mod.source.kind === "ladder" && mod.source.input === "needyTier"
        ? "needyTier"
        : mod.source.kind === "condition" &&
            (mod.source.condition === "nightsOver4" ||
              mod.source.condition === "nightsOver6")
          ? mod.source.condition
          : undefined;
    default:
      return undefined;
  }
}

/** The definition string for a modifier, or undefined. */
export function describeModifier(mod: Modifier): string | undefined {
  const key = termKeyForModifier(mod);
  return key ? TERM_DESCRIPTIONS[key] : undefined;
}
