/**
 * Integration tests for createBookingCore / cancelBookingCore.
 *
 * Uses dependency injection: tests call the core functions directly, passing
 * a service-role client and pre-created test user IDs. This decouples the
 * tests from Next.js server-action machinery (headers, cookies, redirects)
 * while still hitting the real DB schema, RLS, and the exclusion constraint.
 *
 * Prerequisites: local Supabase stack running (`npx supabase start`).
 * Credentials loaded from .env.test (gitignored).
 *
 * --- COORDINATE MATH (documented for reproducibility) ---
 * Origin: lat=40.015, lng=-105.27 (Boulder, from seed settings)
 * The approval gate reasons in straight-line miles (seed thresholds:
 * auto ≤ 8 mi, refuse > 50 mi). Driving minutes (road_factor 1.3 / 40 mph)
 * now feed only the travel-cost line, not the gate.
 *   → auto:   miles ≤ 8        (use ~5 mi N: lat ≈ 40.087)
 *   → manual: 8 < miles ≤ 50   (use ~40 mi N: lat ≈ 40.594)
 *   → refuse: miles > 50       (use ~70 mi N: lat ≈ 41.029)
 * 1° lat ≈ 69 mi; only latitude is adjusted here (lng fixed at origin).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createBookingCore,
  cancelBookingCore,
  computeBookingQuoteCore,
} from "./booking-service";
import { createSupabaseBookingRepository } from "./booking-repository";
import { quote } from "@/features/pricing/quote";
import type { WalkConfig } from "@/features/pricing/types";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS, used for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const NEAR_LAT = 40.087; // ~5 mi N of origin → under 8 mi auto threshold
const NEAR_LNG = -105.27;

const FAR_LAT = 40.594; // ~40 mi N of origin → 8–50 mi band → manual-approve
const FAR_LNG = -105.27;

const REFUSE_LAT = 41.029; // ~70 mi N of origin → beyond 50 mi → refuse
const REFUSE_LNG = -105.27;

const TEST_PASS = "Test1234!";
const ts = Date.now();

let nearUserId: string;
let farUserId: string;
let refuseUserId: string;
let coveringWindowId: string;

// A future start time well within the booking window. We offset a fixed number
// of days from now so the lead-time guard (24h) is always met, and pin the
// clock to 17:00 UTC = 11:00 MDT / 10:00 MST — always within the 08-18 Denver
// open-hours window enforced by passesGuards.
function futureStart(offsetDays = 5): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(17, 0, 0, 0);
  return d;
}

function futureEnd(start: Date, durationMs = 60 * 60 * 1000): Date {
  return new Date(start.getTime() + durationMs);
}

async function createTestUser(
  email: string,
  lat: number,
  lng: number,
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }
  const userId = data.user.id;
  // Set lat/lng on the profile (the trigger creates the row without coordinates).
  const { error: profileErr } = await serviceClient
    .from("profiles")
    .update({ lat, lng })
    .eq("id", userId);
  if (profileErr) {
    throw new Error(`Failed to set profile lat/lng: ${profileErr.message}`);
  }
  return userId;
}

beforeAll(async () => {
  // Create three users at different distances from origin.
  [nearUserId, farUserId, refuseUserId] = await Promise.all([
    createTestUser(
      `test-booking-near-${ts}@example.invalid`,
      NEAR_LAT,
      NEAR_LNG,
    ),
    createTestUser(`test-booking-far-${ts}@example.invalid`, FAR_LAT, FAR_LNG),
    createTestUser(
      `test-booking-refuse-${ts}@example.invalid`,
      REFUSE_LAT,
      REFUSE_LNG,
    ),
  ]);

  // Verify seeded services exist (used via slug in createBookingCore).
  const { data: services, error } = await serviceClient
    .from("services")
    .select("slug")
    .in("slug", ["walk", "house-sitting", "check-in"]);
  if (error || !services || services.length < 3) {
    throw new Error(
      `Seeded services not found: ${error?.message ?? "missing rows"}`,
    );
  }

  // Insert a wide availability window covering all test booking times.
  // futureStart(offsetDays) at 17:00 UTC; tests use offsets 5–100.
  // Window: now+1d .. now+95d (wider than max offset=90, narrower than 100d
  // so the "max advance" test still returns unavailable before fitsWindow runs).
  const windowStart = new Date();
  windowStart.setUTCDate(windowStart.getUTCDate() + 1);
  windowStart.setUTCHours(0, 0, 0, 0);

  const windowEnd = new Date();
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 95);
  windowEnd.setUTCHours(23, 59, 59, 999);

  const { data: windowData, error: windowErr } = await serviceClient
    .from("availability_windows")
    .insert({
      starts_at: windowStart.toISOString(),
      ends_at: windowEnd.toISOString(),
    })
    .select("id")
    .single();

  if (windowErr || !windowData) {
    throw new Error(
      `Failed to insert covering availability window: ${windowErr?.message ?? "no data"}`,
    );
  }
  coveringWindowId = windowData.id as string;
});

afterAll(async () => {
  // Delete bookings first (FK bookings.client_id → profiles cascade restrict,
  // so delete bookings then users; admin.deleteUser cascades auth → profiles).
  await serviceClient
    .from("bookings")
    .delete()
    .in("client_id", [nearUserId, farUserId, refuseUserId].filter(Boolean));

  await Promise.all(
    [nearUserId, farUserId, refuseUserId]
      .filter(Boolean)
      .map((id) => serviceClient.auth.admin.deleteUser(id)),
  );

  // Clean up the covering availability window.
  if (coveringWindowId) {
    await serviceClient
      .from("availability_windows")
      .delete()
      .eq("id", coveringWindowId);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeRepo() {
  return createSupabaseBookingRepository(serviceClient);
}

/**
 * Build the injected deps for a core call. `now` is supplied here (the core is
 * pure — it never reads the clock itself). Fresh `new Date()` per call keeps it
 * consistent with the futureStart offsets computed from the same wall clock.
 */
