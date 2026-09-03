import { describe, it, expect, vi } from "vitest";

import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import type { Geocoder } from "@/features/pricing/geocoding/geocoder";
import { checkZipServiceArea } from "./service-area";

/** Boulder origin with the shipped defaults: 50 mi cutoff, straight-line gating. */
const SETTINGS = {
  origin_lat: 40.015,
  origin_lng: -105.27,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  road_factor: 1.3,
};

const NEARBY = { lat: 40.0274, lng: -105.2519 }; // Boulder, ~1 mi out
const FAR = { lat: 37.2753, lng: -107.8801 }; // Durango, ~180 mi out
const MIDDLING = { lat: 40.015, lng: -104.5 }; // due east, ~40 mi out

/** Resolves the three ZIPs the tests care about; everything else is unknown. */
const geocoder: Geocoder = {
  geocode: async (zip) =>
    ({ "80302": NEARBY, "81301": FAR, "80643": MIDDLING })[zip.trim()] ?? null,
};

function clientWith(settings: unknown, error: unknown = null) {
  return createFakeSupabase({
    tables: { settings: { data: settings, error } },
  });
}

describe("checkZipServiceArea", () => {
  it("accepts a ZIP inside the cutoff and hands back its coordinates", async () => {
    const result = await checkZipServiceArea(
      { client: clientWith(SETTINGS), geocoder },
      "80302",
    );

    expect(result).toEqual({ isInArea: true, latLng: NEARBY });
  });

  it("refuses a known ZIP beyond the cutoff", async () => {
    const result = await checkZipServiceArea(
      { client: clientWith(SETTINGS), geocoder },
      "81301",
    );

    expect(result.isInArea).toBe(false);
  });

  // The bundled dataset covers the region Cal drives, so a ZIP missing from it
  // is out of area rather than merely unmeasured — the case a distance-only
  // gate can never refuse, because there is no coordinate to measure.
  it("refuses a ZIP the geocoder cannot place", async () => {
    const result = await checkZipServiceArea(
      { client: clientWith(SETTINGS), geocoder },
      "99999",
    );

    expect(result).toEqual({ isInArea: false, latLng: null });
  });

  // Pins the reuse of the booking gate: road-mile scaling must apply here too,
  // or the two gates would disagree about the same address.
  it("applies the road-mile scaling when settings ask for it", async () => {
    const straightLine = await checkZipServiceArea(
      { client: clientWith(SETTINGS), geocoder },
      "80643",
    );
    const roadMiles = await checkZipServiceArea(
      {
        client: clientWith({ ...SETTINGS, gate_use_road_miles: true }),
        geocoder,
      },
      "80643",
    );

    expect(straightLine.isInArea).toBe(true);
    expect(roadMiles.isInArea).toBe(false);
  });

  it("accepts the ZIP when the settings row cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkZipServiceArea(
      {
        client: clientWith(null, { message: "settings unreadable" }),
        geocoder,
      },
      "81301",
    );

    expect(result).toEqual({ isInArea: true, latLng: FAR });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("accepts the ZIP when the settings row has an unexpected shape", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkZipServiceArea(
      { client: clientWith({ origin_lat: null }), geocoder },
      "81301",
    );

    expect(result.isInArea).toBe(true);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
