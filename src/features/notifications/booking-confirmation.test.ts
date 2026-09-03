/**
 * Unit tests for sendBookingConfirmationFor — the status gate that decides
 * which email a booking gets, and whether Cal hears about it.
 *
 * The Supabase client is the recording double, so the tests also pin the
 * columns the send depends on: drop `status` from the select and the gate has
 * nothing to read; drop `profiles(email, unclaimed)` and the recipient and the
 * unclaimed suppression both disappear.
 */

import { describe, it, expect, vi } from "vitest";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { sendBookingConfirmationFor } from "./booking-confirmation";
import type { FakeResponse } from "@/test-stubs/fake-supabase";
import type { Notifier } from "./notifier";

const BOOKING_ID = "bk-001";

const confirmedRow = {
  status: "confirmed",
  starts_at: "2026-07-01T14:00:00Z",
  ends_at: "2026-07-01T15:00:00Z",
  final_cents: 3000,
  profiles: {
    email: "client@example.com",
    full_name: "Jane Doe",
    unclaimed: false,
  },
  services: { name: "Walk" },
};

const pendingRow = { ...confirmedRow, status: "pending_approval" };

const settingsRow = {
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
};

function fakeNotifier(): Notifier & { notify: ReturnType<typeof vi.fn> } {
  return { notify: vi.fn(async () => {}) };
}

function clientWith(booking: FakeResponse) {
  return createFakeSupabase({
    tables: {
      bookings: booking,
      settings: { data: settingsRow, error: null },
    },
  });
}

describe("sendBookingConfirmationFor", () => {
  it("sends one confirmation for a confirmed booking, addressed from the row", async () => {
    const client = clientWith({ data: confirmedRow, error: null });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith({
      type: "booking_confirmed",
      payload: {
        to: "client@example.com",
        serviceName: "Walk",
        startsAt: new Date("2026-07-01T14:00:00Z"),
        endsAt: new Date("2026-07-01T15:00:00Z"),
        finalCents: 3000,
        cancellationFullRefundHours: 48,
        lateCancelRefundPct: 50,
        paymentsEnabled: PAYMENTS_ENABLED,
      },
    });
  });

  it("selects the status and the client profile the gate reads", async () => {
    const client = clientWith({ data: confirmedRow, error: null });

    await sendBookingConfirmationFor(client, BOOKING_ID, fakeNotifier());

    const columns = client.calls({ table: "bookings", method: "select" })[0]
      ?.args[0] as string;
    expect(columns).toContain("status");
    for (const column of ["email", "full_name", "unclaimed"]) {
      expect(columns).toContain(column);
    }
    expect(client.calls({ table: "bookings", method: "eq" })[0]?.args).toEqual([
      "id",
      BOOKING_ID,
    ]);
  });

  it("tells a pending booking's client it was received, not confirmed", async () => {
    const client = clientWith({ data: pendingRow, error: null });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).toHaveBeenCalledWith({
      type: "booking_received",
      payload: {
        to: "client@example.com",
        serviceName: "Walk",
        startsAt: new Date("2026-07-01T14:00:00Z"),
        endsAt: new Date("2026-07-01T15:00:00Z"),
        finalCents: 3000,
      },
    });
  });

  it("alerts Cal that a pending booking is waiting on approval", async () => {
    const client = clientWith({ data: pendingRow, error: null });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).toHaveBeenCalledWith({
      type: "booking_requested",
      payload: {
        bookingId: BOOKING_ID,
        clientName: "Jane Doe",
        clientEmail: "client@example.com",
        serviceName: "Walk",
        startsAt: new Date("2026-07-01T14:00:00Z"),
        endsAt: new Date("2026-07-01T15:00:00Z"),
        finalCents: 3000,
      },
    });
  });

  it("alerts Cal about an unclaimed client's request but mails them nothing", async () => {
    const client = clientWith({
      data: {
        ...pendingRow,
        profiles: {
          email: "shadow@example.com",
          full_name: null,
          unclaimed: true,
        },
      },
      error: null,
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify.mock.calls[0]?.[0]).toMatchObject({
      type: "booking_requested",
    });
  });

  it("sends no confirmation for a booking that is still pending approval", async () => {
    const client = clientWith({ data: pendingRow, error: null });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    const types = notifier.notify.mock.calls.map(
      (call) => (call[0] as { type: string }).type,
    );
    expect(types).not.toContain("booking_confirmed");
  });

  it("sends nothing at all for a status with no email of its own", async () => {
    const client = clientWith({
      data: { ...confirmedRow, status: "cancelled" },
      error: null,
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("sends nothing to an unclaimed client", async () => {
    const client = clientWith({
      data: {
        ...confirmedRow,
        profiles: {
          email: "shadow@example.com",
          full_name: null,
          unclaimed: true,
        },
      },
      error: null,
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("treats a null unclaimed flag as claimed", async () => {
    const client = clientWith({
      data: {
        ...confirmedRow,
        profiles: {
          email: "legacy@example.com",
          full_name: null,
          unclaimed: null,
        },
      },
      error: null,
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).toHaveBeenCalledTimes(1);
  });

  it("logs the read failure instead of dropping it silently", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientWith({
      data: null,
      error: { message: "connection reset" },
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logged.mock.calls[0]?.[0]).toContain(BOOKING_ID);
    logged.mockRestore();
  });

  it("logs and sends nothing when the booking has no client profile", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientWith({
      data: { ...confirmedRow, profiles: null },
      error: null,
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs and sends nothing when the refund settings cannot be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createFakeSupabase({
      tables: {
        bookings: { data: confirmedRow, error: null },
        settings: { data: null, error: { message: "no row" } },
      },
    });
    const notifier = fakeNotifier();

    await sendBookingConfirmationFor(client, BOOKING_ID, notifier);

    expect(notifier.notify).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("never throws when the notifier does", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientWith({ data: confirmedRow, error: null });
    const notifier: Notifier = {
      notify: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };

    await expect(
      sendBookingConfirmationFor(client, BOOKING_ID, notifier),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
