/**
 * Integration tests for the admin create-on-behalf and edit paths.
 *
 * Exercises createBookingCore and editBookingCore with ADMIN_POLICY against
 * the local Supabase stack via a service-role repo. The "use server" auth
 * layer is NOT exercised here — that is manual QA.
 *
 * Prerequisites: local Supabase stack running (`npx supabase start`).
 * Credentials loaded from .env.test (gitignored).
 *
 * All DB rows created here are cleaned up in afterAll — no pollution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseBookingRepository } from "./booking-repository";
import { createBookingCore, editBookingCore } from "./booking-service";
import { ADMIN_POLICY } from "./mutation-policy";

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

/** Service-role client — bypasses RLS for fixture setup and verification. */
const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ──────────────────────────────────────────────────────────────────────────────
// Shared state (populated in beforeAll)
// ──────────────────────────────────────────────────────────────────────────────

const ts = Date.now();
const TEST_PASS = "Admin1234!";

/** Client A: the booking owner. FAR from Boulder origin → beyond hard cutoff.
 *  This ensures that createBookingCore with CLIENT_POLICY would block but
 *  ADMIN_POLICY warns instead. */
const FAR_LAT = 48.0; // Seattle-ish — well beyond the hard_cutoff_miles
const FAR_LNG = -122.3;

/** A different actor userId to prove ownership bypass in editBookingCore. */
const OTHER_LAT = 40.087; // near Boulder — auto-confirm distance
const OTHER_LNG = -105.27;

let clientAUserId: string;
let otherUserId: string;
let walkServiceId: string;
let petA: string;

// Track created rows for afterAll cleanup (FK-safe order).
const createdBookingIds: string[] = [];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** A future timestamp outside any availability window (no windows seeded). */
function futureStart(offsetDays = 5): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(17, 0, 0, 0);
  return d;
}

function futureEnd(start: Date, durationMs = 60 * 60 * 1000): Date {
  return new Date(start.getTime() + durationMs);
}

/** Build a fresh repo + deps bundle. */
function deps() {
  return {
    repo: createSupabaseBookingRepository(serviceClient),
    now: new Date(),
  };
}

/**
 * Direct-insert a booking row, bypassing gate logic.
 * Tracks the id in createdBookingIds for cleanup.
 */
async function insertBookingRow(opts: {
  clientId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status?: string;
  finalCents?: number;
  comments?: string | null;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: opts.clientId,
      service_id: opts.serviceId,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      series_id: null,
      status: opts.status ?? "confirmed",
      concurrency: "exclusive",
      distance_miles: 5,
      requires_approval: false,
      final_cents: opts.finalCents ?? 3500,
      quote_inputs: { pricingType: "walk", hours: 1, dogs: 1 },
      quote_breakdown: {},
      discount_cents: 0,
      comments: opts.comments ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`insertBookingRow failed: ${error?.message}`);
  }
  createdBookingIds.push(data.id as string);
  return data.id as string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Create client A (far, approved — distance would block client policy).
  const { data: authA, error: errA } =
    await serviceClient.auth.admin.createUser({
      email: `test-admin-create-clientA-${ts}@example.invalid`,
      password: TEST_PASS,
      email_confirm: true,
    });
  if (errA || !authA.user) {
    throw new Error(`Failed to create client A: ${errA?.message}`);
  }
  clientAUserId = authA.user.id;

  const { error: profileErrA } = await serviceClient
    .from("profiles")
    .update({
      lat: FAR_LAT,
      lng: FAR_LNG,
      onboarding_status: "approved",
    })
    .eq("id", clientAUserId);
  if (profileErrA) {
    throw new Error(
      `Failed to update client A profile: ${profileErrA.message}`,
    );
  }

  // 2. Create other user (near, approved — used as "other actor" in edit test).
  const { data: authOther, error: errOther } =
    await serviceClient.auth.admin.createUser({
      email: `test-admin-create-other-${ts}@example.invalid`,
      password: TEST_PASS,
      email_confirm: true,
    });
  if (errOther || !authOther.user) {
    throw new Error(`Failed to create other user: ${errOther?.message}`);
  }
  otherUserId = authOther.user.id;

  const { error: profileErrOther } = await serviceClient
    .from("profiles")
    .update({
      lat: OTHER_LAT,
      lng: OTHER_LNG,
      onboarding_status: "approved",
    })
    .eq("id", otherUserId);
  if (profileErrOther) {
    throw new Error(
      `Failed to update other user profile: ${profileErrOther.message}`,
    );
  }

  // 3. Resolve the walk service id.
  const { data: svc, error: svcErr } = await serviceClient
    .from("services")
    .select("id")
    .eq("slug", "walk")
    .single();
  if (svcErr || !svc) {
    throw new Error(`walk service not seeded: ${svcErr?.message ?? "no data"}`);
  }
  walkServiceId = svc.id as string;

  // 4. Insert one pet owned by client A (for the create-on-behalf tests).
  const { data: pets, error: petErr } = await serviceClient
    .from("pets")
    .insert([
      { client_id: clientAUserId, name: `PetA-admin-${ts}`, species: "dog" },
    ])
    .select("id");
  if (petErr || !pets || pets.length < 1) {
    throw new Error(`pet fixture failed: ${petErr?.message}`);
  }
  petA = pets[0].id as string;

  // NOTE: No availability windows are inserted here. That is intentional —
  // the absence of windows means fitsWindow() will fail for every slot,
  // which is what triggers the out-of-window warning under ADMIN_POLICY.
});

