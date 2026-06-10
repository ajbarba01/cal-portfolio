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

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createBookingCore,
  cancelBookingCore,
  computeBookingQuoteCore,
  markNoShowCore,
  settleDebtCore,
  previewEditCore,
  editBookingCore,
} from "./booking-service";
import type { CreateBookingInput } from "./booking-service";
import { createSupabaseBookingRepository } from "./booking-repository";
import type {
  OnboardingStatus,
  BookingRepository,
  BookingEditRow,
} from "./booking-repository";
import { quote } from "@/features/pricing/quote";
import type { WalkConfig } from "@/features/pricing/types";
import { ADMIN_POLICY, CLIENT_POLICY } from "./mutation-policy";

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
let debtorUserId: string;
let noShowUserId: string;
let meetGreetPendingUserId: string;
let infoPendingUserId: string;
let declinedUserId: string;
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
  // Set lat/lng and onboarding_status on the profile (the trigger creates the
  // row with onboarding_status='info_pending'; override to 'approved' so existing
  // booking tests represent already-onboarded clients and pass the gate).
  const { error: profileErr } = await serviceClient
    .from("profiles")
    .update({ lat, lng, onboarding_status: "approved" })
    .eq("id", userId);
  if (profileErr) {
    throw new Error(`Failed to set profile lat/lng: ${profileErr.message}`);
  }
  return userId;
}

