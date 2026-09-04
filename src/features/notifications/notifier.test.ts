/**
 * Unit tests for ResendNotifier.
 *
 * Tests that notify() builds the right message for each client event and hands
 * it to the injected Mailer, that admin alerts go through the address gate
 * rather than to the client, and that a failing or throwing mailer does not
 * break notify()'s best-effort contract.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { ResendNotifier } from "./resend-notifier";
import type { NotificationEvent } from "./notifier";
import type { Mailer } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────────────────

const CONFIRMED: NotificationEvent = {
  type: "booking_confirmed",
  payload: {
    to: "client@example.com",
    serviceName: "Walk",
    startsAt: new Date("2026-07-01T14:00:00Z"),
    endsAt: new Date("2026-07-01T15:00:00Z"),
    finalCents: 3000,
    cancellationFullRefundHours: 48,
    lateCancelRefundPct: 50,
    paymentsEnabled: true,
  },
};

const RECEIVED: NotificationEvent = {
  type: "booking_received",
  payload: {
    to: "client@example.com",
    serviceName: "Walk",
    startsAt: new Date("2026-07-01T14:00:00Z"),
    endsAt: new Date("2026-07-01T15:00:00Z"),
    finalCents: 3000,
  },
};

const REQUESTED: NotificationEvent = {
  type: "booking_requested",
  payload: {
    bookingId: "bk-001",
    clientName: "Jane Doe",
    clientEmail: "client@example.com",
    serviceName: "Walk",
    startsAt: new Date("2026-07-01T14:00:00Z"),
    endsAt: new Date("2026-07-01T15:00:00Z"),
    finalCents: 3000,
  },
};

const ORIGINAL_ADDRESS = process.env.ADMIN_NOTIFICATION_EMAIL;

afterEach(() => {
  if (ORIGINAL_ADDRESS === undefined) {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
  } else {
    process.env.ADMIN_NOTIFICATION_EMAIL = ORIGINAL_ADDRESS;
  }
});

function fakeMailer(): Mailer & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => ({ ok: true as const, id: "email-1" })) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResendNotifier", () => {
  it("sends the confirmation to the client the event names", async () => {
    const mailer = fakeMailer();

    await new ResendNotifier({ mailer }).notify(CONFIRMED);

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0]?.[0] as { to: string; text: string };
    expect(msg.to).toBe("client@example.com");
    expect(msg.text).toContain("confirmed");
  });

  it("sends the received notice for a request that is still pending", async () => {
    const mailer = fakeMailer();

    await new ResendNotifier({ mailer }).notify(RECEIVED);

    const msg = mailer.send.mock.calls[0]?.[0] as { to: string; text: string };
    expect(msg.to).toBe("client@example.com");
    expect(msg.text).toContain("reviewed shortly");
  });

  it("routes an admin alert to the alert address, never to the client", async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "cal@example.com";
    const mailer = fakeMailer();

    await new ResendNotifier({ mailer }).notify(REQUESTED);

    const msg = mailer.send.mock.calls[0]?.[0] as { to: string };
    expect(msg.to).toBe("cal@example.com");
  });

  it("sends no admin alert while the alert address is unset", async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const mailer = fakeMailer();

    await new ResendNotifier({ mailer }).notify(REQUESTED);

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("does NOT throw when the mailer returns ok:false (best-effort)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const mailer: Mailer = {
      send: vi.fn(async () => ({
        ok: false as const,
        error: "network timeout",
      })),
    };

    await expect(
      new ResendNotifier({ mailer }).notify(CONFIRMED),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("does NOT throw when the mailer throws (best-effort)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const mailer: Mailer = {
      send: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };

    await expect(
      new ResendNotifier({ mailer }).notify(RECEIVED),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
