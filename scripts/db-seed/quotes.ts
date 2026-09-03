import { quote } from "../../src/features/pricing";
import type {
  QuoteBreakdown,
  QuoteInput,
  ServicePricingConfig,
} from "../../src/features/pricing";
import type { Json } from "../../src/lib/supabase/database.types";

/**
 * Miles every seeded client sits from the origin. Inside every service's free
 * travel allowance, so a demo price is the service rate itself — and the same
 * number reaches both the booking's `distance_miles` column and the frozen
 * quote's `billableMiles`, which is what makes the row re-priceable.
 */
export const SEED_DISTANCE_MILES = 3;

/**
 * The priced quantities of a seeded booking: a {@link QuoteInput} minus the two
 * parts the seed supplies itself — the service's pricing config (read from the
 * database at seed time) and the shared travel distance.
 */
export type SeedQuantities = Omit<QuoteInput, "config" | "billableMiles">;

/**
 * The frozen quote a seeded booking carries, produced by the same pure engine
 * the app quotes with.
 *
 * Seeded rows used to store `{}`, which no consumer can re-price: the admin
 * discount panel drops every manual discount whose stored quote it cannot
 * re-run, so demo bookings offered none at all.
 */
export function seedQuote(
  config: ServicePricingConfig,
  quantities: SeedQuantities,
): { input: QuoteInput; breakdown: QuoteBreakdown } {
  const input: QuoteInput = {
    ...quantities,
    config,
    billableMiles: SEED_DISTANCE_MILES,
  };
  return { input, breakdown: quote(input) };
}

/** Widens a domain object to the jsonb column type (mirrors the repository's `asJson`). */
export function asJson(value: object): Json {
  return value as unknown as Json;
}