function deps() {
  return { repo: makeRepo(), now: new Date() };
}

/** Count persisted bookings for a client (used to assert no-row on rejection). */
async function countRows(clientId: string): Promise<number> {
  const { data } = await serviceClient
    .from("bookings")
    .select("id")
    .eq("client_id", clientId);
  return data?.length ?? 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingCore", () => {
  it("near client: booking persisted with status=confirmed", async () => {
    const start = futureStart(5);
    const end = futureEnd(start);

    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // Verify persisted row.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select(
        "status, requires_approval, distance_miles, final_cents, client_id",
      )
      .eq("id", result.bookingIds[0])
      .single();

    expect(booking?.status).toBe("confirmed");
    expect(booking?.requires_approval).toBe(false);
    expect(booking?.distance_miles).toBeGreaterThan(0);
    expect(booking?.final_cents).toBeGreaterThan(0);
    expect(booking?.client_id).toBe(nearUserId);
  });

  it("far client: booking persisted with status=pending_approval", async () => {
    const start = futureStart(6);
    const end = futureEnd(start);

    const result = await createBookingCore(deps(), {
      userId: farUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("status, requires_approval")
      .eq("id", result.bookingIds[0])
      .single();

    expect(booking?.status).toBe("pending_approval");
    expect(booking?.requires_approval).toBe(true);
  });

  it("over hard cutoff: rejected, no booking row inserted", async () => {
    const start = futureStart(7);
    const end = futureEnd(start);

    const result = await createBookingCore(deps(), {
      userId: refuseUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("refuse");

    // Assert no booking row was inserted.
    const { data: rows } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("client_id", refuseUserId);

    expect(rows).toHaveLength(0);
  });

  it("overlapping exclusive bookings (different services, same concurrency class): second returns slot_taken (23P01), no second row persisted", async () => {
    // Both `walk` and `check-in` are concurrency='exclusive'. The exclusion
    // constraint keys on the concurrency class, so an overlapping pair conflicts
    // even though they are different services.
    const start = futureStart(8);
    const end = futureEnd(start);

    // First booking — exclusive walk service.
    const first = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(first.kind).toBe("success");

    // Second booking — same exclusive class, overlapping time → rejected by constraint.
    const second = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "check-in", // also exclusive
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1 },
      recurringRule: null,
    });
    expect(second.kind).toBe("slot_taken");

    // Exactly one row persisted at this start time (the second insert produced none).
    const { data: rows } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("client_id", nearUserId)
      .eq("starts_at", start.toISOString());
    expect(rows).toHaveLength(1);
  });

  it("cross-class overlap: resident house-sit + exclusive walk both succeed", async () => {
    const start = futureStart(10);
    // House-sit is multi-day; walk is 1h overlap inside it.
    const hsEnd = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days
    const walkEnd = futureEnd(start); // 1 hour

    const hsResult = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "house-sitting",
      startsAt: start,
      endsAt: hsEnd,
      quantities: { dogs: 1, cats: 0, nights: 2 },
      recurringRule: null,
    });
    expect(hsResult.kind).toBe("success");

    const walkResult = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: walkEnd,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(walkResult.kind).toBe("success");
  });

  it("recurring submit: N rows share a series_id, final_cents matches fresh quote", async () => {
    // 3 weekly occurrences starting 15 days out (well within 90-day advance window).
    const start = futureStart(15);
    const end = futureEnd(start);

    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: { freq: "weekly", interval: 1, count: 3 },
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    // Should have inserted 3 rows.
    expect(result.bookingIds).toHaveLength(3);

    // All share the same series_id.
    const { data: rows } = await serviceClient
      .from("bookings")
      .select("series_id, final_cents, quote_inputs, service_id")
      .in("id", result.bookingIds);

    const seriesIds = new Set(rows?.map((r) => r.series_id));
    expect(seriesIds.size).toBe(1);
    expect([...seriesIds][0]).not.toBeNull();

    // final_cents matches a fresh quote with the same inputs.
    // Walk service config from seed: rate_cents_per_hour=2500, per_dog_cents=1000.
    const freshQuote = quote({
      pricingType: "walk",
      pricingConfig: {
        rate_cents_per_hour: 2500,
        per_dog_cents: 1000,
        kiche_discount_pct: 25,
      } satisfies WalkConfig,
      hours: 1,
      dogs: 1,
      recurringDiscountApplies: true, // 3 occurrences ≥ min 3
      recurringDiscountPct: 10,
      applyKiche: false,
      // Near client: roundTrip is non-zero (travel applies for walk).
      // We don't need exact cents match — just verify it's reasonable.
      roundTripDriveMinutes:
        rows?.[0]?.quote_inputs?.roundTripDriveMinutes ?? 0,
    });

    // Every row should have the same final_cents, matching the fresh quote.
    rows?.forEach((r) => {
      expect(r.final_cents).toBe(freshQuote.finalCents);
    });
  });
  it("invalid quantities (negative hours): validation_error, no row inserted", async () => {
    const start = futureStart(40);
    const end = futureEnd(start);

    const before = await countRows(nearUserId);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: -1, dogs: 1 }, // negative → rejected before quoting
      recurringRule: null,
    });

    expect(result.kind).toBe("validation_error");
    // Quantities are validated before any insert, so the row count is unchanged.
    expect(await countRows(nearUserId)).toBe(before);
  });

  it("non-numeric quantity: validation_error, no row inserted", async () => {
    const start = futureStart(41);
    const end = futureEnd(start);

    const before = await countRows(nearUserId);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: "two", dogs: 1 }, // string slips past Record<string, unknown>; caught by parseQuantities

      recurringRule: null,
    });

    expect(result.kind).toBe("validation_error");
    expect(await countRows(nearUserId)).toBe(before);
  });

  it("guard: start outside Denver open hours → unavailable, no row", async () => {
    // 11:00 UTC = 05:00 Denver (MDT or MST) — before the 6:30am open minute.
    const start = futureStart(42);
    start.setUTCHours(11, 0, 0, 0);
    const end = futureEnd(start);

    const before = await countRows(nearUserId);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("unavailable");
    expect(await countRows(nearUserId)).toBe(before);
  });

  it("guard: start before the min lead time → unavailable, no row", async () => {
    // 2 hours from now — well under the 24h min_lead_time_hours.
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = futureEnd(start);

    const before = await countRows(nearUserId);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("unavailable");
    expect(await countRows(nearUserId)).toBe(before);
  });

  it("guard: start beyond max advance days → unavailable, no row", async () => {
    // 100 days out, exceeding the 90-day max_advance_days (still within open hours).
    const start = futureStart(100);
    const end = futureEnd(start);

    const before = await countRows(nearUserId);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("unavailable");
    expect(await countRows(nearUserId)).toBe(before);
  });
});

