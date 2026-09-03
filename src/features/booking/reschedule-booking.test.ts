import { describe, it, expect, vi } from "vitest";
import { rescheduleBookingCore } from "./booking-service";
import type {
  BookingRepository,
  BookingStatusDb,
  BusyRange,
  ConcurrencyClass,
  SettingsRow,
} from "./booking-repository";
import type { PricingType } from "@/features/pricing";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "user-1";
const BOOKING = "bk-1";

// Cal's origin and a client about ten straight-line miles from it: at 30 mph
// over a road factor of 1 that is a twenty-minute one-way drive, and a buffer
// percentage of 100 reserves all of it on each side of a visit.
const ORIGIN = { lat: 39.7392, lng: -104.9903 };
const CLIENT = { lat: 39.7392, lng: -104.8093 };

// All-permissive booking rules so passesGuards is trivially satisfied; the slot
// validation under test is the reschedule flow, not the (separately-tested) guards.
const settings = {
  booking_open_minute: 0,
  booking_close_minute: 1440,
  min_lead_time_hours: 0,
  hard_max_advance_days: 365,
  auto_confirm_horizon_days: 30,
  origin_lat: ORIGIN.lat,
  origin_lng: ORIGIN.lng,
  road_factor: 1,
  avg_speed_mph: 30,
  drive_buffer_pct: 100,
} as unknown as SettingsRow;

const WINDOW = {
  startsAt: new Date("2026-06-12T15:00:00Z"),
  endsAt: new Date("2026-06-12T18:00:00Z"),
};
const NEW_START = new Date("2026-06-12T16:00:00Z"); // inside WINDOW, +2 days

/** The reschedule half of a `getBookingTimes` row. */
interface BookingTimes {
  id: string;
  client_id: string;
  status: BookingStatusDb;
  startsAt: Date;
  endsAt: Date;
  pricingType: PricingType;
  concurrency: ConcurrencyClass;
  clientLat: number | null;
  clientLng: number | null;
}

function bookingTimes(overrides: Partial<BookingTimes> = {}): BookingTimes {
  return {
    id: BOOKING,
    client_id: USER,
    status: "confirmed",
    startsAt: new Date("2026-06-11T16:00:00Z"),
    endsAt: new Date("2026-06-11T16:30:00Z"), // 30-min duration
    pricingType: "meet_greet",
    concurrency: "exclusive",
    clientLat: CLIENT.lat,
    clientLng: CLIENT.lng,
    ...overrides,
  };
}

/** Another client's booking on the calendar, at the origin (no buffer of its own). */
function busyRange(startsAt: Date, endsAt: Date): BusyRange {
  return {
    id: "bk-other",
    startsAt,
    endsAt,
    concurrency: "exclusive",
    clientLat: null,
    clientLng: null,
    pets: [],
  };
}

function makeRepo(
  overrides: Partial<{
    booking: BookingTimes | null;
    busyRanges: BusyRange[];
    openNights: Set<string>;
    updateThrows: (Error & { code?: string }) | null;
  }> = {},
) {
  const updateBookingTimes = vi.fn(async () => {
    if (overrides.updateThrows) throw overrides.updateThrows;
  });
  const getActiveBusyRanges = vi.fn(async () => overrides.busyRanges ?? []);
  const repo = {
    getBookingTimes: vi.fn(async () =>
      overrides.booking === undefined ? bookingTimes() : overrides.booking,
    ),
    getSettings: vi.fn(async () => settings),
    getOpenWindows: vi.fn(async () => [WINDOW]),
    getOpenNights: vi.fn(async () => overrides.openNights ?? new Set<string>()),
    getActiveBusyRanges,
    updateBookingTimes,
  } as unknown as BookingRepository & {
    getActiveBusyRanges: typeof getActiveBusyRanges;
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
      booking: bookingTimes({ client_id: "someone-else" }),
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("rejects a terminal-status booking", async () => {
    const repo = makeRepo({ booking: bookingTimes({ status: "cancelled" }) });
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

  it("refuses a move that leaves too little drive time around another booking", async () => {
    // The candidate is 16:00–16:30 padded by the client's ~20-minute buffer, so
    // it reaches into a booking starting at 16:35 that the raw slot clears.
    const repo = makeRepo({
      busyRanges: [
        busyRange(
          new Date("2026-06-12T16:35:00Z"),
          new Date("2026-06-12T17:05:00Z"),
        ),
      ],
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("unavailable");
    // The booking being moved must not block its own move.
    expect(repo.getActiveBusyRanges).toHaveBeenCalledWith(
      NOW,
      "exclusive",
      BOOKING,
    );
  });

  it("allows a move into a slot that is clear of other bookings", async () => {
    // Same candidate, with the other booking far enough away that neither
    // buffer reaches it.
    const repo = makeRepo({
      busyRanges: [
        busyRange(
          new Date("2026-06-12T17:30:00Z"),
          new Date("2026-06-12T17:45:00Z"),
        ),
      ],
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: NEW_START },
    );
    expect(result.kind).toBe("success");
  });

  it("does not apply the buffer to a reschedule that keeps the same time", async () => {
    // A booking already sitting at the very start of the window: padding it
    // would push it outside, so re-submitting its own time must skip the guard.
    const repo = makeRepo({
      booking: bookingTimes({
        startsAt: WINDOW.startsAt,
        endsAt: new Date("2026-06-12T15:30:00Z"),
      }),
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      { bookingId: BOOKING, userId: USER, startsAt: WINDOW.startsAt },
    );
    expect(result.kind).toBe("success");
    expect(repo.getActiveBusyRanges).not.toHaveBeenCalled();
  });

  it("does not apply the buffer to a house-sitting stay", async () => {
    // A stay is resident: it reserves no travel time and fits no intraday
    // window, so the guard would refuse every one of them.
    const repo = makeRepo({
      booking: bookingTimes({
        pricingType: "house_sitting",
        concurrency: "resident",
        startsAt: new Date("2026-06-11T22:00:00Z"),
        endsAt: new Date("2026-06-12T22:00:00Z"),
      }),
      openNights: new Set(["2026-06-12"]),
    });
    const result = await rescheduleBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        userId: USER,
        startsAt: new Date("2026-06-12T22:00:00Z"),
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.getActiveBusyRanges).not.toHaveBeenCalled();
  });
});
