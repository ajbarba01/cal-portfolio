/**
 * Pure inverse of `quantitiesToRecord` — rebuilds a `QuantityState` from a
 * stored `quote_inputs` jsonb so the edit form can seed its inputs. `nights`
 * (house-sitting) is intentionally ignored here: it is re-derived from the
 * selected date range, exactly as the create flow does.
 */
import type { PricingType } from "@/features/pricing";
import type { QuantityState } from "@/features/booking/_components/quantity-forms";

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
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
          cantBeLeftAloneDays: num(q.cantBeLeftAloneDays, 0),
          walkMinutesPerDay: num(q.walkMinutesPerDay, 0),
          holidayDays: num(q.holidayDays, 0),
        },
      };
    case "check_in":
      return { type: "check_in", qty: { hours: num(q.hours, 1) } };
    case "walk":
      return { type: "walk", qty: { hours: num(q.hours, 1) } };
    case "training":
      return { type: "training", qty: { hours: num(q.hours, 1) } };
    case "meet_greet":
      return { type: "meet_greet", qty: {} };
  }
}