afterAll(async () => {
  // Delete in FK-safe order: payments → booking_pets → bookings → then users.
  if (createdBookingIds.length > 0) {
    await serviceClient
      .from("payments")
      .delete()
      .in("booking_id", createdBookingIds);
    await serviceClient
      .from("booking_pets")
      .delete()
      .in("booking_id", createdBookingIds);
    await serviceClient.from("bookings").delete().in("id", createdBookingIds);
  }

  if (clientAUserId) {
    await serviceClient.from("pets").delete().eq("client_id", clientAUserId);
    await serviceClient.auth.admin.deleteUser(clientAUserId);
  }

  if (otherUserId) {
    await serviceClient.auth.admin.deleteUser(otherUserId);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Admin create-on-behalf succeeds OUTSIDE windows with warnings
//
// No availability windows exist after the DB reset. Under CLIENT_POLICY this
// would return { kind: "unavailable" }. Under ADMIN_POLICY it skips the window
// check and adds a warning instead, returning { kind: "success" }.
// ──────────────────────────────────────────────────────────────────────────────

describe("admin create-on-behalf", () => {
  it("succeeds outside windows with at least one warning", async () => {
    const startsAt = futureStart(5);
    const endsAt = futureEnd(startsAt);

    const result = await createBookingCore(
      deps(),
      {
        userId: clientAUserId,
        serviceSlug: "walk",
        startsAt,
        endsAt,
        quantities: { hours: 1, dogs: 1 },
        petIds: [petA],
        recurringRule: null,
      },
      ADMIN_POLICY,
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.bookingIds.length).toBe(1);

      // Verify the booking row actually exists in the DB.
      const { data: row } = await serviceClient
        .from("bookings")
        .select("id, client_id, status")
        .eq("id", result.bookingIds[0])
        .single();

      expect(row).not.toBeNull();
      expect(row!.client_id).toBe(clientAUserId);

      // Track for cleanup (createBookingCore already inserted the row — add id).
      if (!createdBookingIds.includes(result.bookingIds[0])) {
        createdBookingIds.push(result.bookingIds[0]);
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Admin force-confirm inserts a CONFIRMED booking
  // ──────────────────────────────────────────────────────────────────────────

  it("force-confirm inserts a confirmed booking regardless of approval rules", async () => {
    const startsAt = futureStart(6);
    const endsAt = futureEnd(startsAt);

    const result = await createBookingCore(
      deps(),
      {
        userId: clientAUserId,
        serviceSlug: "walk",
        startsAt,
        endsAt,
        quantities: { hours: 1, dogs: 1 },
        petIds: [petA],
        recurringRule: null,
      },
      { ...ADMIN_POLICY, forceStatus: "confirmed" },
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.bookingIds.length).toBe(1);

      // Read the row back and assert status === "confirmed".
      const { data: row } = await serviceClient
        .from("bookings")
        .select("id, status")
        .eq("id", result.bookingIds[0])
        .single();

      expect(row).not.toBeNull();
      expect(row!.status).toBe("confirmed");

      if (!createdBookingIds.includes(result.bookingIds[0])) {
        createdBookingIds.push(result.bookingIds[0]);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Admin edit of ANOTHER client's booking succeeds (ownership bypass)
//
// The booking is owned by clientAUserId; we call editBookingCore with
// actorUserId = otherUserId. Under CLIENT_POLICY this would return "forbidden".
// Under ADMIN_POLICY the ownership check is skipped and the edit succeeds.
// ──────────────────────────────────────────────────────────────────────────────

describe("admin edit of another client's booking", () => {
  it("succeeds when actorUserId differs from booking owner", async () => {
    const start = futureStart(10);
    const end = futureEnd(start);

    const bookingId = await insertBookingRow({
      clientId: clientAUserId,
      serviceId: walkServiceId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
    });

    // Patch with a comments-only change (non-price-affecting).
    const result = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: otherUserId, // NOT the booking owner
        policy: ADMIN_POLICY,
        patch: { comments: `admin-edit-ownership-bypass-${ts}` },
      },
    );

    expect(result.kind).toBe("success");

    // Verify the comment was actually written to the DB row.
    const { data: row } = await serviceClient
      .from("bookings")
      .select("comments")
      .eq("id", bookingId)
      .single();

    expect(row?.comments).toBe(`admin-edit-ownership-bypass-${ts}`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Paid booking: price-affecting admin edit is price_locked; time-only succeeds
//
// Seed a booking with a succeeded payment. A patch that touches petIds (price-
// affecting) must return "price_locked". A patch that only moves startsAt
// (time-only, non-price-affecting) must succeed.
// ──────────────────────────────────────────────────────────────────────────────

describe("admin edit of paid booking", () => {
  it("price-affecting patch is price_locked; time-only patch succeeds", async () => {
    const start = futureStart(20);
    const end = futureEnd(start);

    const bookingId = await insertBookingRow({
      clientId: clientAUserId,
      serviceId: walkServiceId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      finalCents: 3500,
    });

    // Seed a succeeded payment so paidCents > 0.
    const { error: pmtErr } = await serviceClient.from("payments").insert({
      booking_id: bookingId,
      client_id: clientAUserId,
      stripe_payment_intent_id: `pi_test_admin_lock_${ts}`,
      amount_cents: 3500,
      status: "succeeded",
    });
    if (pmtErr) throw new Error(`payment insert: ${pmtErr.message}`);

    // Price-affecting patch (petIds change) → must be price_locked.
    const locked = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: otherUserId,
        policy: ADMIN_POLICY,
        patch: { petIds: [petA] }, // price-affecting
      },
    );

    expect(locked.kind).toBe("price_locked");

    // DB row should be unchanged after the blocked edit.
    const { data: rowAfterLock } = await serviceClient
      .from("bookings")
      .select("final_cents")
      .eq("id", bookingId)
      .single();
    expect(rowAfterLock?.final_cents).toBe(3500);

    // Time-only patch (startsAt move, no petIds/quantities) → must succeed.
    const newStart = futureStart(21);
    const ok = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: otherUserId,
        policy: ADMIN_POLICY,
        patch: { startsAt: newStart },
      },
    );

    expect(ok.kind).toBe("success");

    // Verify the DB row's starts_at was updated.
    const { data: rowAfterEdit } = await serviceClient
      .from("bookings")
      .select("starts_at")
      .eq("id", bookingId)
      .single();

    expect(rowAfterEdit).not.toBeNull();
    const dbStart = new Date(rowAfterEdit!.starts_at as string);
    expect(dbStart.getTime()).toBe(newStart.getTime());
  });
});
