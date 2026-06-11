/**
 * Tests for reminder cron: unit (isRemindable) + integration (runReminderCron).
 *
 * Integration tests require local Supabase running (SUPABASE_TEST_* env vars).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isRemindable, runReminderCron } from "./reminder-cron";
import { sendBookingConfirmation } from "./send-booking-emails";
import type { Mailer, EmailMessage, SendResult } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Fake Mailer
// ──────────────────────────────────────────────────────────────────────────────

class FakeMailer implements Mailer {
  public sent: EmailMessage[] = [];

  async send(msg: EmailMessage): Promise<SendResult> {
    this.sent.push(msg);
    return { ok: true, id: `fake-${this.sent.length}` };
  }

  reset() {
    this.sent = [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: isRemindable
// ──────────────────────────────────────────────────────────────────────────────

describe("isRemindable", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const leadHours = 24;

  it("confirmed + null reminderSentAt + start within window → true", () => {
    const booking = {
      status: "confirmed",
      startsAt: new Date("2026-06-02T06:00:00.000Z"), // ~18h from now, within 24h
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(true);
  });

  it("confirmed + already stamped → false", () => {
    const booking = {
      status: "confirmed",
      startsAt: new Date("2026-06-02T06:00:00.000Z"),
      reminderSentAt: new Date("2026-06-01T11:00:00.000Z"),
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("pending_approval status → false", () => {
    const booking = {
      status: "pending_approval",
      startsAt: new Date("2026-06-02T06:00:00.000Z"),
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("completed status → false", () => {
    const booking = {
      status: "completed",
      startsAt: new Date("2026-06-02T06:00:00.000Z"),
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("start in the past → false", () => {
    const booking = {
      status: "confirmed",
      startsAt: new Date("2026-05-31T06:00:00.000Z"), // before now
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("start exactly at now → false (exclusive lower bound)", () => {
    const booking = {
      status: "confirmed",
      startsAt: now,
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("start beyond leadHours window → false", () => {
    const booking = {
      status: "confirmed",
      startsAt: new Date("2026-06-03T13:00:00.000Z"), // 25h from now, beyond 24h
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(false);
  });

  it("start exactly at window boundary → true (inclusive upper bound)", () => {
    const booking = {
      status: "confirmed",
      startsAt: new Date("2026-06-02T12:00:00.000Z"), // exactly now + 24h
      reminderSentAt: null,
    };
    expect(isRemindable(booking, now, leadHours)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Unit test: sendBookingConfirmation builds + sends one message
// ──────────────────────────────────────────────────────────────────────────────

describe("sendBookingConfirmation", () => {
  it("sends one message with correct recipient and subject", async () => {
    const fakeMailer = new FakeMailer();
    const result = await sendBookingConfirmation(fakeMailer, {
      to: "test@example.com",
      serviceName: "Walk",
      startsAt: new Date("2026-06-15T20:00:00.000Z"),
      endsAt: new Date("2026-06-15T21:00:00.000Z"),
      finalCents: 4500,
      cancellationFullRefundHours: 48,
      lateCancelRefundPct: 50,
    });

    expect(result.ok).toBe(true);
    expect(fakeMailer.sent).toHaveLength(1);
    expect(fakeMailer.sent[0]!.to).toBe("test@example.com");
    expect(fakeMailer.sent[0]!.subject).toContain("Walk");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration tests: runReminderCron
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
let clientEmail: string;
let serviceId: string;

const createdBookingIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  // Look up a real service_id.
  const { data: svc } = await serviceClient
    .from("services")
    .select("id")
    .limit(1)
    .single();
  if (!svc) throw new Error("No service found in DB");
  serviceId = svc.id;

  // Create test user.
  clientEmail = `reminder-test-${ts}@example.invalid`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email: clientEmail,
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

async function insertConfirmedBooking(opts: {
  startsAt: Date;
  endsAt: Date;
  reminderSentAt?: string | null;
}): Promise<string> {
  const { data, error } = await serviceClient
    .from("bookings")
    .insert({
      client_id: clientUserId,
      service_id: serviceId,
      starts_at: opts.startsAt.toISOString(),
      ends_at: opts.endsAt.toISOString(),
      status: "confirmed",
      concurrency: "exclusive",
      distance_miles: 5,
      quote_inputs: {},
      quote_breakdown: {},
      final_cents: 3000,
      requires_approval: false,
      discount_cents: 0,
      series_id: null,
      reminder_sent_at: opts.reminderSentAt ?? null,
    })
    .select("id")
    .single();

  if (error || !data)
    throw new Error(`booking insert failed: ${error?.message}`);
  createdBookingIds.push(data.id);
  return data.id;
}

// Far-future base avoids conflicts with other test suites; each test uses a
// different day offset so the exclusive-class exclusion constraint is satisfied.
const FAR_FUTURE = new Date("2035-07-01T00:00:00.000Z");

describe("runReminderCron integration", () => {
  it("sends reminder for confirmed booking within lead window, stamps reminder_sent_at", async () => {
    // Day 0: 2035-07-01T06:00Z → 2035-07-01T08:00Z
    const startsAt = new Date(FAR_FUTURE.getTime() + 6 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);

    // Pretend "now" is 12 hours before startsAt so the booking is within the 24h lead window.
    const now = new Date(startsAt.getTime() - 12 * 3_600_000);

    const bookingId = await insertConfirmedBooking({ startsAt, endsAt });
    const fakeMailer = new FakeMailer();

    const result = await runReminderCron({
      serviceClient,
      mailer: fakeMailer,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sent).toBeGreaterThanOrEqual(1);

    // Verify the correct email was sent to the client.
    const sentToClient = fakeMailer.sent.find((m) => m.to === clientEmail);
    expect(sentToClient).toBeDefined();

    // Verify reminder_sent_at was stamped.
    const { data: row } = await serviceClient
      .from("bookings")
      .select("reminder_sent_at")
      .eq("id", bookingId)
      .single();
    expect(row?.reminder_sent_at).not.toBeNull();
  });

  it("is idempotent: re-run after stamp sends 0 reminders for already-stamped booking", async () => {
    // Day 3: non-overlapping with first test booking.
    const startsAt = new Date(FAR_FUTURE.getTime() + 3 * 24 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
    const now = new Date(startsAt.getTime() - 12 * 3_600_000);

    // Insert booking already stamped (reminder already sent).
    const bookingId = await insertConfirmedBooking({
      startsAt,
      endsAt,
      reminderSentAt: new Date(now.getTime() - 3_600_000).toISOString(),
    });

    const fakeMailer = new FakeMailer();
    const result = await runReminderCron({
      serviceClient,
      mailer: fakeMailer,
      now,
    });
    expect(result.ok).toBe(true);

    // Verify the booking's reminder_sent_at is still the original stamp, not updated.
    const { data: rowAfter } = await serviceClient
      .from("bookings")
      .select("reminder_sent_at")
      .eq("id", bookingId)
      .single();
    const originalStamp = new Date(now.getTime() - 3_600_000)
      .toISOString()
      .slice(0, 19);
    expect(rowAfter?.reminder_sent_at?.slice(0, 19)).toBe(originalStamp);

    // Run again — idempotency: still not re-sent.
    fakeMailer.reset();
    const result2 = await runReminderCron({
      serviceClient,
      mailer: fakeMailer,
      now,
    });
    expect(result2.ok).toBe(true);
    // Mailer received nothing on the re-run — already-stamped row is filtered out.
    expect(fakeMailer.sent).toHaveLength(0);
    // Verify stamp still unchanged after second run.
    const { data: rowAfter2 } = await serviceClient
      .from("bookings")
      .select("reminder_sent_at")
      .eq("id", bookingId)
      .single();
    expect(rowAfter2?.reminder_sent_at?.slice(0, 19)).toBe(originalStamp);
  });

  it("does NOT send reminder for confirmed booking far in the future (beyond lead window)", async () => {
    // Day 7: well beyond any 24h window.
    const startsAt = new Date(FAR_FUTURE.getTime() + 7 * 24 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);

    const bookingId = await insertConfirmedBooking({ startsAt, endsAt });

    // now is 72 hours before startsAt — beyond the default 24h lead window.
    const isolatedNow = new Date(startsAt.getTime() - 72 * 3_600_000);

    // Drive the real cron against the DB — it must NOT pick up this booking.
    const fakeMailer = new FakeMailer();
    const result = await runReminderCron({
      serviceClient,
      mailer: fakeMailer,
      now: isolatedNow,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No other suite booking is within (isolatedNow, +24h], so nothing sends.
    expect(result.sent).toBe(0);
    expect(fakeMailer.sent).toHaveLength(0);

    // The far-future booking must remain unstamped (not reminded).
    const { data: row } = await serviceClient
      .from("bookings")
      .select("reminder_sent_at")
      .eq("id", bookingId)
      .single();
    expect(row?.reminder_sent_at).toBeNull();
  });
});
