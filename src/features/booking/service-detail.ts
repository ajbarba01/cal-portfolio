import { parsePricingConfig } from "@/features/pricing";
import type { PricingType, Constraints } from "@/features/pricing";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Permissive fallback used only when a service row's pricing_config can't be
 * parsed — keeps the booking UI functional (dog/cat, 15-min grid, no caps)
 * rather than crashing. Real services always carry their seeded constraints.
 */
export const DEFAULT_CONSTRAINTS: Constraints = {
  intervalMin: 15,
  allowedSpecies: ["dog", "cat"],
};

/**
 * Minimal service descriptor consumed by the booking UI (both the create flow
 * and the edit surface). Lives here so it can be imported by components at any
 * route depth without creating cross-app-dir imports.
 */
export interface ServiceDetail {
  slug: string;
  name: string;
  description: string | null;
  pricingType: PricingType;
  defaultDurationMin: number | null;
  /** The service's booking constraints (parsed from pricing_config). */
  constraints: Constraints;
}

/**
 * The `services` columns {@link toServiceDetail} maps. Every booking surface
 * selects this one string, so a surface cannot quietly stop selecting a column
 * the mapper reads. `id` is not part of {@link ServiceDetail} but every caller
 * needs it to key the booking reads that follow.
 */
export const SERVICE_DETAIL_COLUMNS =
  "id, slug, name, description, pricing_type, pricing_config, default_duration_min";

/** A `services` row as selected by {@link SERVICE_DETAIL_COLUMNS}. */
export type ServiceDetailRow = Pick<
  Tables<"services">,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "pricing_type"
  | "pricing_config"
  | "default_duration_min"
>;

/**
 * Maps a `services` row selected with {@link SERVICE_DETAIL_COLUMNS} onto the
 * descriptor the booking UI consumes. Pure: the row is already fetched.
 *
 * A pricing_config that will not parse degrades to {@link DEFAULT_CONSTRAINTS}
 * rather than throwing — a mis-seeded service still books, just without its
 * species and duration caps.
 */
export function toServiceDetail(row: ServiceDetailRow): ServiceDetail {
  let constraints = DEFAULT_CONSTRAINTS;
  try {
    constraints = parsePricingConfig(row.pricing_config).constraints;
  } catch {
    // keep DEFAULT_CONSTRAINTS — never crash a booking page on bad config
  }

  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    pricingType: row.pricing_type,
    defaultDurationMin: row.default_duration_min,
    constraints,
  };
}
