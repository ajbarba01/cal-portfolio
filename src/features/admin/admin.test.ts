/**
 * Integration tests for admin cores.
 *
 * Prerequisites: local Supabase stack running.
 * Credentials loaded from .env.test (gitignored).
 *
 * Tests (per spec):
 * 1. Approvals: admin approves pending → confirmed; declines → declined; non-admin → forbidden.
 * 2. Block-out: window deleted + overlapping confirmed booking cancelled.
 * 3. Services: invalid pricing_config → validation_error; valid update persists; non-admin → forbidden.
 * 4. Settings: non-admin → forbidden; valid update persists; invalid value → validation_error.
 * 5. Reviews: admin publishes pending review; non-admin → forbidden.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transitionBookingByAdminCore } from "./approval-actions";
import { createWindowCore, deleteWindowCore } from "./availability-actions";
import { updateServiceCore, listServicesCore } from "./services-actions";
import { updateSettingsCore } from "./settings-actions";
import { moderateReviewCore, listReviewsCore } from "./reviews-actions";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixture state
// ──────────────────────────────────────────────────────────────────────────────

const TEST_PASS = "Test1234!";
const ts = Date.now();

let adminUserId: string;
let nonAdminUserId: string;
let clientUserId: string; // owns test bookings

// Track created resource IDs for cleanup.
const createdBookingIds: string[] = [];
const createdWindowIds: string[] = [];
const createdReviewIds: string[] = [];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function createTestUser(
  email: string,
  role: "admin" | "client" = "client",
): Promise<string> {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message}`);
  }
  const userId = data.user.id;

  if (role === "admin") {
    const { error: roleErr } = await serviceClient
      .from("profiles")
      .update({ role: "admin", lat: 40.16, lng: -105.27 })
      .eq("id", userId);
    if (roleErr) throw new Error(`Set admin role failed: ${roleErr.message}`);
  } else {
    // Client: set coordinates so bookings can be created (auto-approve zone).
    const { error: profileErr } = await serviceClient
      .from("profiles")
      .update({ lat: 40.16, lng: -105.27 })
      .eq("id", userId);
    if (profileErr)
      throw new Error(`Set client profile failed: ${profileErr.message}`);
  }

  return userId;
}

/** Creates a booking at the given offset with the given status (via direct insert). */
async function createBookingFixture(opts: {
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  status: "pending_approval" | "confirmed";
}): Promise<string> {
  // Load service + settings to get IDs.
  const { data: svc } = await serviceClient
    .from("services")
    .select("id, pricing_config, concurrency, requires_approval")
    .eq("slug", "walk")
    .single();
  if (!svc) throw new Error("walk service not found");

  const { data: settings } = await serviceClient
    .from("settings")
    .select("id")
    .limit(1)
    .single();
  if (!settings) throw new Error("settings not found");

  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: opts.clientId,
      service_id: svc.id,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      series_id: null,
      status: opts.status,
      concurrency: svc.concurrency,
      distance_miles: 10,
      quote_inputs: {},
      quote_breakdown: {},
      final_cents: 5000,
      requires_approval: opts.status === "pending_approval",
      discount_cents: 0,
    })
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`booking insert failed: ${error?.message}`);
  createdBookingIds.push(data.id);
  return data.id;
}

function futureDate(offsetDays: number, hour = 17): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function adminDeps() {
  return { serviceClient, actorUserId: adminUserId };
}

function nonAdminDeps() {
  return { serviceClient, actorUserId: nonAdminUserId };
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  [adminUserId, nonAdminUserId, clientUserId] = await Promise.all([
    createTestUser(`admin-${ts}@example.invalid`, "admin"),
    createTestUser(`nonadmin-${ts}@example.invalid`, "client"),
    createTestUser(`client-${ts}@example.invalid`, "client"),
  ]);
});

