/**
 * Unit tests verifying that `computeBookingArtifacts` server-overrides any
 * client-supplied `holidayDays` value from the booking dates + settings.
 *
 * The core contract: "money is server-derived". A client submitting
 * `holidayDays: 99` must not get 99× the surcharge — the server recomputes.
 *
 * Uses a fake-repo (no real DB — same pattern as forms-gate.test.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { computeBookingArtifacts } from "./booking-service-shared";
import { ADMIN_POLICY } from "./mutation-policy";
import type { BookingRepository, SettingsRow } from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER_ID = "11111111-1111-4111-a111-111111111111";

/** A house_sitting service stub. */
const houseService = {
  id: "svc-hs",
  slug: "house-sitting",
  pricing_type: "house_sitting" as const,
  pricing_config: {
    base_dog_cents_per_night: 5000,
    base_cat_cents_per_night: 3000,
    extra_dog_cents_per_night: 1500,
    extra_cat_cents_per_night: 1000,
    cant_be_left_alone_cents_per_day: 1000,
    extra_walk_15min_cents_per_day: 500,
    // holiday_cents_per_day: $10 (1000 cents)
    holiday_cents_per_day: 1000,
    kiche_discount_pct: 0,
  },
  concurrency: "resident" as const,
  requires_approval: false,
  form_key: null,
};

/** Settings with Dec 25 marked as a premium day. */
function makeSettings(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    origin_lat: 40.015,
    origin_lng: -105.27,
    road_factor: 1.3,
    avg_speed_mph: 40,
    auto_approve_threshold_miles: 8,
    hard_cutoff_miles: 50,
    gate_use_road_miles: false,
    booking_open_minute: 0,
    booking_close_minute: 1440,
    min_lead_time_hours: 0,
    auto_confirm_horizon_days: 30,
    hard_max_advance_days: 365,
    recurrence_generation_horizon_days: 90,
    recurring_discount_pct: 0,
    recurring_min_occurrences: 2,
    cancellation_full_refund_hours: 24,
    late_cancel_refund_pct: 50,
    no_show_charge_pct: 100,
    holiday_dates: [],
    ...overrides,
  };
}

function makeRepo(settings: SettingsRow): BookingRepository {
  return {
    getServiceBySlug: vi.fn(async () => houseService),
    getServiceById: vi.fn(async () => houseService),
    getSettings: vi.fn(async () => settings),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.087, lng: -105.27 })),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    getOutstandingDebtCents: vi.fn(async () => 0),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    hasFormResponse: vi.fn(async () => true),
    getOpenWindows: vi.fn(async () => []),
    getPetsByIds: vi.fn(async () => []),
    // unused stubs
    insertBookings: vi.fn(async () => ["bk-001"]),
    insertBookingPets: vi.fn(async () => {}),
    insertSeries: vi.fn(async () => "series-1"),
    deleteSeries: vi.fn(async () => {}),
    getBookingById: vi.fn(async () => null),
    updateBookingStatus: vi.fn(async () => {}),
    getBookingTimes: vi.fn(async () => null),
    updateBookingTimes: vi.fn(async () => {}),
    getActiveSeries: vi.fn(async () => []),
    getMaterializedOccurrenceStarts: vi.fn(async () => []),
    getBookingWithPayments: vi.fn(async () => null),
    insertDebit: vi.fn(async () => {}),
    settleDebit: vi.fn(async () => {}),
    getActiveBusyRanges: vi.fn(async () => []),
    getActiveBusyRangesEnriched: vi.fn(async () => []),
    getBookingForEdit: vi.fn(async () => null),
    updateBookingEdited: vi.fn(async () => {}),
    swapBookingPets: vi.fn(async () => {}),
    appendSeriesSkip: vi.fn(async () => {}),
  } as unknown as BookingRepository;
}

describe("computeBookingArtifacts — holiday derivation override", () => {
  it("house_sitting on a non-premium day: no holiday surcharge even if client sends holidayDays=5", async () => {
    // No premium dates configured → holidayDays should be 0 regardless of input.
    const repo = makeRepo(makeSettings({ holiday_dates: [] }));
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "house-sitting",
        // 1-night stay on 2026-12-25 (MST = UTC-7 → midnight = 07:00Z)
        startsAt: new Date("2026-12-25T07:00:00Z"),
        endsAt: new Date("2026-12-26T07:00:00Z"),
        quantities: {
          nights: 1,
          dogs: 1,
          cats: 0,
          // Client fraudulently sends holidayDays: 5 — server must override to 0.
          holidayDays: 5,
        },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // No premium line in the breakdown.
    const premiumLine = result.artifacts.breakdown.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeUndefined();
    // finalCents = base_dog(5000) × 1 night = 5000 (no holiday surcharge).
    expect(result.artifacts.breakdown.finalCents).toBe(5000);
  });

  it("house_sitting spanning 1 premium day: surcharge derived from dates, client value ignored", async () => {
    // Dec 25 is a premium day. Client sends holidayDays: 0 — server should derive 1.
    const repo = makeRepo(makeSettings({ holiday_dates: ["2026-12-25"] }));
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "house-sitting",
        // 1-night stay on Dec 25 → checkout Dec 26.
        startsAt: new Date("2026-12-25T07:00:00Z"),
        endsAt: new Date("2026-12-26T07:00:00Z"),
        quantities: {
          nights: 1,
          dogs: 1,
          cats: 0,
          // Client sends 0 — server derives 1.
          holidayDays: 0,
        },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Premium line must appear with count 1.
    const premiumLine = result.artifacts.breakdown.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(premiumLine!.amountCents).toBe(1000); // holiday_cents_per_day: 1000
    // finalCents = 5000 (base) + 1000 (premium) = 6000.
    expect(result.artifacts.breakdown.finalCents).toBe(6000);
  });

  it("house_sitting reschedule onto premium days recomputes surcharge", async () => {
    // Stay Dec 25 → Dec 27 (2 nights). Both Dec 25 and Dec 26 are premium.
    // Client sends holidayDays: 0 → server should derive 2.
    const repo = makeRepo(
      makeSettings({ holiday_dates: ["2026-12-25", "2026-12-26"] }),
    );
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "house-sitting",
        startsAt: new Date("2026-12-25T07:00:00Z"),
        endsAt: new Date("2026-12-27T07:00:00Z"),
        quantities: { nights: 2, dogs: 1, cats: 0, holidayDays: 0 },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    const premiumLine = result.artifacts.breakdown.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    // 2 premium days × $10/day = $20 = 2000 cents.
    expect(premiumLine!.amountCents).toBe(2000);
  });
});
