/**
 * Integration tests for the four booking-edit repository methods and
 * editBookingCore, exercised end-to-end against the local Supabase stack.
 *
 * Methods under test:
 *   - getBookingForEdit        (booking-repository.ts)
 *   - updateBookingEdited      (booking-repository.ts)
 *   - swapBookingPets          (booking-repository.ts)
 *   - appendSeriesSkip         (booking-repository.ts)
 *   - editBookingCore          (booking-service.ts)
 *
 * Prerequisites: local Supabase stack running (`npx supabase start`).
 * Credentials loaded from .env.test (gitignored).
 *
 * All DB rows created here are cleaned up in afterAll — no pollution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseBookingRepository } from "./booking-repository";
import { editBookingCore } from "./booking-service";
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
const TEST_PASS = "Edit1234!";
const NEAR_LAT = 40.087; // ~5 mi N of Boulder origin → auto-confirm
const NEAR_LNG = -105.27;

let editUserId: string;
let walkServiceId: string;
let coveringWindowId: string;
let petA: string;
let petB: string;

// Track all booking / series ids so afterAll can delete them.
const createdBookingIds: string[] = [];
const createdSeriesIds: string[] = [];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** A future timestamp well inside the covering window and business hours. */
function futureStart(offsetDays = 5): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(17, 0, 0, 0);
  return d;
}

function futureEnd(start: Date, durationMs = 60 * 60 * 1000): Date {
  return new Date(start.getTime() + durationMs);
}

/** Build a fresh repo + deps bundle (injects now so the core stays clock-free). */
function deps() {
  return {
    repo: createSupabaseBookingRepository(serviceClient),
    now: new Date(),
  };
}

/**
 * Direct-insert a booking row. Used for cases where we need precise control
 * over the booking state without running gate logic.
 */
async function insertBookingRow(opts: {
  clientId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  seriesId?: string | null;
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
      series_id: opts.seriesId ?? null,
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
  // 1. Create a test user + approve their profile.
  const { data: authData, error: authErr } =
    await serviceClient.auth.admin.createUser({
      email: `test-edit-booking-${ts}@example.invalid`,
      password: TEST_PASS,
      email_confirm: true,
    });
  if (authErr || !authData.user) {
    throw new Error(`Failed to create test user: ${authErr?.message}`);
  }
  editUserId = authData.user.id;

  const { error: profileErr } = await serviceClient
    .from("profiles")
    .update({ lat: NEAR_LAT, lng: NEAR_LNG, onboarding_status: "approved" })
    .eq("id", editUserId);
  if (profileErr) {
    throw new Error(`Failed to update profile: ${profileErr.message}`);
  }

  // 2. Resolve the walk service id (used in direct inserts).
  const { data: svc, error: svcErr } = await serviceClient
    .from("services")
    .select("id")
    .eq("slug", "walk")
    .single();
  if (svcErr || !svc) {
    throw new Error(`walk service not seeded: ${svcErr?.message ?? "no data"}`);
  }
  walkServiceId = svc.id as string;

  // 3. Insert two pets owned by editUserId.
  const { data: pets, error: petErr } = await serviceClient
    .from("pets")
    .insert([
      { client_id: editUserId, name: `PetA-${ts}`, species: "dog" },
      { client_id: editUserId, name: `PetB-${ts}`, species: "dog" },
    ])
    .select("id");
  if (petErr || !pets || pets.length < 2) {
    throw new Error(`pet fixture failed: ${petErr?.message}`);
  }
  petA = pets[0].id as string;
  petB = pets[1].id as string;

  // 4. Wide availability window (now+1d … now+95d at 17:00 UTC) — covers all
  //    test offsets (5–30 days). ADMIN_POLICY skips window-fit, but this is
  //    here to match the pattern of the existing integration suite.
  const winStart = new Date();
  winStart.setUTCDate(winStart.getUTCDate() + 1);
  winStart.setUTCHours(0, 0, 0, 0);
  const winEnd = new Date();
  winEnd.setUTCDate(winEnd.getUTCDate() + 95);
  winEnd.setUTCHours(23, 59, 59, 999);

  const { data: win, error: winErr } = await serviceClient
    .from("availability_windows")
    .insert({
      starts_at: winStart.toISOString(),
      ends_at: winEnd.toISOString(),
    })
    .select("id")
    .single();
  if (winErr || !win) {
    throw new Error(`Failed to insert covering window: ${winErr?.message}`);
  }
  coveringWindowId = win.id as string;
});

