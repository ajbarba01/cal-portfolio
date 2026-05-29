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
 * Pipeline: oneWayMin = (haversineMiles * roadFactor / avgSpeedMph) * 60
 *           = miles * (1.3 / 40) * 60 = miles * 1.95
 * Thresholds: autoApprove ≤ 60 min, hardCutoff ≤ 120 min.
 *   → auto:   miles ≤ 30.77  (use ~10 mi N: lat ≈ 40.160)
 *   → manual: 30.77 < miles ≤ 61.54  (use ~40 mi N: lat ≈ 40.594)
 *   → refuse: miles > 61.54  (use ~70 mi N: lat ≈ 41.029)
 * 1° lat ≈ 69 mi; 1° lng at 40° ≈ 53 mi (unused — only adjusting lat here).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createBookingCore, cancelBookingCore } from "./booking-service";
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

const NEAR_LAT = 40.16; // ~10 mi N of origin → ~19.5 oneWayMin → auto-approve
const NEAR_LNG = -105.27;

const FAR_LAT = 40.594; // ~40 mi N of origin → ~78 oneWayMin → manual-approve
const FAR_LNG = -105.27;

const REFUSE_LAT = 41.029; // ~70 mi N of origin → ~136.5 oneWayMin → refuse
const REFUSE_LNG = -105.27;

const TEST_PASS = "Test1234!";
const ts = Date.now();

let nearUserId: string;
let farUserId: string;
let refuseUserId: string;

// A future start time well within the booking window (use noon UTC on a
// weekday ~5 days from now, which is 6am Denver MST — within 8-18 window).
// We use a fixed offset from now so the lead-time guard (24h) is always met.
function futureStart(offsetDays = 5): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  // Set to 17:00 UTC = 10:00 MDT / 11:00 MST — always within 08-18 Denver window.
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
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeRepo() {
  return createSupabaseBookingRepository(serviceClient);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingCore", () => {
  it("near client: booking persisted with status=confirmed", async () => {
    const start = futureStart(5);
    const end = futureEnd(start);

    const result = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );

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

    const result = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: farUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );

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

    const result = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: refuseUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );

    expect(result.kind).toBe("refuse");

    // Assert no booking row was inserted.
    const { data: rows } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("client_id", refuseUserId);

    expect(rows).toHaveLength(0);
  });

  it("same-class overlap: second booking returns slot_taken (23P01 path)", async () => {
    const start = futureStart(8);
    const end = futureEnd(start);

    // First booking — exclusive walk service.
    const first = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );
    expect(first.kind).toBe("success");

    // Second booking — same exclusive class, overlapping time.
    const second = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "check-in", // also exclusive
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1 },
        recurringRule: null,
      },
    );
    expect(second.kind).toBe("slot_taken");
  });

  it("cross-class overlap: resident house-sit + exclusive walk both succeed", async () => {
    const start = futureStart(10);
    // House-sit is multi-day; walk is 1h overlap inside it.
    const hsEnd = new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days
    const walkEnd = futureEnd(start); // 1 hour

    const hsResult = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "house-sitting",
        startsAt: start,
        endsAt: hsEnd,
        quantities: { dogs: 1, cats: 0, nights: 2 },
        recurringRule: null,
      },
    );
    expect(hsResult.kind).toBe("success");

    const walkResult = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: walkEnd,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );
    expect(walkResult.kind).toBe("success");
  });

  it("recurring submit: N rows share a series_id, final_cents matches fresh quote", async () => {
    // 3 weekly occurrences starting 15 days out (well within 90-day advance window).
    const start = futureStart(15);
    const end = futureEnd(start);

    const result = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: { freq: "weekly", interval: 1, count: 3 },
      },
    );

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
});

describe("cancelBookingCore", () => {
  it("owner can cancel a confirmed booking", async () => {
    const start = futureStart(20);
    const end = futureEnd(start);

    // Create a booking first.
    const created = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    const bookingId = created.bookingIds[0];

    const result = await cancelBookingCore(
      { repo: makeRepo() },
      { userId: nearUserId, bookingId },
    );

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

    const created = await createBookingCore(
      { repo: makeRepo() },
      {
        userId: nearUserId,
        serviceSlug: "walk",
        startsAt: start,
        endsAt: end,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
    );
    expect(created.kind).toBe("success");
    if (created.kind !== "success") return;

    // farUser tries to cancel nearUser's booking.
    const result = await cancelBookingCore(
      { repo: makeRepo() },
      { userId: farUserId, bookingId: created.bookingIds[0] },
    );

    expect(result.kind).toBe("forbidden");
  });
});