describe("cancelBookingCore", () => {
  it("owner can cancel a confirmed booking", async () => {
    const start = futureStart(20);
    const end = futureEnd(start);

    // Create a booking first.
    const created = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const bookingId = created.bookingIds[0];

    const result = await cancelBookingCore(deps(), {
      userId: nearUserId,
      bookingId,
    });

    expect(result.kind).toBe("success");

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();

    expect(booking?.status).toBe("cancelled");
  });

  it("non-owner cannot cancel another user's booking", async () => {
    const start = futureStart(25);
    const end = futureEnd(start);

    const created = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    // farUser tries to cancel nearUser's booking.
    const result = await cancelBookingCore(deps(), {
      userId: farUserId,
      bookingId: created.bookingIds[0],
    });

    expect(result.kind).toBe("forbidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// computeBookingQuoteCore
// ──────────────────────────────────────────────────────────────────────────────

describe("computeBookingQuoteCore", () => {
  it("preview breakdown matches persisted quote_breakdown for same input", async () => {
    // Create a booking and compare its persisted quote_breakdown to the preview.
    // This is the key guarantee: preview === what createBookingCore persists.
    const start = futureStart(55);
    const end = futureEnd(start);

    const input = {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    };

    // Preview first.
    const previewResult = await computeBookingQuoteCore(deps(), input);
    expect(previewResult.kind).toBe("success");
    if (previewResult.kind !== "success") return;

    // Create (persists the booking).
    const createResult = await createBookingCore(deps(), input);
    expect(createResult.kind).toBe("success");
    if (createResult.kind !== "success") return;

    // Read the persisted quote_breakdown.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("quote_breakdown, final_cents")
      .eq("id", createResult.bookingIds[0])
      .single();

    expect(booking).toBeTruthy();
    // The persisted breakdown must equal the preview breakdown (single source of truth).
    expect(booking?.quote_breakdown).toEqual(previewResult.preview.breakdown);
    expect(booking?.final_cents).toBe(previewResult.preview.finalCents);
  });

  it("refuse client returns refuse from preview (no DB required)", async () => {
    const start = futureStart(56);
    const end = futureEnd(start);

    const result = await computeBookingQuoteCore(deps(), {
      userId: refuseUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("refuse");
  });

  it("preview does NOT enforce fitsWindow (returns success even outside any window)", async () => {
    // Use offset=100 which exceeds max_advance_days (90) → passesGuards fails.
    // But computeBookingQuoteCore does NOT enforce guards or fitsWindow — it
    // should still return a price (kind=success) regardless.
    const start = futureStart(100);
    const end = futureEnd(start);

    const result = await computeBookingQuoteCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    // Preview always succeeds for a near client regardless of guard/window state.
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.preview.finalCents).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// fitsWindow enforcement
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingCore — fitsWindow enforcement", () => {
  it("booking inside covering window → success", async () => {
    // The covering window spans now+1d .. now+95d; offset=57 is inside.
    const start = futureStart(57);
    const end = futureEnd(start);

    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: end,
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });

    expect(result.kind).toBe("success");
  });

  it("booking outside all windows → unavailable, no row inserted", async () => {
    // Delete the covering window temporarily and insert a narrow past window,
    // then verify the booking is rejected.
    // Strategy: insert a separate narrow future window that does NOT cover the
    // test booking time, then test with a time outside it.

    // Insert a narrow window 2h wide starting 60 days out at 10:00 UTC.
    const narrowStart = new Date();
    narrowStart.setUTCDate(narrowStart.getUTCDate() + 60);
    narrowStart.setUTCHours(10, 0, 0, 0);
    const narrowEnd = new Date(narrowStart.getTime() + 2 * 60 * 60 * 1000); // +2h

    const { data: narrowWin, error: narrowErr } = await serviceClient
      .from("availability_windows")
      .insert({
        starts_at: narrowStart.toISOString(),
        ends_at: narrowEnd.toISOString(),
      })
      .select("id")
      .single();

    if (narrowErr || !narrowWin) {
      throw new Error(
        `Failed to insert narrow window: ${narrowErr?.message ?? "no data"}`,
      );
    }
    const narrowWinId = narrowWin.id as string;

    try {
      // Delete the wide covering window so only the narrow one exists.
      await serviceClient
        .from("availability_windows")
        .delete()
        .eq("id", coveringWindowId);

      // Booking at offset=58 (17:00 UTC) is OUTSIDE the narrow window (10:00–12:00 UTC at day+60).
      const start = futureStart(58); // day+58 at 17:00 UTC → not inside day+60 narrow window
      const end = futureEnd(start);

      const before = await countRows(nearUserId);
      const result = await createBookingCore(deps(), {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      });

      expect(result.kind).toBe("unavailable");
      expect(await countRows(nearUserId)).toBe(before);
    } finally {
      // Restore the covering window so subsequent tests pass.
      const windowStart = new Date();
      windowStart.setUTCDate(windowStart.getUTCDate() + 1);
      windowStart.setUTCHours(0, 0, 0, 0);
      const windowEnd = new Date();
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 95);
      windowEnd.setUTCHours(23, 59, 59, 999);

      const { data: restored, error: restoreErr } = await serviceClient
        .from("availability_windows")
        .insert({
          starts_at: windowStart.toISOString(),
          ends_at: windowEnd.toISOString(),
        })
        .select("id")
        .single();

      if (restoreErr || !restored) {
        throw new Error(
          `Failed to restore covering window: ${restoreErr?.message ?? "no data"}`,
        );
      }
      // Update the module-level id so afterAll cleans up the right row.
      coveringWindowId = restored.id as string;

      // Clean up the narrow window.
      await serviceClient
        .from("availability_windows")
        .delete()
        .eq("id", narrowWinId);
    }
  });
});
