/**
 * Tests for completion cron: unit (isCompletable) + integration (runCompletionCron).
 *
 * Integration tests require local Supabase running (SUPABASE_TEST_* env vars).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isCompletable, runCompletionCron } from "./completion-cron";

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: isCompletable
// ──────────────────────────────────────────────────────────────────────────────

describe("isCompletable", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("confirmed + endsAt in the past → true", () => {
    expect(
      isCompletable(
        { status: "confirmed", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });

  it("confirmed + endsAt equals now → false (not strictly past)", () => {
    expect(isCompletable({ status: "confirmed", endsAt: now }, now)).toBe(
      false,
    );
  });

  it("confirmed + endsAt in the future → false", () => {
    expect(
      isCompletable(
        { status: "confirmed", endsAt: new Date("2026-06-01T13:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });

  it("pending_approval + endsAt in the past → false", () => {
    expect(
      isCompletable(
        {
          status: "pending_approval",
          endsAt: new Date("2026-06-01T11:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("completed + endsAt in the past → false", () => {
    expect(
      isCompletable(
        { status: "completed", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });

  it("cancelled + endsAt in the past → false", () => {
    expect(
      isCompletable(
        { status: "cancelled", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration tests: runCompletionCron
// ──────────────────────────────────────────────────────────────────────────────

const url = process.env.SUPABASE_TEST_URL!;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  throw new Error("Missing SUPABASE_TEST_* env vars — is .env.test present?");
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASS = "Test1234!";
const ts = Date.now();

let clientUserId: string;
let serviceId: string;

const createdBookingIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  const { data: svc } = await serviceClient
    .from("services")
    .select("id")
    .limit(1)
    .single();
  if (!svc) throw new Error("No service found in DB");
  serviceId = svc.id;

  const { data, error } = await serviceClient.auth.admin.createUser({
    email: `completion-test-${ts}@example.invalid`,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  clientUserId = data.user.id;
  createdUserIds.push(clientUserId);
});

afterAll(async () => {
  if (createdBookingIds.length > 0) {
    await serviceClient.from("bookings").delete().in("id", createdBookingIds);
  }
  for (const uid of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(uid);
  }
});

/**
 * Base time for all test bookings.
 * Far in the past (2020-01-01) with the per-run ts used as a millisecond
 * offset so each test run gets distinct slots and old rows from prior runs
 * don't collide. Day offsets between tests ensure no same-class overlap
 * within a single run.
 */
const BASE_MS =
  new Date("2020-01-01T00:00:00.000Z").getTime() + (ts % 3_600_000);
const BASE = new Date(BASE_MS);

async function insertBookingWithStatus(opts: {
  status: "confirmed" | "pending_approval";
  startsAt: Date;
  endsAt: Date;
  paymentStatus?: string;
}): Promise<string> {
  const insert: Record<string, unknown> = {
    client_id: clientUserId,
    service_id: serviceId,
    starts_at: opts.startsAt.toISOString(),
    ends_at: opts.endsAt.toISOString(),
    status: opts.status,
    concurrency: "exclusive",
    distance_miles: 5,
    quote_inputs: {},
    quote_breakdown: {},
    final_cents: 3000,
    requires_approval: opts.status === "pending_approval",
    discount_cents: 0,
    series_id: null,
  };

  const { data, error } = await serviceClient
    .from("bookings")
    .insert(insert)
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`booking insert failed: ${error?.message}`);
  createdBookingIds.push(data.id);
  return data.id;
}

describe("runCompletionCron integration", () => {
  it("confirmed booking with ends_at in past → completed", async () => {
    // Use non-overlapping historical time windows for each test (exclusion constraint).
    const startsAt = new Date(BASE.getTime() + 0);
    const endsAt = new Date(BASE.getTime() + 2 * 3_600_000);
    const bookingId = await insertBookingWithStatus({
      status: "confirmed",
      startsAt,
      endsAt,
    });

    // now is after endsAt.
    const now = new Date(endsAt.getTime() + 3_600_000);
    const result = await runCompletionCron({ serviceClient, now });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.completed).toBeGreaterThanOrEqual(1);

    const { data: row } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(row?.status).toBe("completed");
  });

  it("confirmed booking with ends_at in future → stays confirmed", async () => {
    const startsAt = new Date(BASE.getTime() + 10 * 24 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const bookingId = await insertBookingWithStatus({
      status: "confirmed",
      startsAt,
      endsAt,
    });

    // now is before endsAt.
    const now = new Date(startsAt.getTime() - 3_600_000);
    const result = await runCompletionCron({ serviceClient, now });

    expect(result.ok).toBe(true);

    const { data: row } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    expect(row?.status).toBe("confirmed");
  });

  it("pending_approval booking with past ends_at → NOT completed (stays pending)", async () => {
    const startsAt = new Date(BASE.getTime() + 20 * 24 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const bookingId = await insertBookingWithStatus({
      status: "pending_approval",
      startsAt,
      endsAt,
    });

    // now is after endsAt.
    const now = new Date(endsAt.getTime() + 3_600_000);
    const result = await runCompletionCron({ serviceClient, now });

    expect(result.ok).toBe(true);

    const { data: row } = await serviceClient
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    // Cron only touches confirmed; pending_approval must remain pending_approval.
    expect(row?.status).toBe("pending_approval");
  });

  it("does not touch payment_status column", async () => {
    const startsAt = new Date(BASE.getTime() + 30 * 24 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const bookingId = await insertBookingWithStatus({
      status: "confirmed",
      startsAt,
      endsAt,
    });

    // Read initial payment_status (whatever the DB default is).
    const { data: before } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();

    const now = new Date(endsAt.getTime() + 3_600_000);
    await runCompletionCron({ serviceClient, now });

    const { data: after } = await serviceClient
      .from("bookings")
      .select("payment_status")
      .eq("id", bookingId)
      .single();

    // payment_status must be unchanged.
    expect(after?.payment_status).toBe(before?.payment_status);
  });
});
