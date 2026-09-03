/**
 * The house-sitting approval rule, against an in-memory repository.
 *
 * Split out of booking-service.integration.test.ts, which needs no database for
 * any of it. Two things are pinned. First, a stay always lands in Cal's queue,
 * whatever the distance gate and the service's own `requires_approval` flag
 * would have said on their own. Second, a stay is checked against the published
 * night set and never against the intraday availability windows: one occurrence
 * spans N×24h, so it can never fit a window, and a version that consulted them
 * would refuse every stay ever booked.
 */

import { describe, it, expect, vi } from "vitest";

import { computeBookingArtifacts, createBookingCore } from "./booking-service";
import type { BookingRepository } from "./booking-repository";
import { CLIENT_POLICY } from "./mutation-policy";

const HOUSE_SIT_NOW = new Date("2026-06-10T12:00:00Z");
const HOUSE_SIT_USER = "b0000000-0000-4000-8000-000000000001";

/** ~5 mi north of the settings origin — inside the 8 mi auto-approve threshold. */
const NEAR_LAT = 40.087;
const NEAR_LNG = -105.27;

/** House-sitting service row: requires_approval explicitly false. */
const houseSittingService = {
  id: "svc-house-sit",
  slug: "house-sitting",
  pricing_type: "house_sitting" as const,
  pricing_config: {
    modifiers: [
      { kind: "base_per_night", cents: 6000 },
      {
        kind: "tiered_per_unit",
        unit: "dog",
        tiers: [{ from: 2, cents: 1500 }],
      },
      { kind: "flat_per_unit", unit: "cat", cents: 800 },
      {
        kind: "allowance_then_per_unit",
        unit: "mile",
        label: "Travel",
        freeUnits: 5,
        cents: 250,
      },
    ],
    constraints: { intervalMin: 60, allowedSpecies: ["dog", "cat"] },
  },
  concurrency: "resident" as const,
  requires_approval: false, // explicitly off — the house-sit rule must override
  form_key: null,
};

const HOUSE_SIT_SETTINGS = {
  origin_lat: 40.015,
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
  holiday_dates: [] as string[],
  holiday_surcharge_cents: 0,
  drive_buffer_pct: 0,
};

function makeHouseSitRepo(
  openNights: Set<string> = new Set(),
): BookingRepository {
  return {
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getServiceBySlug: vi.fn(async () => houseSittingService),
    getSettings: vi.fn(async () => HOUSE_SIT_SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: NEAR_LAT, lng: NEAR_LNG })),
    getPetsByIds: vi.fn(async () => []),
    getFormStatuses: vi.fn(async () => [
      { formKey: "owner", petId: null, submittedAt: "2026-06-10T00:00:00Z" },
      {
        formKey: "home_access",
        petId: null,
        submittedAt: "2026-06-10T00:00:00Z",
      },
      {
        formKey: "home_sitting",
        petId: null,
        submittedAt: "2026-06-10T00:00:00Z",
      },
    ]),
    getOpenWindows: vi.fn(async () => []),
    getOpenNights: vi.fn(async () => openNights),
    getActiveBusyRanges: vi.fn(async () => []),
    insertBookings: vi.fn(async () => ["bk-hs-1"]),
    insertBookingPets: vi.fn(async () => {}),
    insertSeries: vi.fn(async () => "series-hs-1"),
    deleteSeries: vi.fn(async () => {}),
    getServiceById: vi.fn(),
    getBookingById: vi.fn(),
    updateBookingStatus: vi.fn(),
    getBookingTimes: vi.fn(),
    updateBookingTimes: vi.fn(),
    getActiveSeries: vi.fn(),
    getMaterializedOccurrenceStarts: vi.fn(),
    getBookingWithPayments: vi.fn(),
    insertDebit: vi.fn(),
    settleDebit: vi.fn(),
    getActiveBusyRangesEnriched: vi.fn(),
    getBookingForEdit: vi.fn(),
    updateBookingEdited: vi.fn(),
    swapBookingPets: vi.fn(),
    appendSeriesSkip: vi.fn(),
  } as unknown as BookingRepository;
}

describe("computeBookingArtifacts — house-sitting approval gate", () => {
  it("house-sitting always requires approval regardless of the service flag", async () => {
    // The client is near (<8 mi), so distance alone would auto-approve.
    // The service has requires_approval=false, so the service flag alone would auto-approve.
    // The house-sitting rule must force requiresApproval=true regardless.
    const repo = makeHouseSitRepo();
    const result = await computeBookingArtifacts(
      { repo, now: HOUSE_SIT_NOW },
      {
        userId: HOUSE_SIT_USER,
        serviceSlug: "house-sitting",
        startsAt: new Date("2026-06-20T17:00:00Z"),
        endsAt: new Date("2026-06-22T17:00:00Z"), // 2-night stay
        quantities: { dogs: 1, cats: 0, nights: 2 },
        recurringRule: null,
      },
      CLIENT_POLICY,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.artifacts.requiresApproval).toBe(true);
    expect(
      result.artifacts.approvalReasons.some(
        (r) => r.code === "service_manual_only",
      ),
    ).toBe(true);
  });

  // A multi-day stay is ONE occurrence spanning N×24h — it can never fit an
  // intraday availability_window. House_sitting is gated by overnight_nights
  // instead; these two cases pin that the server uses the night set, not windows.
  const HS_STAY = {
    userId: HOUSE_SIT_USER,
    serviceSlug: "house-sitting",
    startsAt: new Date("2026-06-20T17:00:00Z"),
    endsAt: new Date("2026-06-22T17:00:00Z"), // nights 06-20, 06-21
    quantities: { dogs: 1, cats: 0, nights: 2 },
    recurringRule: null,
  };
  // Enforce availability but skip the forms gate so the test isolates the night
  // check (the mock's form set is incidental to overnight availability).
  const HS_POLICY = { ...CLIENT_POLICY, skipFormsGate: true };

  it("house-sitting create: succeeds when every covered night is published (no windows)", async () => {
    const repo = makeHouseSitRepo(new Set(["2026-06-20", "2026-06-21"]));
    const result = await createBookingCore(
      { repo, now: HOUSE_SIT_NOW },
      HS_STAY,
      HS_POLICY,
    );
    expect(result.kind).toBe("success");
    // Window list must be irrelevant — never consulted for house_sitting.
    expect(repo.getOpenWindows).not.toHaveBeenCalled();
    // And the night set has to be read as of the injected clock, or a stay
    // starting today is measured against yesterday's published nights.
    expect(repo.getOpenNights).toHaveBeenCalledWith(HOUSE_SIT_NOW);
  });

  it("house-sitting create: unavailable when a covered night is unpublished", async () => {
    const repo = makeHouseSitRepo(new Set(["2026-06-20"])); // 06-21 missing
    const result = await createBookingCore(
      { repo, now: HOUSE_SIT_NOW },
      HS_STAY,
      HS_POLICY,
    );
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toMatch(/overnight availability/i);
    }
  });
});
