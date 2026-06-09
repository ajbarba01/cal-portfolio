import { describe, it, expect, vi } from "vitest";
import { rescheduleBookingCore } from "./booking-service";
import type {
  BookingRepository,
  BookingStatusDb,
  SettingsRow,
} from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "user-1";
const BOOKING = "bk-1";

// All-permissive booking rules so passesGuards is trivially satisfied; the slot
// validation under test is the reschedule flow, not the (separately-tested) guards.
const settings = {
  booking_open_minute: 0,
  booking_close_minute: 1440,
  min_lead_time_hours: 0,
  hard_max_advance_days: 365,
  auto_confirm_horizon_days: 30,
} as unknown as SettingsRow;

const WINDOW = {
  startsAt: new Date("2026-06-12T15:00:00Z"),
  endsAt: new Date("2026-06-12T18:00:00Z"),
};
const NEW_START = new Date("2026-06-12T16:00:00Z"); // inside WINDOW, +2 days

function makeRepo(
  overrides: Partial<{
    booking: {
      id: string;
      client_id: string;
      status: BookingStatusDb;
      startsAt: Date;
      endsAt: Date;
    } | null;
    updateThrows: (Error & { code?: string }) | null;
  }> = {},
) {
  const updateBookingTimes = vi.fn(async () => {
    if (overrides.updateThrows) throw overrides.updateThrows;
  });
  const repo = {
    getBookingTimes: vi.fn(async () =>
      overrides.booking === undefined
        ? {
            id: BOOKING,
            client_id: USER,
            status: "confirmed" as BookingStatusDb,
            startsAt: new Date("2026-06-11T16:00:00Z"),
            endsAt: new Date("2026-06-11T16:30:00Z"), // 30-min duration
          }
        : overrides.booking,
    ),
    getSettings: vi.fn(async () => settings),
    getOpenWindows: vi.fn(async () => [WINDOW]),
    updateBookingTimes,
  } as unknown as BookingRepository & {
    updateBookingTimes: typeof updateBookingTimes;
  };
  return repo;
}

describe("rescheduleBookingCore", () => {
  it("moves a booking in place, preserving its duration", async () => {
    const repo = makeRepo();
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("success");
    expect(repo.updateBookingTimes).toHaveBeenCalledWith(
      BOOKING,
      NEW_START,
      new Date("2026-06-12T16:30:00Z"), // +30 min preserved
    );
  });

  it("returns not_found when the booking is missing", async () => {
    const repo = makeRepo({ booking: null });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("not_found");
  });

  it("forbids rescheduling someone else's booking", async () => {
    const repo = makeRepo({
      booking: {
        id: BOOKING,
        client_id: "someone-else",
        status: "confirmed",
        startsAt: new Date("2026-06-11T16:00:00Z"),
        endsAt: new Date("2026-06-11T16:30:00Z"),
      },
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("rejects a terminal-status booking", async () => {
    const repo = makeRepo({
      booking: {
        id: BOOKING,
        client_id: USER,
        status: "cancelled",
        startsAt: new Date("2026-06-11T16:00:00Z"),
        endsAt: new Date("2026-06-11T16:30:00Z"),
      },
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("surfaces an exclusion violation as slot_taken", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const repo = makeRepo({ updateThrows: conflict });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("slot_taken");
  });

  it("refuses a slot beyond the hard advance cap", async () => {
    const repo = makeRepo();
    // hard_max_advance_days is 365; a 2028 start is well beyond it → refuse.
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        userId: USER,
        startsAt: new Date("2028-01-01T16:00:00Z"),
      },
    );
    expect(result.kind).toBe("refuse");
  });
});
