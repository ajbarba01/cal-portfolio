/**
 * Thin IO layer for reading active services via a session/anon client.
 * Used by the public /services page (SSR, anon-readable via RLS).
 *
 * pricing_config is parsed/validated via Zod schemas before returning.
 * Rows with unparseable config are skipped (logged, not thrown).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePricingConfig } from "@/features/pricing";
import type {
  PricingType,
  HouseSittingConfig,
  CheckInConfig,
  WalkConfig,
  TrainingConfig,
  MeetGreetConfig,
} from "@/features/pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServicePricingConfig =
  | { pricingType: "house_sitting"; pricingConfig: HouseSittingConfig }
  | { pricingType: "check_in"; pricingConfig: CheckInConfig }
  | { pricingType: "walk"; pricingConfig: WalkConfig }
  | { pricingType: "training"; pricingConfig: TrainingConfig }
  | { pricingType: "meet_greet"; pricingConfig: MeetGreetConfig };

export type PublicService = {
  slug: string;
  name: string;
  description: string | null;
  concurrency: "exclusive" | "resident";
  default_duration_min: number | null;
  max_pets: number | null;
} & ServicePricingConfig;

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

/**
 * Returns active services ordered by sort_order.
 * Rows whose pricing_config fails Zod validation are silently skipped.
 * Anon-readable via RLS ("services: public can read").
 */
export async function listActiveServices(
  supabase: SupabaseClient,
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

  if (error || !data) return [];

  const results: PublicService[] = [];

  for (const row of data) {
    const pricingType = row.pricing_type as PricingType;

    let pricingConfig: ServicePricingConfig["pricingConfig"];
    try {
      pricingConfig = parsePricingConfig(pricingType, row.pricing_config);
    } catch {
      // Skip rows with invalid pricing_config — don't crash the page.
      continue;
    }

    results.push({
      slug: row.slug as string,
      name: row.name as string,
      description: typeof row.description === "string" ? row.description : null,
      pricingType,
      pricingConfig,
      concurrency: row.concurrency as "exclusive" | "resident",
      default_duration_min:
        typeof row.default_duration_min === "number"
          ? row.default_duration_min
          : null,
      max_pets: typeof row.max_pets === "number" ? row.max_pets : null,
    } as PublicService);
  }

  return results;
}