afterAll(async () => {
  // Delete in order: reviews, bookings, availability windows, then users.
  if (createdReviewIds.length > 0) {
    await serviceClient.from("reviews").delete().in("id", createdReviewIds);
  }

  if (createdBookingIds.length > 0) {
    await serviceClient.from("bookings").delete().in("id", createdBookingIds);
  }

  if (createdWindowIds.length > 0) {
    await serviceClient
      .from("availability_windows")
      .delete()
      .in("id", createdWindowIds);
  }

  // Delete all bookings for client fixtures too (overlap test).
  if (clientUserId) {
    await serviceClient.from("bookings").delete().eq("client_id", clientUserId);
  }

  await Promise.all(
    [adminUserId, nonAdminUserId, clientUserId]
      .filter(Boolean)
      .map((id) => serviceClient.auth.admin.deleteUser(id)),
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Approvals
// ──────────────────────────────────────────────────────────────────────────────

describe("transitionBookingByAdminCore", () => {
  it("admin approves pending_approval → confirmed", async () => {
    const start = futureDate(30);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const bookingId = await createBookingFixture({
      clientId: clientUserId,
      startsAt: start,
      endsAt: end,
      status: "pending_approval",
    });

    const result = await transitionBookingByAdminCore(adminDeps(), {
      bookingId,
      event: "approve",
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newStatus).toBe("confirmed");

    const { data } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(data?.status).toBe("confirmed");
  });

  it("admin declines pending_approval → declined", async () => {
    const start = futureDate(31);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const bookingId = await createBookingFixture({
      clientId: clientUserId,
      startsAt: start,
      endsAt: end,
      status: "pending_approval",
    });

    const result = await transitionBookingByAdminCore(adminDeps(), {
      bookingId,
      event: "decline",
    });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.newStatus).toBe("declined");

    const { data } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(data?.status).toBe("declined");
  });

  it("non-admin actor → forbidden, status unchanged", async () => {
    const start = futureDate(32);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const bookingId = await createBookingFixture({
      clientId: clientUserId,
      startsAt: start,
      endsAt: end,
      status: "pending_approval",
    });

    const result = await transitionBookingByAdminCore(nonAdminDeps(), {
      bookingId,
      event: "approve",
    });

    expect(result.kind).toBe("forbidden");

    const { data } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(data?.status).toBe("pending_approval");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Block-out
// ──────────────────────────────────────────────────────────────────────────────

describe("deleteWindowCore (block-out)", () => {
  it("deletes window and cancels overlapping confirmed booking", async () => {
    const wStart = futureDate(60);
    const wEnd = new Date(wStart.getTime() + 48 * 60 * 60 * 1000); // 2 days

    // Create availability window.
    const createResult = await createWindowCore(adminDeps(), {
      startsAt: wStart.toISOString(),
      endsAt: wEnd.toISOString(),
      note: "test block-out window",
    });
    expect(createResult.kind).toBe("success");

    // Load the window id.
    const { data: windows } = await serviceClient
      .from("availability_windows")
      .select("id")
      .eq("note", "test block-out window")
      .order("starts_at", { ascending: false })
      .limit(1);
    const windowId = windows?.[0]?.id as string;
    expect(windowId).toBeTruthy();
    createdWindowIds.push(windowId);

    // Create a confirmed booking overlapping the window.
    const bStart = new Date(wStart.getTime() + 3600 * 1000); // 1h after window start
    const bEnd = new Date(bStart.getTime() + 60 * 60 * 1000);
    const bookingId = await createBookingFixture({
      clientId: clientUserId,
      startsAt: bStart,
      endsAt: bEnd,
      status: "confirmed",
    });

    // Block out the window.
    const deleteResult = await deleteWindowCore(
      { ...adminDeps(), now: new Date() },
      { windowId },
    );
    expect(deleteResult.kind).toBe("success");

    // Window should be deleted.
    const { data: windowAfter } = await serviceClient
      .from("availability_windows")
      .select("id")
      .eq("id", windowId)
      .maybeSingle();
    expect(windowAfter).toBeNull();

    // Booking should be cancelled.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(booking?.status).toBe("cancelled");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Services
// ──────────────────────────────────────────────────────────────────────────────

describe("updateServiceCore", () => {
  let walkServiceId: string;

  beforeAll(async () => {
    const result = await listServicesCore(adminDeps());
    if (result.kind !== "success") throw new Error("listServices failed");
    const walk = result.services.find((s) => s.slug === "walk");
    if (!walk) throw new Error("walk service not found");
    walkServiceId = walk.id;
  });

  it("non-admin → forbidden", async () => {
    const result = await updateServiceCore(nonAdminDeps(), {
      serviceId: walkServiceId,
      name: "Hacked Walk",
    });
    expect(result.kind).toBe("forbidden");
  });

  it("invalid pricing_config (missing required key) → validation_error", async () => {
    // Walk config requires rate_cents_per_hour, per_dog_cents, kiche_discount_pct.
    // Supply a negative rate → Zod rejects.
    const result = await updateServiceCore(adminDeps(), {
      serviceId: walkServiceId,
      pricing_config: {
        rate_cents_per_hour: -500, // invalid: must be nonnegative
        per_dog_cents: 0,
        kiche_discount_pct: 10,
      },
    });
    expect(result.kind).toBe("validation_error");
  });

  it("valid update persists", async () => {
    const result = await updateServiceCore(adminDeps(), {
      serviceId: walkServiceId,
      // Only update description (safe, doesn't affect pricing).
      description: `Admin test description ${ts}`,
    });
    expect(result.kind).toBe("success");

    const { data } = await serviceClient
      .from("services")
      .select("description")
      .eq("id", walkServiceId)
      .single();
    expect(data?.description).toBe(`Admin test description ${ts}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Settings
// ──────────────────────────────────────────────────────────────────────────────

describe("updateSettingsCore", () => {
  it("non-admin → forbidden", async () => {
    const result = await updateSettingsCore(nonAdminDeps(), {
      avg_speed_mph: 50,
    });
    expect(result.kind).toBe("forbidden");
  });

  it("invalid value (hour > 23) → validation_error", async () => {
    const result = await updateSettingsCore(adminDeps(), {
      booking_open_hour: 25, // invalid
    });
    expect(result.kind).toBe("validation_error");
  });

  it("invalid value (negative) → validation_error", async () => {
    const result = await updateSettingsCore(adminDeps(), {
      avg_speed_mph: -10,
    });
    expect(result.kind).toBe("validation_error");
  });

  it("valid update persists", async () => {
    // Set avg_speed_mph to a sentinel value then restore.
    const result = await updateSettingsCore(adminDeps(), {
      avg_speed_mph: 42,
    });
    expect(result.kind).toBe("success");

    const { data } = await serviceClient
      .from("settings")
      .select("avg_speed_mph")
      .limit(1)
      .single();
    expect(data?.avg_speed_mph).toBe(42);

    // Restore original value.
    await updateSettingsCore(adminDeps(), { avg_speed_mph: 40 });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Reviews
// ──────────────────────────────────────────────────────────────────────────────

describe("moderateReviewCore", () => {
  let reviewId: string;

  beforeAll(async () => {
    // Insert a pending review for the test client.
    const { data, error } = await serviceClient
      .from("reviews")
      .insert({
        client_id: clientUserId,
        author_name: "Test Client",
        rating: 5,
        body: "Wonderful service! (test)",
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data)
      throw new Error(`review insert failed: ${error?.message}`);
    reviewId = data.id;
    createdReviewIds.push(reviewId);
  });

  it("non-admin → forbidden", async () => {
    const result = await moderateReviewCore(nonAdminDeps(), {
      reviewId,
      status: "published",
    });
    expect(result.kind).toBe("forbidden");

    const { data } = await serviceClient
      .from("reviews")
      .select("status")
      .eq("id", reviewId)
      .single();
    expect(data?.status).toBe("pending");
  });

  it("admin moderates pending → published", async () => {
    const result = await moderateReviewCore(adminDeps(), {
      reviewId,
      status: "published",
    });
    expect(result.kind).toBe("success");

    const { data } = await serviceClient
      .from("reviews")
      .select("status")
      .eq("id", reviewId)
      .single();
    expect(data?.status).toBe("published");
  });

  it("admin moderates published → rejected", async () => {
    const result = await moderateReviewCore(adminDeps(), {
      reviewId,
      status: "rejected",
    });
    expect(result.kind).toBe("success");

    const { data } = await serviceClient
      .from("reviews")
      .select("status")
      .eq("id", reviewId)
      .single();
    expect(data?.status).toBe("rejected");
  });

  it("listReviewsCore returns reviews for admin", async () => {
    const result = await listReviewsCore(adminDeps());
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.reviews.length).toBeGreaterThan(0);
    const found = result.reviews.find((r) => r.id === reviewId);
    expect(found).toBeDefined();
  });
});