afterAll(async () => {
  // Delete in FK-safe order:
  //   payments (on delete restrict) → booking_pets → bookings → booking_series → pets.
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

  if (createdSeriesIds.length > 0) {
    await serviceClient
      .from("booking_series")
      .delete()
      .in("id", createdSeriesIds);
  }

  if (editUserId) {
    // Delete pets explicitly (auth.deleteUser cascades profiles but not pets).
    await serviceClient.from("pets").delete().eq("client_id", editUserId);

    await serviceClient.auth.admin.deleteUser(editUserId);
  }

  if (coveringWindowId) {
    await serviceClient
      .from("availability_windows")
      .delete()
      .eq("id", coveringWindowId);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. getBookingForEdit — shape correctness
// ──────────────────────────────────────────────────────────────────────────────

describe("getBookingForEdit", () => {
  it("returns the correct shape for a walk booking with one assigned pet", async () => {
    const start = futureStart(5);
    const end = futureEnd(start);

    // Direct-insert the booking (bypasses gate logic).
    const bookingId = await insertBookingRow({
      clientId: editUserId,
      serviceId: walkServiceId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      finalCents: 3500,
    });

    // Assign petA via booking_pets.
    const { error: bpErr } = await serviceClient
      .from("booking_pets")
      .insert({ booking_id: bookingId, pet_id: petA });
    if (bpErr) throw new Error(`booking_pets insert: ${bpErr.message}`);

    const repo = createSupabaseBookingRepository(serviceClient);
    const row = await repo.getBookingForEdit(bookingId);

    expect(row).not.toBeNull();
    if (!row) return;

    expect(row.id).toBe(bookingId);
    expect(row.client_id).toBe(editUserId);
    expect(row.service_slug).toBe("walk");
    expect(row.status).toBe("confirmed");
    expect(row.series_id).toBeNull();
    expect(row.paidCents).toBe(0); // no payments row → 0
    expect(row.petIds).toHaveLength(1);
    expect(row.petIds[0]).toBe(petA);

    // Times round-trip through ISO correctly.
    expect(row.startsAt.getTime()).toBe(start.getTime());
    expect(row.endsAt.getTime()).toBe(end.getTime());
  });

  it("returns null for a non-existent booking id", async () => {
    const repo = createSupabaseBookingRepository(serviceClient);
    const row = await repo.getBookingForEdit(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(row).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. editBookingCore: time move (exercises updateBookingEdited)
// ──────────────────────────────────────────────────────────────────────────────

describe("editBookingCore — time move", () => {
  it("moves the booking start while preserving duration; DB row updated", async () => {
    const originalStart = futureStart(7);
    const originalEnd = futureEnd(originalStart); // 1h
    const durationMs = originalEnd.getTime() - originalStart.getTime();

    const bookingId = await insertBookingRow({
      clientId: editUserId,
      serviceId: walkServiceId,
      startsAt: originalStart,
      endsAt: originalEnd,
      status: "confirmed",
    });

    // New start: +1 day (same 17:00 UTC, inside the covering window).
    const newStart = futureStart(8);

    const result = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: editUserId,
        policy: ADMIN_POLICY,
        patch: { startsAt: newStart },
      },
    );

    expect(result.kind).toBe("success");

    // Verify the DB row changed.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("id", bookingId)
      .single();

    expect(booking).not.toBeNull();
    const dbStart = new Date(booking!.starts_at as string);
    const dbEnd = new Date(booking!.ends_at as string);

    expect(dbStart.getTime()).toBe(newStart.getTime());
    // Duration preserved: endsAt = newStart + original duration.
    expect(dbEnd.getTime() - dbStart.getTime()).toBe(durationMs);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. editBookingCore: pet swap (exercises swapBookingPets)
// ──────────────────────────────────────────────────────────────────────────────

describe("editBookingCore — pet swap", () => {
  it("replaces petA with petB; booking_pets contains exactly petB", async () => {
    const start = futureStart(10);
    const end = futureEnd(start);

    const bookingId = await insertBookingRow({
      clientId: editUserId,
      serviceId: walkServiceId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
    });

    // Seed petA.
    await serviceClient
      .from("booking_pets")
      .insert({ booking_id: bookingId, pet_id: petA });

    const result = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: editUserId,
        policy: ADMIN_POLICY,
        patch: { petIds: [petB] },
      },
    );

    expect(result.kind).toBe("success");

    // booking_pets should now contain exactly petB.
    const { data: links } = await serviceClient
      .from("booking_pets")
      .select("pet_id")
      .eq("booking_id", bookingId);

    expect(links).toHaveLength(1);
    expect(links![0].pet_id).toBe(petB);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. editBookingCore: series detach (exercises appendSeriesSkip)
// ──────────────────────────────────────────────────────────────────────────────

describe("editBookingCore — series detach", () => {
  it("nullifies series_id and appends original start to skipped_starts", async () => {
    // Insert a booking_series row directly.
    const { data: series, error: seriesErr } = await serviceClient
      .from("booking_series")
      .insert({
        client_id: editUserId,
        service_id: walkServiceId,
        freq: "weekly",
        step_interval: 1,
        count: 4,
        until: null,
        open_ended: false,
        template_starts_at: futureStart(14).toISOString(),
        duration_min: 60,
        quote_inputs: { pricingType: "walk", hours: 1, dogs: 1 },
      })
      .select("id")
      .single();

    if (seriesErr || !series) {
      throw new Error(`series insert failed: ${seriesErr?.message}`);
    }
    const seriesId = series.id as string;
    createdSeriesIds.push(seriesId);

    // Insert a booking linked to this series.
    const seriesStart = futureStart(14);
    const bookingId = await insertBookingRow({
      clientId: editUserId,
      serviceId: walkServiceId,
      startsAt: seriesStart,
      endsAt: futureEnd(seriesStart),
      seriesId,
      status: "confirmed",
    });

    // Patch with a comments-only edit — still triggers series detach.
    const result = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: editUserId,
        policy: ADMIN_POLICY,
        patch: { comments: `edit-detach-test-${ts}` },
      },
    );

    expect(result.kind).toBe("success");

    // Booking row: series_id should now be NULL.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("series_id, comments")
      .eq("id", bookingId)
      .single();

    expect(booking?.series_id).toBeNull();
    expect(booking?.comments).toBe(`edit-detach-test-${ts}`);

    // Parent series: skipped_starts should contain the original cadence start.
    const { data: seriesRow } = await serviceClient
      .from("booking_series")
      .select("skipped_starts")
      .eq("id", seriesId)
      .single();

    const skipped = seriesRow?.skipped_starts as string[];
    expect(Array.isArray(skipped)).toBe(true);
    // timestamptz[] comes back as "+00:00" strings; normalize both sides to epoch ms.
    const skippedMs = skipped.map((s) => new Date(s).getTime());
    expect(skippedMs).toContain(seriesStart.getTime());
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. editBookingCore: paid-lock
// ──────────────────────────────────────────────────────────────────────────────

describe("editBookingCore — paid-lock", () => {
  it("rejects a price-affecting patch once a succeeded payment exists", async () => {
    const start = futureStart(20);
    const end = futureEnd(start);

    const bookingId = await insertBookingRow({
      clientId: editUserId,
      serviceId: walkServiceId,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      finalCents: 3500,
    });

    // Insert a succeeded payment row (payments.client_id mirrors booking owner).
    const { error: pmtErr } = await serviceClient.from("payments").insert({
      booking_id: bookingId,
      client_id: editUserId,
      stripe_payment_intent_id: `pi_test_lock_${ts}`,
      amount_cents: 3500,
      status: "succeeded",
    });
    if (pmtErr) throw new Error(`payment insert: ${pmtErr.message}`);

    const result = await editBookingCore(
      { ...deps(), now: new Date() },
      {
        bookingId,
        actorUserId: editUserId,
        policy: ADMIN_POLICY,
        patch: { petIds: [petB] }, // price-affecting
      },
    );

    expect(result.kind).toBe("price_locked");

    // DB row should be unchanged.
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("final_cents")
      .eq("id", bookingId)
      .single();
    expect(booking?.final_cents).toBe(3500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. appendSeriesSkip — idempotency (repo method directly)
//
// This test caught a real bug: appendSeriesSkip was NOT idempotent against the
// real DB. Postgres/PostgREST returns timestamptz[] values in "+00:00" notation
// (e.g. "2026-07-05T17:00:00+00:00") but the incoming startIso is always a JS
// Date.toISOString() string (e.g. "2026-07-05T17:00:00.000Z"). The original
// `current.includes(startIso)` check never matched, so every call appended a
// duplicate. Fixed in booking-repository.ts by normalizing both sides to epoch ms
// before the includes check.
// ──────────────────────────────────────────────────────────────────────────────

describe("appendSeriesSkip (repo) — idempotency", () => {
  it("appending the same ISO start twice does not duplicate it", async () => {
    const { data: series, error: seriesErr } = await serviceClient
      .from("booking_series")
      .insert({
        client_id: editUserId,
        service_id: walkServiceId,
        freq: "weekly",
        step_interval: 1,
        count: 2,
        until: null,
        open_ended: false,
        template_starts_at: futureStart(25).toISOString(),
        duration_min: 60,
        quote_inputs: {},
      })
      .select("id")
      .single();

    if (seriesErr || !series) {
      throw new Error(
        `series insert for idempotency test: ${seriesErr?.message}`,
      );
    }
    const seriesId = series.id as string;
    createdSeriesIds.push(seriesId);

    const isoStart = futureStart(25).toISOString();
    const repo = createSupabaseBookingRepository(serviceClient);

    await repo.appendSeriesSkip(seriesId, isoStart);
    await repo.appendSeriesSkip(seriesId, isoStart); // second call — must be no-op

    const { data: seriesRow } = await serviceClient
      .from("booking_series")
      .select("skipped_starts")
      .eq("id", seriesId)
      .single();

    const skipped = seriesRow?.skipped_starts as string[];
    // Normalize timestamptz "+00:00" vs ".000Z" by comparing epoch ms.
    const targetMs = new Date(isoStart).getTime();
    const occurrences = skipped.filter(
      (s) => new Date(s).getTime() === targetMs,
    );
    expect(occurrences).toHaveLength(1);
  });
});
