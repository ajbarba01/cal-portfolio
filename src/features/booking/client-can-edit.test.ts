import { describe, it, expect } from "vitest";
import { clientCanEditBooking, type EditabilityInput } from "./client-can-edit";

const HOURS = 48;
const base = (over: Partial<EditabilityInput> = {}): EditabilityInput => ({
  status: "confirmed",
  startsAt: new Date("2026-07-01T17:00:00Z"),
  paidCents: 0,
  serviceSlug: "dog-walk",
  ...over,
});
const now = new Date("2026-06-20T12:00:00Z"); // well before cutoff

describe("clientCanEditBooking", () => {
  it("allows an upcoming, unpaid, confirmed, non-meet-greet booking", () => {
    expect(clientCanEditBooking(base(), now, HOURS)).toEqual({
      editable: true,
    });
  });

  it("allows pending_approval", () => {
    expect(
      clientCanEditBooking(base({ status: "pending_approval" }), now, HOURS),
    ).toEqual({ editable: true });
  });

  it("blocks meet-greet with reason meet_greet (highest precedence)", () => {
    expect(
      clientCanEditBooking(
        base({ serviceSlug: "meet-greet", paidCents: 100 }),
        now,
        HOURS,
      ),
    ).toEqual({ editable: false, reason: "meet_greet" });
  });

  it("blocks terminal/non-editable statuses with reason status", () => {
    for (const status of [
      "completed",
      "cancelled",
      "declined",
      "no_show",
    ] as const) {
      expect(clientCanEditBooking(base({ status }), now, HOURS)).toEqual({
        editable: false,
        reason: "status",
      });
    }
  });

  it("blocks a paid booking with reason paid", () => {
    expect(clientCanEditBooking(base({ paidCents: 4500 }), now, HOURS)).toEqual(
      {
        editable: false,
        reason: "paid",
      },
    );
  });

  it("blocks inside the cancellation cutoff with reason cutoff", () => {
    const insideCutoff = new Date("2026-06-30T00:00:00Z"); // < 48h before 07-01 17:00Z
    expect(clientCanEditBooking(base(), insideCutoff, HOURS)).toEqual({
      editable: false,
      reason: "cutoff",
    });
  });

  it("treats a past booking as cutoff (now far past start)", () => {
    const after = new Date("2026-07-02T00:00:00Z");
    expect(clientCanEditBooking(base(), after, HOURS)).toEqual({
      editable: false,
      reason: "cutoff",
    });
  });
});
