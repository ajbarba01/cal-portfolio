/**
 * Unit tests for the admin alert dispatcher.
 *
 * The gate is the point of these: with `ADMIN_NOTIFICATION_EMAIL` unset the
 * alerts must be unreachable — no message built, no mailer touched, and for
 * the cancellation alert no database read either.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { notifyAdmin, notifyAdminOfCancellation } from "./admin-alerts";
import type { AdminAlertDispatch, AdminAlertEvent } from "./notifier";
import type { Mailer } from "./types";

const ALERT_ADDRESS = "cal@example.com";
const BOOKING_ID = "bk-001";

const ORIGINAL_ADDRESS = process.env.ADMIN_NOTIFICATION_EMAIL;

afterEach(() => {
  if (ORIGINAL_ADDRESS === undefined) {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
  } else {
    process.env.ADMIN_NOTIFICATION_EMAIL = ORIGINAL_ADDRESS;
  }
});

function fakeMailer(): Mailer & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => ({ ok: true as const, id: "sent-1" })) };
}

const BOOKING_REQUESTED: AdminAlertEvent = {
  type: "booking_requested",
  payload: {
    bookingId: BOOKING_ID,
    clientName: "Jane Doe",
    clientEmail: "jane@example.com",
    serviceName: "Dog Walk",
    startsAt: new Date("2026-07-01T14:00:00Z"),
    endsAt: new Date("2026-07-01T15:00:00Z"),
    finalCents: 6500,
  },
};

const INQUIRY_RECEIVED: AdminAlertEvent = {
  type: "inquiry_received",
  payload: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
    subject: null,
    message: "Are you free the week of the 4th?",
  },
};

const BOOKING_CANCELLED: AdminAlertEvent = {
  type: "booking_cancelled",
  payload: {
    bookingId: BOOKING_ID,
    clientName: "Jane Doe",
    clientEmail: "jane@example.com",
    serviceName: "Dog Walk",
    startsAt: new Date("2026-07-01T14:00:00Z"),
  },
};

describe("notifyAdmin", () => {
  it.each([BOOKING_REQUESTED, INQUIRY_RECEIVED, BOOKING_CANCELLED])(
    "sends nothing for $type while the alert address is unset",
    async (event) => {
      delete process.env.ADMIN_NOTIFICATION_EMAIL;
      const mailer = fakeMailer();

      await notifyAdmin(event, mailer);

      expect(mailer.send).not.toHaveBeenCalled();
    },
  );

  it("treats a blank alert address as unset", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "   ";
    const mailer = fakeMailer();

    await notifyAdmin(BOOKING_REQUESTED, mailer);

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it.each([BOOKING_REQUESTED, INQUIRY_RECEIVED, BOOKING_CANCELLED])(
    "sends $type to the configured address",
    async (event) => {
      process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
      const mailer = fakeMailer();

      await notifyAdmin(event, mailer);

      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(mailer.send.mock.calls[0]?.[0]).toMatchObject({
        to: ALERT_ADDRESS,
      });
    },
  );

  it("logs a failed send instead of throwing", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const mailer: Mailer = {
      send: vi.fn(async () => ({ ok: false as const, error: "rejected" })),
    };

    await expect(
      notifyAdmin(BOOKING_REQUESTED, mailer),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("never throws when the mailer does", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const mailer: Mailer = {
      send: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };

    await expect(
      notifyAdmin(BOOKING_REQUESTED, mailer),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("notifyAdminOfCancellation", () => {
  const cancelledRow = {
    starts_at: "2026-07-01T14:00:00Z",
    profiles: { email: "jane@example.com", full_name: "Jane Doe" },
    services: { name: "Dog Walk" },
  };

  function clientWith(data: unknown, error: unknown = null) {
    return createFakeSupabase({ tables: { bookings: { data, error } } });
  }

  it("reads nothing while the alert address is unset", async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const client = clientWith(cancelledRow);
    const dispatch = vi.fn<AdminAlertDispatch>(async () => {});

    await notifyAdminOfCancellation(client, BOOKING_ID, dispatch);

    expect(client._calls).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches the cancellation with the booking's own details", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
    const client = clientWith(cancelledRow);
    const dispatch = vi.fn<AdminAlertDispatch>(async () => {});

    await notifyAdminOfCancellation(client, BOOKING_ID, dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      type: "booking_cancelled",
      payload: {
        bookingId: BOOKING_ID,
        clientName: "Jane Doe",
        clientEmail: "jane@example.com",
        serviceName: "Dog Walk",
        startsAt: new Date("2026-07-01T14:00:00Z"),
      },
    });
    expect(client.calls({ table: "bookings", method: "eq" })[0]?.args).toEqual([
      "id",
      BOOKING_ID,
    ]);
  });

  it("falls back to the client's email when the profile has no name", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
    const client = clientWith({
      ...cancelledRow,
      profiles: { email: "jane@example.com", full_name: null },
    });
    const dispatch = vi.fn<AdminAlertDispatch>(async () => {});

    await notifyAdminOfCancellation(client, BOOKING_ID, dispatch);

    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      payload: { clientName: "jane@example.com" },
    });
  });

  it("logs a failed read and dispatches nothing", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = ALERT_ADDRESS;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = clientWith(null, { message: "connection reset" });
    const dispatch = vi.fn<AdminAlertDispatch>(async () => {});

    await notifyAdminOfCancellation(client, BOOKING_ID, dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
