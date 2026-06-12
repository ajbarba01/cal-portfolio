import { describe, it, expect, vi } from "vitest";
import { editBookingCore } from "./booking-service";
import { buildEditQuoteInput } from "./edit-core";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { BookingRepository, BookingEditRow } from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const BOOKING = "00000000-0000-4000-8000-000000000002";

// A confirmed, unpaid, standalone check_in booking inside an open window.
function baseRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: BOOKING,
    client_id: USER,
    service_slug: "check-in",
    status: "confirmed",
    startsAt: new Date("2026-06-20T16:00:00Z"),
    endsAt: new Date("2026-06-20T17:00:00Z"),
    series_id: null,
    comments: null,
    quote_inputs: { pricingType: "check_in", hours: 1 },
    petIds: [],
    paidCents: 0,
    ...over,
  };
}

function makeRepo(
  row: BookingEditRow | null,
  over: Partial<Record<string, unknown>> = {},
) {
  const updateBookingEdited = vi.fn(async () => {});
  const swapBookingPets = vi.fn(async () => {});
  const appendSeriesSkip = vi.fn(async () => {});
  return {
    getBookingForEdit: vi.fn(async () => row),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in",
      // Correct field names per checkInConfigSchema: rate_cents_per_hour, minimum_cents
      pricing_config: { rate_cents_per_hour: 3000, minimum_cents: 1500 },
      concurrency: "exclusive",
      requires_approval: false,
    })),
    getSettings: vi.fn(async () => SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.0, lng: -105.27 })),
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved"),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getPetsByIds: vi.fn(async () => []),
    getOpenWindows: vi.fn(async () => [
      {
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T20:00:00Z"),
      },
    ]),
    updateBookingEdited,
    swapBookingPets,
    appendSeriesSkip,
    ...over,
  } as unknown as BookingRepository & {
    updateBookingEdited: typeof updateBookingEdited;
    swapBookingPets: typeof swapBookingPets;
    appendSeriesSkip: typeof appendSeriesSkip;
  };
}

// Settings permissive enough that guards pass for the times above.
const SETTINGS = {
  origin_lat: 40.0,
  origin_lng: -105.27,
  road_factor: 1.3,
  avg_speed_mph: 30,
  auto_approve_threshold_miles: 8,
  hard_cutoff_miles: 50,
  gate_use_road_miles: false,
  booking_open_minute: 0,
  booking_close_minute: 1440,
  min_lead_time_hours: 0,
  auto_confirm_horizon_days: 30,
  hard_max_advance_days: 365,
  recurrence_generation_horizon_days: 42,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 3,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
};

describe("editBookingCore", () => {
  it("rejects a price-affecting edit on a PAID booking", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { quantities: { hours: 2 } },
      },
    );
    expect(result.kind).toBe("price_locked");
  });

  it("allows a time move on a PAID booking (price preserved)", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.updateBookingEdited).toHaveBeenCalled();
  });

  it("forbids editing someone else's booking under client policy", async () => {
    const repo = makeRepo(baseRow({ client_id: "other" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("rejects editing a terminal booking", async () => {
    const repo = makeRepo(baseRow({ status: "cancelled" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("blocks a client edit inside the cancellation cutoff", async () => {
    // Booking starts 24h out; cutoff is 48h → inside cutoff → blocked for client.
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("unavailable");
  });

  it("admin overrides the cancellation cutoff (warns, succeeds)", async () => {
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: "admin",
        policy: ADMIN_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("success");
  });

  it("detaches a series occurrence and records the skip", async () => {
    const repo = makeRepo(baseRow({ series_id: "series-1" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "edited" },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.appendSeriesSkip).toHaveBeenCalledWith(
      "series-1",
      baseRow().startsAt.toISOString(),
    );
    // The persisted update detaches the row.
    expect(repo.updateBookingEdited).toHaveBeenCalledWith(
      BOOKING,
      expect.objectContaining({ series_id: null }),
    );
  });

  it("maps a 23P01 update conflict to slot_taken", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const repo = makeRepo(baseRow(), {
      updateBookingEdited: vi.fn(async () => {
        throw conflict;
      }),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("slot_taken");
  });

  it("returns not_found for a missing booking", async () => {
    const repo = makeRepo(null);
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("not_found");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEditQuoteInput — U24: nights must follow the merged times
// ──────────────────────────────────────────────────────────────────────────────

describe("buildEditQuoteInput (U24)", () => {
  // A 2-night house-sitting stay (6:30am Denver anchors → 12:30Z in June/MDT).
  function hsRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
    return baseRow({
      service_slug: "house-sitting",
      startsAt: new Date("2026-06-19T12:30:00Z"),
      endsAt: new Date("2026-06-21T12:30:00Z"),
      quote_inputs: {}, // legacy/seeded row: nights never stored
      ...over,
    });
  }

  it("derives nights from the merged times when patch and stored inputs lack them", () => {
    // Pure date reschedule, same night count → diff legitimately omits
    // quantities; stored quote_inputs is empty. nights must still be present.
    const { merged } = buildEditQuoteInput(hsRow(), {
      startsAt: new Date("2026-06-24T12:30:00Z"),
      endsAt: new Date("2026-06-26T12:30:00Z"),
    });
    expect(merged.quantities.nights).toBe(2);
  });

  it("recomputes stale stored nights from the merged times", () => {
    // Stored nights says 5 (stale); the merged range is 2 nights.
    const row = hsRow({
      quote_inputs: { pricingType: "house_sitting", nights: 5 },
    });
    const { merged } = buildEditQuoteInput(row, {
      startsAt: new Date("2026-06-24T12:30:00Z"),
      endsAt: new Date("2026-06-26T12:30:00Z"),
    });
    expect(merged.quantities.nights).toBe(2);
  });

  it("leaves hourly bookings without a nights field", () => {
    const { merged } = buildEditQuoteInput(baseRow(), {
      startsAt: new Date("2026-06-20T18:00:00Z"),
      endsAt: new Date("2026-06-20T19:00:00Z"),
    });
    expect(merged.quantities.nights).toBeUndefined();
  });
});
