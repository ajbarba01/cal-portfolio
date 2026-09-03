import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import type {
  FakeResponse,
  FakeSupabaseOptions,
} from "@/test-stubs/fake-supabase";
import type { BookingFormData } from "./booking-form-data";

// The settings/busy-range loader creates its own service client, so it is the
// one collaborator this suite stubs; everything else runs against the fake.
const { loadBookingFormData } = vi.hoisted(() => ({
  loadBookingFormData: vi.fn(),
}));
vi.mock("./booking-form-data", () => ({ loadBookingFormData }));

import { getBookingEditView } from "./booking-edit-view";

const FORM_DATA: BookingFormData = {
  rules: {
    bookingOpenMinute: 480,
    bookingCloseMinute: 1200,
    minLeadTimeHours: 12,
    hardMaxAdvanceDays: 3650,
  },
  initialBusy: [],
  initialPremiumDays: [],
  driveBuffer: {
    origin: { lat: 39.7, lng: -104.9 },
    config: { roadFactor: 1.3, avgSpeedMph: 30, pct: 120 },
  },
};

const SETTINGS_ROW = {
  origin_lat: 39.7,
  origin_lng: -104.9,
  road_factor: 1.3,
  avg_speed_mph: 30,
  auto_approve_threshold_miles: 15,
  hard_cutoff_miles: 40,
  gate_use_road_miles: true,
  booking_open_minute: 480,
  booking_close_minute: 1200,
  min_lead_time_hours: 12,
  auto_confirm_horizon_days: 30,
  hard_max_advance_days: 3650,
  recurrence_generation_horizon_days: 60,
  recurring_discount_pct: 10,
  recurring_min_occurrences: 4,
  cancellation_full_refund_hours: 48,
  late_cancel_refund_pct: 50,
  no_show_charge_pct: 100,
  holiday_dates: [],
  holiday_surcharge_cents: 0,
  drive_buffer_pct: 120,
};

const SERVICE_ROW = {
  id: "service-1",
  slug: "walk",
  name: "Dog Walk",
  description: "A walk",
  pricing_type: "walk",
  pricing_config: {
    modifiers: [],
    constraints: { intervalMin: 30, allowedSpecies: ["dog"] },
  },
  default_duration_min: 30,
};

/** A far-future start keeps the editability cutoff out of the wall clock's way. */
const BOOKING_ROW = {
  id: "booking-1",
  client_id: "client-1",
  status: "pending_approval",
  starts_at: "2099-07-10T16:00:00Z",
  ends_at: "2099-07-10T17:00:00Z",
  series_id: null,
  comments: "gate code 1234",
  quote_inputs: { hours: 2, leashManners: true },
  kiche_applied: false,
  services: { slug: "walk" },
  booking_pets: [{ pet_id: "pet-1" }],
  payments: [],
};

/** The `bookings` reads, in the order the loader opens them: the row, then its fee. */
function tables(
  over: Partial<FakeSupabaseOptions["tables"]> = {},
  booking: FakeResponse = { data: BOOKING_ROW, error: null },
): FakeSupabaseOptions["tables"] {
  return {
    bookings: [booking, { data: { final_cents: 4200 }, error: null }],
    settings: { data: SETTINGS_ROW, error: null },
    profiles: { data: { lat: 39.75, lng: -105.0 }, error: null },
    services: { data: SERVICE_ROW, error: null },
    pets: { data: [], error: null },
    ...over,
  };
}

beforeEach(() => {
  loadBookingFormData.mockResolvedValue({ ok: true, data: FORM_DATA });
});

describe("getBookingEditView", () => {
  it("seeds the edit form from the booking's current values", async () => {
    const client = createFakeSupabase({
      tables: tables({
        pets: {
          data: [
            {
              id: "pet-1",
              name: "Rex",
              species: "dog",
              breed: null,
              notes: null,
              birthdate: null,
              photo_url: "client-1/rex.jpg",
            },
          ],
          error: null,
        },
      }),
    });

    const result = await getBookingEditView(client, "booking-1", "client-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.service.slug).toBe("walk");
    expect(result.data.priorFinalCents).toBe(4200);
    expect(result.data.pets).toEqual([
      {
        id: "pet-1",
        name: "Rex",
        species: "dog",
        breed: null,
        notes: null,
        photoUrl: "https://signed.test/client-1/rex.jpg",
      },
    ]);
    expect(result.data.initial).toEqual({
      startsAtIso: "2099-07-10T16:00:00.000Z",
      endsAtIso: "2099-07-10T17:00:00.000Z",
      petIds: ["pet-1"],
      quantities: { type: "walk", qty: { hours: 2, leashManners: true } },
      comments: "gate code 1234",
      wasConfirmed: false,
      isSeriesOccurrence: false,
    });
    expect(result.data.driveBufferMin).toBeGreaterThan(0);
  });

  it("refuses a booking that belongs to somebody else", async () => {
    const client = createFakeSupabase({ tables: tables() });

    expect(
      await getBookingEditView(client, "booking-1", "someone-else"),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses a booking that is missing", async () => {
    const client = createFakeSupabase({
      tables: tables({}, { data: null, error: null }),
    });

    expect(await getBookingEditView(client, "booking-1", "client-1")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses a booking the client may no longer edit", async () => {
    const client = createFakeSupabase({
      tables: tables(
        {},
        {
          data: { ...BOOKING_ROW, status: "completed" },
          error: null,
        },
      ),
    });

    expect(await getBookingEditView(client, "booking-1", "client-1")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses a booking whose service row has gone", async () => {
    const client = createFakeSupabase({
      tables: tables({ services: { data: null, error: null } }),
    });

    expect(await getBookingEditView(client, "booking-1", "client-1")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("reports booking settings that will not load as unavailable", async () => {
    loadBookingFormData.mockResolvedValue({ ok: false });
    const client = createFakeSupabase({ tables: tables() });

    expect(await getBookingEditView(client, "booking-1", "client-1")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("signs the client's pet photos in one batched request", async () => {
    const client = createFakeSupabase({
      tables: tables({
        pets: {
          data: [
            {
              id: "pet-1",
              name: "Rex",
              species: "dog",
              breed: null,
              notes: null,
              birthdate: null,
              photo_url: "client-1/rex.jpg",
            },
            {
              id: "pet-2",
              name: "Sky",
              species: "dog",
              breed: null,
              notes: null,
              birthdate: null,
              photo_url: "client-1/sky.jpg",
            },
          ],
          error: null,
        },
      }),
    });

    await getBookingEditView(client, "booking-1", "client-1");

    expect(client.calls({ method: "createSignedUrls" })).toHaveLength(1);
    expect(client.calls({ method: "createSignedUrl" })).toEqual([]);
  });
});
