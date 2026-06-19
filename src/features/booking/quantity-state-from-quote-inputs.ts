/**
 * Pure inverse of `quantitiesToRecord` — rebuilds a `QuantityState` from a stored
 * jsonb so the edit form can seed its inputs. Handles both shapes the input can
 * take: the raw `quantitiesToRecord` record (carries `maxHoursAway` /
 * `leashManners`) and the persisted `QuoteInput` (carries `needyTier` /
 * `leashManners`). `nights` (house-sitting) is ignored — re-derived from the date
 * range, as the create flow does.
 */
import type { PricingType } from "@/features/pricing";
import type { QuantityState } from "@/features/booking/_components/quantity-forms";
import { representativeHoursFromNeedyTier } from "./needy-tier";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function reconstructMaxHoursAway(q: Record<string, unknown>): number {
  if (typeof q.maxHoursAway === "number" && Number.isFinite(q.maxHoursAway))
    return q.maxHoursAway;
  if (typeof q.needyTier === "number" && Number.isFinite(q.needyTier))
    return representativeHoursFromNeedyTier(q.needyTier);
  return 8;
}

export function quantityStateFromQuoteInputs(
  pricingType: PricingType,
  quoteInputs: unknown,
): QuantityState {
  const q = (quoteInputs ?? {}) as Record<string, unknown>;
  switch (pricingType) {
    case "house_sitting":
      return {
        type: "house_sitting",
        qty: {
          walkMinutesPerDay: num(q.walkMinutesPerDay, 0),
          maxHoursAway: reconstructMaxHoursAway(q),
        },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: num(q.hours, 1) } };
    case "walk":
      return {
        type: "walk",
        qty: {
          hours: num(q.hours, 1),
          leashManners: q.leashManners === true,
        },
      };
    case "training":
      return { type: "training", qty: { hours: num(q.hours, 1) } };
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
  }
}
