import { describe, it, expect } from "vitest";
import {
  clientCanCancelBooking,
  cancelLockCopy,
  type CancellabilityInput,
} from "./client-can-cancel";

const base = (
  over: Partial<CancellabilityInput> = {},
): CancellabilityInput => ({
  status: "confirmed",
  startsAt: new Date("2026-07-01T17:00:00Z"),
  ...over,
});
const before = new Date("2026-06-20T12:00:00Z");

describe("clientCanCancelBooking", () => {
  it("allows an upcoming confirmed booking", () => {
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("allows pending_approval", () => {
    expect(
      clientCanCancelBooking(base({ status: "pending_approval" }), before),
    ).toEqual({ cancellable: true });
  });

  it("allows a paid booking (cancel policy != edit policy) — no paid gate", () => {
    // paidCents is intentionally not an input; a paid booking is still cancellable.
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("allows a meet & greet (unlike edit)", () => {
    // serviceSlug is intentionally not an input; meet & greet is cancellable.
    expect(clientCanCancelBooking(base(), before)).toEqual({
      cancellable: true,
    });
  });

  it("blocks terminal statuses with reason status", () => {
    for (const status of [
      "completed",
      "cancelled",
      "declined",
      "no_show",
    ] as const) {
      expect(clientCanCancelBooking(base({ status }), before)).toEqual({
        cancellable: false,
        reason: "status",
      });
    }
  });

  it("blocks once the booking has started with reason started", () => {
    const after = new Date("2026-07-01T17:00:00Z"); // exactly at start
    expect(clientCanCancelBooking(base(), after)).toEqual({
      cancellable: false,
      reason: "started",
    });
    const later = new Date("2026-07-02T00:00:00Z");
    expect(clientCanCancelBooking(base(), later)).toEqual({
      cancellable: false,
      reason: "started",
    });
  });

  it("checks status before timing (terminal past booking → status)", () => {
    const after = new Date("2026-07-02T00:00:00Z");
    expect(
      clientCanCancelBooking(base({ status: "completed" }), after),
    ).toEqual({
      cancellable: false,
      reason: "status",
    });
  });

  it("cancelLockCopy returns copy for each reason", () => {
    expect(cancelLockCopy("status")).toMatch(/no longer/i);
    expect(cancelLockCopy("started")).toMatch(/contact cal/i);
  });
});
