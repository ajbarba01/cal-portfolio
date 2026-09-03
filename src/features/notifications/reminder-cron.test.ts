/**
 * Unit tests for reminder cron: the `isRemindable` predicate and the queries
 * `runReminderCron` issues against a recording Supabase double.
 *
 * Integration tests for runReminderCron against a real database live in
 * reminder-cron.integration.test.ts (requires local Supabase / SUPABASE_TEST_* env vars).
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";
import { isRemindable, runReminderCron } from "./reminder-cron";
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

/** A mailer whose sends all fail, for the retry-next-run branch. */
class FailingMailer implements Mailer {
  public attempts = 0;

  async send(): Promise<SendResult> {
    this.attempts++;
    return { ok: false, error: "resend rejected the message" };
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
// Queries: runReminderCron against the recording double
// ──────────────────────────────────────────────────────────────────────────────

describe("runReminderCron", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  const doubleWithSettings = (settings: unknown) =>
    createFakeSupabase({
      tables: {
        settings: { data: settings, error: null },
        bookings: { data: [], error: null },
      },
    });

  it("reads the due batch oldest first and bounded", async () => {
    const serviceClient = doubleWithSettings({ reminder_lead_hours: 24 });

    const result = await runReminderCron({
      serviceClient,
      mailer: new FakeMailer(),
      now,
    });

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(
      serviceClient.calls({ table: "bookings", method: "order" })[0]?.args,
    ).toEqual(["starts_at"]);
    expect(
      serviceClient.calls({ table: "bookings", method: "limit" })[0]?.args,
    ).toEqual([100]);
  });

  it("selects only the settings column the window arithmetic needs", async () => {
    const serviceClient = doubleWithSettings({ reminder_lead_hours: 24 });

    await runReminderCron({ serviceClient, mailer: new FakeMailer(), now });

    expect(
      serviceClient.calls({ table: "settings", method: "select" })[0]?.args,
    ).toEqual(["reminder_lead_hours"]);
  });

  it("fails loudly when the settings row is not the shape it expects", async () => {
    const serviceClient = doubleWithSettings({ reminder_lead_hours: "24" });

    const result = await runReminderCron({
      serviceClient,
      mailer: new FakeMailer(),
      now,
    });

    expect(result.ok).toBe(false);
    expect(serviceClient.calls({ table: "bookings" })).toEqual([]);
  });

  it("stops when the booking query fails, rather than reporting a quiet run", async () => {
    const serviceClient = createFakeSupabase({
      tables: {
        settings: { data: { reminder_lead_hours: 24 }, error: null },
        bookings: { data: null, error: { message: "statement timeout" } },
      },
    });

    const result = await runReminderCron({
      serviceClient,
      mailer: new FakeMailer(),
      now,
    });

    expect(result.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// The per-row send gate
// ──────────────────────────────────────────────────────────────────────────────

describe("runReminderCron send gate", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  /** A due row: confirmed, unstamped, starting 18 hours into the 24-hour lead. */
  function dueRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "booking-1",
      starts_at: "2026-06-02T06:00:00.000Z",
      ends_at: "2026-06-02T07:00:00.000Z",
      reminder_sent_at: null,
      status: "confirmed",
      profiles: { email: "client@example.invalid", unclaimed: false },
      services: { name: "Dog Walk" },
      ...overrides,
    };
  }

  /**
   * The double serves `bookings` as a FIFO queue: the batch read first, then one
   * entry per stamp write. `stamps` supplies the write results in order.
   */
  function doubleWith(rows: unknown[], stamps: FakeResponse[] = []) {
    return createFakeSupabase({
      tables: {
        settings: { data: { reminder_lead_hours: 24 }, error: null },
        bookings: [{ data: rows, error: null }, ...stamps],
      },
    });
  }

  // The skip and stamp-failure branches log; silence them and assert on the one
  // message that matters. Installed per test rather than once for the file, so
  // an unexpected log from the describes above still reaches the console.
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("sends the reminder and stamps the row it sent for", async () => {
    const serviceClient = doubleWith([dueRow()], [{ data: null, error: null }]);
    const mailer = new FakeMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 1 });
    expect(mailer.sent.map((msg) => msg.to)).toEqual([
      "client@example.invalid",
    ]);
    // The stamp is what makes the cron idempotent, so it has to name both the
    // instant and the booking it belongs to.
    expect(
      serviceClient.calls({ table: "bookings", method: "update" })[0]?.args,
    ).toEqual([{ reminder_sent_at: now.toISOString() }]);
    expect(
      serviceClient.calls({ table: "bookings", method: "eq" }).at(-1)?.args,
    ).toEqual(["id", "booking-1"]);
  });

  it("suppresses the email for a client who has not claimed their account", async () => {
    // Cal handles an unclaimed shadow account's comms by hand until it is
    // claimed, so an automated reminder would be a surprise to the recipient.
    const serviceClient = doubleWith([
      dueRow({
        profiles: { email: "shadow@example.invalid", unclaimed: true },
      }),
    ]);
    const mailer = new FakeMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(mailer.sent).toEqual([]);
    expect(
      serviceClient.calls({ table: "bookings", method: "update" }),
    ).toEqual([]);
  });

  it.each([
    ["no email on file", { profiles: { email: null, unclaimed: false } }],
    ["no profile at all", { profiles: null }],
    ["no service name", { services: null }],
  ])(
    "skips a booking with %s and stamps nothing",
    async (_label, overrides) => {
      const serviceClient = doubleWith([dueRow(overrides)]);
      const mailer = new FakeMailer();

      const result = await runReminderCron({ serviceClient, mailer, now });

      expect(result).toEqual({ ok: true, sent: 0 });
      expect(mailer.sent).toEqual([]);
      expect(
        serviceClient.calls({ table: "bookings", method: "update" }),
      ).toEqual([]);
    },
  );

  it("re-checks the window in code, so a row the query let through is still gated", async () => {
    // The predicate and the query can disagree — a clock skew, a stale row, a
    // widened select. `isRemindable` is the authority.
    const serviceClient = doubleWith([
      dueRow({ status: "pending_approval" }),
      dueRow({ id: "booking-past", starts_at: "2026-05-30T06:00:00.000Z" }),
      dueRow({
        id: "booking-stamped",
        reminder_sent_at: "2026-06-01T09:00:00.000Z",
      }),
    ]);
    const mailer = new FakeMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(mailer.sent).toEqual([]);
  });

  it("skips a row whose shape has drifted and keeps sending the rest", async () => {
    const serviceClient = doubleWith(
      [{ id: "booking-broken" }, dueRow({ id: "booking-good" })],
      [{ data: null, error: null }],
    );
    const mailer = new FakeMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 1 });
    expect(mailer.sent).toHaveLength(1);
  });

  it("leaves the row unstamped when the send fails, so the next run retries", async () => {
    const serviceClient = doubleWith([dueRow()]);
    const mailer = new FailingMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(mailer.attempts).toBe(1);
    expect(
      serviceClient.calls({ table: "bookings", method: "update" }),
    ).toEqual([]);
  });

  it("does not count a send whose stamp failed, and says so in the log", async () => {
    // The email is already out; without the stamp the next run sends it again,
    // which is the one case in this cron that reaches a client twice.
    const serviceClient = doubleWith(
      [dueRow()],
      [{ data: null, error: { message: "deadlock detected" } }],
    );
    const mailer = new FakeMailer();

    const result = await runReminderCron({ serviceClient, mailer, now });

    expect(result).toEqual({ ok: true, sent: 0 });
    expect(mailer.sent).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("booking-1"),
    );
  });
});
