/**
 * The service-area gate for a saved address.
 *
 * Distance is gated at booking time, but that is too late to be useful and, on
 * its own, too weak: a ZIP outside the bundled dataset geocodes to null, which
 * every downstream reader treats as an unknown location — permanent manual
 * approval, never a refusal. So a client three states away can sign up, fill in
 * every form and wait for a meet-and-greet Cal was never going to accept.
 *
 * This gate closes both halves at the point the address is entered: it refuses
 * a ZIP past the configured cutoff AND a ZIP the geocoder cannot place at all.
 * Thresholds and origin come from the settings row Cal edits, so the radius is
 * his to tune; `settings` is readable by any authenticated session, so a
 * client's own save can run the check with its session client.
 */

import type { DbClient } from "@/lib/supabase/db-client";
import { z } from "zod";

import { haversineMiles, type LatLng } from "@/lib/haversine";
import { deriveApproval, type Geocoder } from "@/features/pricing";

/** Shown at the ZIP field when the gate refuses an address. */
export const OUTSIDE_SERVICE_AREA_MESSAGE =
  "That address is outside Cal's service area.";

/**
 * The settings this gate reads — the same inputs the booking-time gate uses.
 *
 * A narrow local copy of the columns, not a slice of admin's whole-row schema,
 * matching what booking and notifications already do: a feature may not import
 * another feature's internals, and reaching admin's public barrel from here
 * would put the two features in a runtime import cycle.
 */
const serviceAreaSettingsSchema = z.object({
  origin_lat: z.number(),
  origin_lng: z.number(),
  auto_approve_threshold_miles: z.number(),
  hard_cutoff_miles: z.number(),
  gate_use_road_miles: z.boolean(),
  road_factor: z.number(),
});

/** Derived from the schema that parses the result, so the two cannot drift. */
const SERVICE_AREA_COLUMNS = Object.keys(serviceAreaSettingsSchema.shape).join(
  ", ",
);

export interface ServiceAreaDeps {
  /** Any client that can read `settings` — every authenticated session can. */
  client: DbClient;
  geocoder: Geocoder;
}

export interface ServiceAreaCheck {
  /** False when the ZIP is past the cutoff, or cannot be placed at all. */
  isInArea: boolean;
  /**
   * What the ZIP resolved to. Callers that persist coordinates use this rather
   * than geocoding a second time, so the stored value is the one that was gated.
   */
  latLng: LatLng | null;
}

/**
 * Reads the gate's settings, or null when they cannot be trusted.
 *
 * A read or shape failure is logged rather than thrown: callers turn a null
 * into an accepted address, and the reasoning for that lives at the call site
 * in {@link checkZipServiceArea}.
 */
async function readServiceAreaSettings(
  client: DbClient,
): Promise<z.output<typeof serviceAreaSettingsSchema> | null> {
  const { data, error } = await client
    .from("settings")
    .select(SERVICE_AREA_COLUMNS)
    .limit(1)
    .single();

  // `.single()` returns either a row or an error, so one failed parse covers
  // both — but the two are logged apart, because a drifted schema and an
  // unreachable database want very different fixes.
  if (error) {
    console.error("checkZipServiceArea: reading the settings failed", error);
    return null;
  }

  const parsed = serviceAreaSettingsSchema.safeParse(data);
  if (!parsed.success) {
    console.error(
      "checkZipServiceArea: settings row has an unexpected shape",
      parsed.error.issues,
    );
    return null;
  }

  return parsed.data;
}

/**
 * Decides whether an address in `zip` is one Cal serves, and returns the single
 * geocode the decision was made on.
 *
 * A geocoder failure propagates — each caller already has a policy for one.
 */
export async function checkZipServiceArea(
  deps: ServiceAreaDeps,
  zip: string,
): Promise<ServiceAreaCheck> {
  const latLng = await deps.geocoder.geocode(zip);
  const settings = await readServiceAreaSettings(deps.client);

  // Without thresholds there is no gate. Accepting is the right failure mode:
  // this is a business rule, not a security boundary, and refusing every
  // address because one config read blipped would break signup outright.
  if (!settings) return { isInArea: true, latLng };

  // An unplaceable ZIP is out of area, not merely unmeasured. The bundled
  // dataset covers the region Cal drives, so a ZIP missing from it is somewhere
  // he does not — and distance alone can never refuse it, for want of a
  // coordinate to measure.
  if (!latLng) return { isInArea: false, latLng: null };

  const miles = haversineMiles(
    { lat: settings.origin_lat, lng: settings.origin_lng },
    latLng,
  );
  const decision = deriveApproval(miles, {
    autoApproveMiles: settings.auto_approve_threshold_miles,
    hardCutoffMiles: settings.hard_cutoff_miles,
    useRoadMiles: settings.gate_use_road_miles,
    roadFactor: settings.road_factor,
  });

  return { isInArea: decision !== "refuse", latLng };
}
