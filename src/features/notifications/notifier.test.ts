/**
 * Unit tests for ResendNotifier.
 *
 * Tests that notify() routes to the injected sendBookingConfirmation stub,
 * and that a failing/throwing sender does not break notify()'s contract.
 */

import { describe, it, expect, vi } from "vitest";
import { ResendNotifier } from "./resend-notifier";
import type { BookingConfirmedPayload } from "./notifier";

// ──────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────────────────

const PAYLOAD: BookingConfirmedPayload = {
  to: "client@example.com",
  serviceName: "Walk",
  startsAt: new Date("2026-07-01T14:00:00Z"),
  endsAt: new Date("2026-07-01T15:00:00Z"),
  finalCents: 3000,
};

/** Minimal no-op Mailer stub — satisfies the interface; never actually used
 *  when sendBookingConfirmation is also stubbed out. */
const noopMailer = {
  send: vi.fn(async () => ({ ok: true as const, id: "noop" })),
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("ResendNotifier", () => {
  it("routes booking_confirmed to the injected sendBookingConfirmation once with correct payload", async () => {
    const sendStub = vi.fn(async () => ({ ok: true as const, id: "email-1" }));
    const notifier = new ResendNotifier({
      sendBookingConfirmation: sendStub,
      mailer: noopMailer,
    });

    await notifier.notify({ type: "booking_confirmed", payload: PAYLOAD });

    expect(sendStub).toHaveBeenCalledTimes(1);
    // The stub receives (mailer, payload) — check the payload arg (second arg)
    expect(sendStub).toHaveBeenCalledWith(noopMailer, PAYLOAD);
  });

  it("does NOT throw when the sender returns ok:false (best-effort)", async () => {
    const failStub = vi.fn(async () => ({
      ok: false as const,
      error: "network timeout",
    }));
    const notifier = new ResendNotifier({
      sendBookingConfirmation: failStub,
      mailer: noopMailer,
    });

    // Must resolve without throwing
    await expect(
      notifier.notify({ type: "booking_confirmed", payload: PAYLOAD }),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when the sender throws (best-effort)", async () => {
    const throwStub = vi.fn(async () => {
      throw new Error("SMTP unavailable");
    });
    const notifier = new ResendNotifier({
      sendBookingConfirmation: throwStub,
      mailer: noopMailer,
    });

    await expect(
      notifier.notify({ type: "booking_confirmed", payload: PAYLOAD }),
    ).resolves.toBeUndefined();
  });
});
