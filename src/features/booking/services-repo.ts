/**
 * Thin IO layer for reading active services via a session/anon client.
 * Used by the public /services page (SSR, anon-readable via RLS).
 *
 * pricing_config is parsed/validated via Zod schemas before returning.
 * Rows with unparseable config are skipped (logged, not thrown).
 */

import type { DbClient } from "@/lib/supabase/db-client";
import { parsePricingConfig } from "@/features/pricing";
import type { PricingType, ServicePricingConfig } from "@/features/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PublicService = {
  slug: string;
  name: string;
  description: string | null;
  concurrency: "exclusive" | "resident";
  default_duration_min: number | null;
  max_pets: number | null;
  /** The service's pricing kind (drives copy lookups). */
  pricingType: PricingType;
  /** The validated modifier-list pricing config (drives the marketing receipt). */
  pricingConfig: ServicePricingConfig;
};

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

/**
 * Returns active services ordered by sort_order.
 * Rows whose pricing_config fails Zod validation are skipped, and a failed query
 * returns no services — both logged, so neither reads as an empty catalog.
 * Anon-readable via RLS ("services: public can read").
 */
export async function listActiveServices(
  supabase: DbClient,
): Promise<PublicService[]> {
  const { data, error } = await supabase
    .from("services")
    .select(
      "slug, name, description, pricing_type, pricing_config, concurrency, default_duration_min, max_pets",
    )
    .eq("active", true)
    // Meet-and-greet is scheduled only within onboarding, not public services.
    .neq("pricing_type", "meet_greet")
    .order("sort_order");

  if (error) {
    console.error("listActiveServices: query failed", error);
    return [];
  }
  if (!data) return [];

  const results: PublicService[] = [];

  for (const row of data) {
    let pricingConfig: ServicePricingConfig;
    try {
      pricingConfig = parsePricingConfig(row.pricing_config);
    } catch (parseError) {
      // Skip rows with invalid pricing_config — don't crash the page. Log the
      // slug: a mis-configured service vanishing from /services is otherwise
      // indistinguishable from one Cal deactivated on purpose.
      console.error(
        "listActiveServices: skipping service with unparseable pricing_config",
        row.slug,
        parseError,
      );
      continue;
    }

    results.push({
      slug: row.slug,
      name: row.name,
      description: row.description,
      pricingType: row.pricing_type,
      pricingConfig,
      concurrency: row.concurrency,
      default_duration_min: row.default_duration_min,
      max_pets: row.max_pets,
    });
  }

  return results;
}