beforeAll(async () => {
  // Create users at different distances from origin (+ dedicated debt/no-show
  // users so cancellation debits never block the shared near/far users).
  [nearUserId, farUserId, refuseUserId, debtorUserId, noShowUserId] =
    await Promise.all([
      createTestUser(
        `test-booking-near-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
      createTestUser(
        `test-booking-far-${ts}@example.invalid`,
        FAR_LAT,
        FAR_LNG,
      ),
      createTestUser(
        `test-booking-refuse-${ts}@example.invalid`,
        REFUSE_LAT,
        REFUSE_LNG,
      ),
      createTestUser(
        `test-booking-debtor-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
      createTestUser(
        `test-booking-noshow-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
    ]);

  // Create onboarding-gate test users (NEAR coords so distance never refuses).
  // createTestUser sets onboarding_status='approved'; override to the desired
  // statuses via setOnboarding so the gate tests exercise non-approved paths.
  [meetGreetPendingUserId, infoPendingUserId, declinedUserId] =
    await Promise.all([
      createTestUser(
        `test-booking-mgpending-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
      createTestUser(
        `test-booking-infopending-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
      createTestUser(
        `test-booking-declined-${ts}@example.invalid`,
        NEAR_LAT,
        NEAR_LNG,
      ),
    ]);
  await Promise.all([
    setOnboarding(meetGreetPendingUserId, "meet_greet_pending"),
    setOnboarding(infoPendingUserId, "info_pending"),
    setOnboarding(declinedUserId, "declined"),
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
  const allUserIds = [
    nearUserId,
    farUserId,
    refuseUserId,
    debtorUserId,
    noShowUserId,
    meetGreetPendingUserId,
    infoPendingUserId,
    declinedUserId,
  ].filter(Boolean);

  await serviceClient.from("bookings").delete().in("client_id", allUserIds);

  // Deleting the auth user cascades profiles → client_debits, but delete
  // explicitly too in case a booking FK held a debit row.
  await serviceClient
    .from("client_debits")
    .delete()
    .in("client_id", allUserIds);

  await Promise.all(
    allUserIds.map((id) => serviceClient.auth.admin.deleteUser(id)),
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

/** Records refund calls so cancellation tests can assert on them without Stripe. */
class FakeGateway {
  refunds: Array<{ paymentIntentId: string; amountCents: number }> = [];
  async createIntent() {
    return { paymentIntentId: "pi_fake", clientSecret: "pi_fake_secret" };
  }
  async refund(paymentIntentId: string, amountCents: number): Promise<void> {
    this.refunds.push({ paymentIntentId, amountCents });
  }
}

/** Cancel/admin deps: adds a fake gateway to the standard deps. */
function cancelDeps(gateway: FakeGateway = new FakeGateway()) {
  return { repo: makeRepo(), now: new Date(), gateway };
}

/** Count persisted bookings for a client (used to assert no-row on rejection). */
async function countRows(clientId: string): Promise<number> {
  const { data } = await serviceClient
    .from("bookings")
    .select("id")
    .eq("client_id", clientId);
  return data?.length ?? 0;
}

/** Override a profile's onboarding_status for gate tests. */
async function setOnboarding(
  userId: string,
  status: OnboardingStatus,
): Promise<void> {
  const { error } = await serviceClient
    .from("profiles")
    .update({ onboarding_status: status })
    .eq("id", userId);
  if (error)
    throw new Error(`Failed to set onboarding_status: ${error.message}`);
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

  it("near client beyond the auto-confirm horizon → pending_approval (not refused)", async () => {
    // 45 days out: past the 30-day soft horizon, inside the 365-day hard cap and
    // the covering availability window → created pending_approval.
    const start = futureStart(45);
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

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("status, requires_approval")
      .eq("id", result.bookingIds[0])
      .single();

    expect(booking?.status).toBe("pending_approval");
    expect(booking?.requires_approval).toBe(true);
  });

  it("guard: start beyond hard max advance → refused, no row", async () => {
    // 400 days out, beyond the 365-day hard_max_advance_days → time gate refuses.
    const start = futureStart(400);
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

    expect(result.kind).toBe("refuse");
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

    const result = await cancelBookingCore(cancelDeps(), {
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
    const result = await cancelBookingCore(cancelDeps(), {
      userId: farUserId,
      bookingId: created.bookingIds[0],
    });

    expect(result.kind).toBe("forbidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Cancellation / refund policy + debt gate + no-show
// ──────────────────────────────────────────────────────────────────────────────

/** Insert a booking row directly (controls timing/paid-state without guards). */
async function insertBookingRow(opts: {
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  finalCents: number;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: opts.clientId,
      service_id: (
        await serviceClient
          .from("services")
          .select("id")
          .eq("slug", "walk")
          .single()
      ).data!.id,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      status: opts.status,
      concurrency: "exclusive",
      distance_miles: 5,
      requires_approval: false,
      final_cents: opts.finalCents,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`insertBookingRow failed: ${error?.message}`);
  return data.id as string;
}

describe("cancellation + debt gate", () => {
  it("unpaid late cancel writes a debit, blocks the next booking, and settleDebt clears it", async () => {
    // Place the booking ~200 days out (a slot no guard-bound suite ever books —
    // direct insert + cancel ignore guards), then inject a `now` 30h before its
    // start so the cancel reads as inside the 48h cutoff. (The cutoff math uses
    // the injected now, not the wall clock.)
    const start = futureStart(200);
    start.setUTCMinutes(37, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const cancelNow = new Date(start.getTime() - 30 * 60 * 60 * 1000); // 30h before → late

    const bookingId = await insertBookingRow({
      clientId: debtorUserId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      finalCents: 2500,
    });

    // Unpaid cancel inside the cutoff → no refund, writes a late_cancel debit.
    const gateway = new FakeGateway();
    const cancelResult = await cancelBookingCore(
      { repo: makeRepo(), now: cancelNow, gateway },
      { userId: debtorUserId, bookingId },
    );
    expect(cancelResult.kind).toBe("success");
    expect(gateway.refunds).toHaveLength(0); // nothing paid → nothing refunded

    // Debit written for the forfeited 50% of $25.00 = $12.50.
    const repo = makeRepo();
    expect(await repo.getOutstandingDebtCents(debtorUserId)).toBe(1250);

    // Next booking is blocked by the debt gate (preview AND create).
    const blockStart = futureStart(13);
    blockStart.setUTCMinutes(37, 0, 0);
    const blocked = await createBookingCore(deps(), {
      userId: debtorUserId,
      serviceSlug: "walk",
      startsAt: blockStart,
      endsAt: futureEnd(blockStart),
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(blocked.kind).toBe("blocked_debt");
    if (blocked.kind === "blocked_debt") {
      expect(blocked.owedCents).toBe(1250);
    }

    // Settle the debit, then the gate clears.
    const { data: debit } = await serviceClient
      .from("client_debits")
      .select("id")
      .eq("client_id", debtorUserId)
      .is("settled_at", null)
      .single();
    const settle = await settleDebtCore(deps(), debit!.id as string);
    expect(settle.kind).toBe("success");

    expect(await repo.getOutstandingDebtCents(debtorUserId)).toBe(0);

    const afterSettle = await createBookingCore(deps(), {
      userId: debtorUserId,
      serviceSlug: "walk",
      startsAt: blockStart,
      endsAt: futureEnd(blockStart),
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(afterSettle.kind).not.toBe("blocked_debt");
  });

  it("markNoShow on a past confirmed booking writes a full-price debit", async () => {
    const now = new Date();
    // A confirmed booking far in the past (isolated slot — markNoShow ignores
    // time; this just avoids colliding with the completion-cron suite).
    const start = new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000);
    start.setUTCMinutes(43, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const bookingId = await insertBookingRow({
      clientId: noShowUserId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      finalCents: 3000,
    });

    const result = await markNoShowCore(deps(), bookingId);
    expect(result.kind).toBe("success");

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(booking?.status).toBe("no_show");

    // no_show_charge_pct defaults to 100% → owes the full $30.00.
    expect(await makeRepo().getOutstandingDebtCents(noShowUserId)).toBe(3000);
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
    // offset=100 is outside the covering availability window (now+95d) and past
    // the soft confirm horizon, but computeBookingQuoteCore does NOT enforce
    // guards/window — it should still return a price (kind=success).
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

// ──────────────────────────────────────────────────────────────────────────────
// Pet assignment (Phase 21): petIds derive server-trusted counts + link rows
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingCore: pet assignment", () => {
  let dog1: string;
  let dog2: string;
  let cat1: string;

  beforeAll(async () => {
    const { data, error } = await serviceClient
      .from("pets")
      .insert([
        { client_id: nearUserId, name: "Rex", species: "dog" },
        { client_id: nearUserId, name: "Fido", species: "dog" },
        { client_id: nearUserId, name: "Tom", species: "cat" },
      ])
      .select("id, species");
    if (error || !data)
      throw new Error(`pet fixture failed: ${error?.message}`);
    dog1 = data.find((p) => p.species === "dog")!.id as string;
    dog2 = data.filter((p) => p.species === "dog")[1].id as string;
    cat1 = data.find((p) => p.species === "cat")!.id as string;
  });

  it("walk: derives dog count from assigned pets and links booking_pets", async () => {
    const start = futureStart(11);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: futureEnd(start),
      // Client sends a WRONG count; server overrides from the 2 assigned dogs.
      quantities: { hours: 1, dogs: 99 },
      petIds: [dog1, dog2],
      recurringRule: null,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("quote_inputs")
      .eq("id", result.bookingIds[0])
      .single();
    expect((booking?.quote_inputs as { dogs: number }).dogs).toBe(2);

    const { data: links } = await serviceClient
      .from("booking_pets")
      .select("pet_id")
      .eq("booking_id", result.bookingIds[0]);
    expect(links).toHaveLength(2);
  });

  it("house-sitting: derives dogs+cats from assigned pets", async () => {
    const start = futureStart(12);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "house-sitting",
      startsAt: start,
      endsAt: futureEnd(start, 2 * 24 * 60 * 60 * 1000),
      quantities: { nights: 2 }, // dogs/cats omitted — derived from pets
      petIds: [dog1, cat1],
      recurringRule: null,
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;

    const { data: booking } = await serviceClient
      .from("bookings")
      .select("quote_inputs")
      .eq("id", result.bookingIds[0])
      .single();
    const qi = booking?.quote_inputs as { dogs: number; cats: number };
    expect(qi.dogs).toBe(1);
    expect(qi.cats).toBe(1);
  });

  it("rejects pet ids the caller does not own", async () => {
    const start = futureStart(13);
    const result = await createBookingCore(deps(), {
      userId: farUserId, // does NOT own nearUser's pets
      serviceSlug: "walk",
      startsAt: start,
      endsAt: futureEnd(start),
      quantities: { hours: 1, dogs: 1 },
      petIds: [dog1],
      recurringRule: null,
    });
    expect(result.kind).toBe("validation_error");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// computeBookingArtifacts — policy gates (unit tests, no DB)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock BookingRepository for policy-gate unit tests.
 * outstandingDebtCents controls the debt gate (default 0).
 */
function makeMockRepo(
  opts: { outstandingDebtCents?: number } = {},
): BookingRepository {
  return {
    getOutstandingDebtCents: vi.fn(async () => opts.outstandingDebtCents ?? 0),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in" as const,
      pricing_config: { rate_cents_per_hour: 3000, minimum_cents: 1500 },
      concurrency: "exclusive" as const,
      requires_approval: false,
    })),
    getSettings: vi.fn(async () => ({
      origin_lat: 40.015,
      origin_lng: -105.27,
      road_factor: 1.3,
      avg_speed_mph: 30,
      auto_approve_threshold_miles: 8,
      hard_cutoff_miles: 50,
      gate_use_road_miles: false,
      booking_open_minute: 0,
      booking_close_minute: 1440,
      min_lead_time_hours: 0,
      auto_confirm_horizon_days: 30,
      hard_max_advance_days: 365,
      recurrence_generation_horizon_days: 42,
      recurring_discount_pct: 10,
      recurring_min_occurrences: 3,
      cancellation_full_refund_hours: 48,
      late_cancel_refund_pct: 50,
      no_show_charge_pct: 100,
    })),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.087, lng: -105.27 })),
    getPetsByIds: vi.fn(async () => []),
    getOpenWindows: vi.fn(async () => []),
    insertBookings: vi.fn(async () => ["bk-1"]),
    insertBookingPets: vi.fn(async () => {}),
    insertSeries: vi.fn(async () => "series-1"),
    deleteSeries: vi.fn(async () => {}),
    // Stub remaining interface methods (not exercised by policy gate tests)
    getServiceById: vi.fn(),
    getBookingById: vi.fn(),
    updateBookingStatus: vi.fn(),
    getBookingTimes: vi.fn(),
    updateBookingTimes: vi.fn(),
    getActiveSeries: vi.fn(),
    getMaterializedOccurrenceStarts: vi.fn(),
    getBookingWithPayments: vi.fn(),
    insertDebit: vi.fn(),
    settleDebit: vi.fn(),
    getActiveBusyRangesEnriched: vi.fn(),
    getBookingForEdit: vi.fn(),
    updateBookingEdited: vi.fn(),
    swapBookingPets: vi.fn(),
    appendSeriesSkip: vi.fn(),
  } as unknown as BookingRepository;
}

/** A valid check-in input for the near-client mock profile. */
const MOCK_NOW = new Date("2026-06-10T12:00:00Z");
const mockValidInput: CreateBookingInput = {
  userId: "a0000000-0000-4000-8000-000000000001",
  serviceSlug: "check-in",
  startsAt: new Date("2026-06-20T17:00:00Z"),
  endsAt: new Date("2026-06-20T18:00:00Z"),
  quantities: { hours: 1 },
  recurringRule: null,
};

describe("computeBookingQuoteCore — policy gates", () => {
  it("ADMIN_POLICY: out-of-horizon occurrence requires approval (not auto-confirmed)", async () => {
    // Near client (lat=40.087 → under 8 mi auto threshold → baseRequiresApproval=false).
    // Start is NOW + 2 years → beyond hard_max_advance_days=365 → timeDecision="refuse".
    // skipHorizonRefuse=true (ADMIN_POLICY) → should warn + set requiresApproval=true.
    const repo = makeMockRepo();
    const farFutureStart = new Date(
      MOCK_NOW.getTime() + 2 * 365 * 24 * 60 * 60 * 1000,
    );
    const farFutureEnd = new Date(farFutureStart.getTime() + 60 * 60 * 1000);
    const input: CreateBookingInput = {
      userId: "a0000000-0000-4000-8000-000000000001",
      serviceSlug: "check-in",
      startsAt: farFutureStart,
      endsAt: farFutureEnd,
      quantities: { hours: 1 },
      recurringRule: null,
    };

    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      input,
      ADMIN_POLICY,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.preview.requiresApproval).toBe(true);
    expect(result.preview.warnings.join(" ")).toMatch(/beyond|limit/i);
  });

  it("blocks a debtor under CLIENT_POLICY", async () => {
    const repo = makeMockRepo({ outstandingDebtCents: 4000 });
    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      mockValidInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("blocked_debt");
  });

  it("warns (not blocks) a debtor under ADMIN_POLICY", async () => {
    const repo = makeMockRepo({ outstandingDebtCents: 4000 });
    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      mockValidInput,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.preview.warnings.join(" ")).toMatch(/owes/i);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Onboarding gate
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingCore: onboarding gate", () => {
  it("meet_greet_pending user booking walk → onboarding_incomplete", async () => {
    const start = futureStart(60);
    const result = await createBookingCore(deps(), {
      userId: meetGreetPendingUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: futureEnd(start),
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(result.kind).toBe("onboarding_incomplete");
  });

  it("meet_greet_pending: first meet-greet succeeds, second is blocked (one at a time)", async () => {
    // Self-contained: book one meet-greet (succeeds), then a second is blocked
    // by the one-at-a-time rule. No dependency on other tests' DB side-effects.
    const start1 = futureStart(61);
    const first = await createBookingCore(deps(), {
      userId: meetGreetPendingUserId,
      serviceSlug: "meet-greet",
      startsAt: start1,
      endsAt: futureEnd(start1),
      quantities: {},
      recurringRule: null,
    });
    expect(first.kind).toBe("success");

    const start2 = futureStart(62);
    const second = await createBookingCore(deps(), {
      userId: meetGreetPendingUserId,
      serviceSlug: "meet-greet",
      startsAt: start2,
      endsAt: futureEnd(start2),
      quantities: {},
      recurringRule: null,
    });
    expect(second.kind).toBe("onboarding_incomplete");
  });

  it("info_pending user booking meet-greet → onboarding_incomplete", async () => {
    const start = futureStart(63);
    const result = await createBookingCore(deps(), {
      userId: infoPendingUserId,
      serviceSlug: "meet-greet",
      startsAt: start,
      endsAt: futureEnd(start),
      quantities: {},
      recurringRule: null,
    });
    expect(result.kind).toBe("onboarding_incomplete");
  });

  it("declined user booking meet-greet → onboarding_incomplete", async () => {
    const start = futureStart(64);
    const result = await createBookingCore(deps(), {
      userId: declinedUserId,
      serviceSlug: "meet-greet",
      startsAt: start,
      endsAt: futureEnd(start),
      quantities: {},
      recurringRule: null,
    });
    expect(result.kind).toBe("onboarding_incomplete");
  });

  it("approved near user booking walk → success (regression)", async () => {
    const start = futureStart(65);
    const result = await createBookingCore(deps(), {
      userId: nearUserId,
      serviceSlug: "walk",
      startsAt: start,
      endsAt: futureEnd(start),
      quantities: { hours: 1, dogs: 1 },
      recurringRule: null,
    });
    expect(result.kind).toBe("success");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// previewEditCore — unit tests (in-memory fake repo, no Supabase needed)
// ──────────────────────────────────────────────────────────────────────────────

const PREVIEW_NOW = new Date("2026-06-10T12:00:00Z");
const PREVIEW_USER = "00000000-0000-4000-8000-000000000001";
const PREVIEW_BOOKING = "00000000-0000-4000-8000-000000000002";

const PREVIEW_SETTINGS = {
  origin_lat: 40.0,
  origin_lng: -105.27,
  road_factor: 1.3,
  avg_speed_mph: 30,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  booking_open_minute: 0,
  booking_close_minute: 1440,
  min_lead_time_hours: 0,
  auto_confirm_horizon_days: 30,
  hard_max_advance_days: 365,
  recurrence_generation_horizon_days: 42,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 3,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
};

function previewBaseRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: PREVIEW_BOOKING,
    client_id: PREVIEW_USER,
    service_slug: "check-in",
    status: "confirmed",
    startsAt: new Date("2026-06-20T16:00:00Z"),
    endsAt: new Date("2026-06-20T17:00:00Z"),
    series_id: null,
    comments: null,
    quote_inputs: { pricingType: "check_in", hours: 1 },
    petIds: [],
    paidCents: 0,
    ...over,
  };
}

function makePreviewRepo(
  row: BookingEditRow | null,
  over: Partial<Record<string, unknown>> = {},
) {
  const updateBookingEdited = vi.fn(async () => {});
  const swapBookingPets = vi.fn(async () => {});
  const appendSeriesSkip = vi.fn(async () => {});
  return {
    getBookingForEdit: vi.fn(async () => row),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in",
      pricing_config: { rate_cents_per_hour: 3000, minimum_cents: 1500 },
      concurrency: "exclusive",
      requires_approval: false,
    })),
    getSettings: vi.fn(async () => PREVIEW_SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.0, lng: -105.27 })),
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved"),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getPetsByIds: vi.fn(async () => []),
    getOpenWindows: vi.fn(async () => [
      {
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T20:00:00Z"),
      },
    ]),
    updateBookingEdited,
    swapBookingPets,
    appendSeriesSkip,
    ...over,
  } as unknown as BookingRepository & {
    updateBookingEdited: typeof updateBookingEdited;
    swapBookingPets: typeof swapBookingPets;
    appendSeriesSkip: typeof appendSeriesSkip;
  };
}

describe("previewEditCore", () => {
  it("returns forbidden on ownership mismatch under client policy", async () => {
    const repo = makePreviewRepo(previewBaseRow({ client_id: "other-user" }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("returns invalid_status for a completed booking", async () => {
    const repo = makePreviewRepo(previewBaseRow({ status: "completed" }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("returns price_locked for a paid booking with a price-affecting patch", async () => {
    const repo = makePreviewRepo(previewBaseRow({ paidCents: 3000 }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { quantities: { hours: 2 } },
      },
    );
    expect(result.kind).toBe("price_locked");
  });

  it("drift guard: unpaid quantities change — preview.finalCents matches editBookingCore persisted value", async () => {
    const patch = { quantities: { hours: 2 } };

    // preview
    const previewRepo = makePreviewRepo(previewBaseRow());
    const previewResult = await previewEditCore(
      { repo: previewRepo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch,
      },
    );
    expect(previewResult.kind).toBe("preview");
    if (previewResult.kind !== "preview") throw new Error("unreachable");
    const previewCents = previewResult.preview.finalCents;

    // edit (persist)
    const editRepo = makePreviewRepo(previewBaseRow());
    const editResult = await editBookingCore(
      { repo: editRepo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch,
      },
    );
    expect(editResult.kind).toBe("success");

    const persistedCall = (
      editRepo.updateBookingEdited.mock.calls[0] as unknown as [
        string,
        { final_cents: number },
      ]
    )[1];
    expect(persistedCall.final_cents).toBe(previewCents);
  });

  it("unpaid time-only move on confirmed booking → preview with requiresApproval reflecting re-derivation", async () => {
    const repo = makePreviewRepo(previewBaseRow());
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") throw new Error("unreachable");
    // Near user (distance < auto threshold) → should not require approval
    expect(result.preview.requiresApproval).toBe(false);
    expect(result.requiresApproval).toBe(false);
  });

  it("not_found: getBookingForEdit returns null → not_found", async () => {
    const repo = makePreviewRepo(null);
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("not_found");
  });

  it("unavailable: unpaid patch whose new start is outside the open window → unavailable", async () => {
    // Open window: 2026-06-20 15:00–20:00 UTC (from makePreviewRepo default).
    // Patch to a start OUTSIDE the window: 2026-06-20 21:00 UTC.
    const repo = makePreviewRepo(previewBaseRow());
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T21:00:00Z"),
          endsAt: new Date("2026-06-20T22:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("unavailable");
  });
});
