/**
 * Integration tests verifying that `computeBookingArtifacts` applies the
 * premium-day surcharge to hourly bookings (walk, check_in, training) when
 * the service day falls on a configured holiday date.
 *
 * Contract:
 *  - Hourly booking on a premium day → "Premium day (1)" add-on line at
 *    settings.holiday_surcharge_cents.
 *  - Hourly booking on a non-premium day → no premium line.
 *  - Client-supplied holidayDays is ignored (server always re-derives).
 *  - meet_greet is free regardless — no premium surcharge.
 *
 * Uses a fake-repo (no real DB — same pattern as holiday-override.test.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { computeBookingArtifacts } from "./booking-service-shared";
import { ADMIN_POLICY } from "./mutation-policy";
import type { BookingRepository, SettingsRow } from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER_ID = "22222222-2222-4222-a222-222222222222";

// Dec 25 at 15:00 UTC → 08:00 MST (Mountain Standard, UTC-7 in December)
const PREMIUM_DAY_START = new Date("2026-12-25T15:00:00Z");
const PREMIUM_DAY_END = new Date("2026-12-25T16:00:00Z");

// Dec 26 (not premium)
const NON_PREMIUM_DAY_START = new Date("2026-12-26T15:00:00Z");
const NON_PREMIUM_DAY_END = new Date("2026-12-26T16:00:00Z");

/** Base settings with Dec 25 as a premium day and $10 surcharge. */
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
    holiday_dates: ["2026-12-25"],
    holiday_surcharge_cents: 1000,
    drive_buffer_pct: 120,
    ...overrides,
  };
}

function makeWalkService() {
  return {
    id: "svc-walk",
    slug: "walk",
    pricing_type: "walk" as const,
    pricing_config: {
      rate_cents_per_hour: 2500,
      per_dog_cents: 1000,
      kiche_discount_pct: 25,
    },
    concurrency: "exclusive" as const,
    requires_approval: false,
    form_key: null,
  };
}

function makeCheckInService() {
  return {
    id: "svc-ci",
    slug: "check-in",
    pricing_type: "check_in" as const,
    pricing_config: {
      rate_cents_per_hour: 3000,
      minimum_cents: 1500,
    },
    concurrency: "exclusive" as const,
    requires_approval: false,
    form_key: null,
  };
}

function makeTrainingService() {
  return {
    id: "svc-train",
    slug: "training",
    pricing_type: "training" as const,
    pricing_config: {
      rate_cents_per_hour: 3500,
    },
    concurrency: "exclusive" as const,
    requires_approval: false,
    form_key: null,
  };
}

function makeRepo(
  settings: SettingsRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
): BookingRepository {
  return {
    getServiceBySlug: vi.fn(async () => service),
    getServiceById: vi.fn(async () => service),
    getSettings: vi.fn(async () => settings),
    // Same as origin → 0 distance → no travel charge (keeps expected values simple).
    getProfileLatLng: vi.fn(async () => ({ lat: 40.015, lng: -105.27 })),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    getOutstandingDebtCents: vi.fn(async () => 0),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    hasFormResponse: vi.fn(async () => true),
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
    getPetsByIds: vi.fn(async () => []),
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

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

describe("computeBookingArtifacts — hourly holiday surcharge (walk)", () => {
  it("walk on a premium day → 'Premium day (1)' line at holiday_surcharge_cents", async () => {
    // 1h walk + 1 dog on Dec 25 (premium)
    // base: 2500 (hours) + 1000 (dog) = 3500
    // + premium day: 1000
    // total: 4500
    const settings = makeSettings();
    const repo = makeRepo(settings, makeWalkService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "walk",
        startsAt: PREMIUM_DAY_START,
        endsAt: PREMIUM_DAY_END,
        quantities: { hours: 1, dogs: 1 },
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
    expect(premiumLine!.amountCents).toBe(1000);
    expect(result.artifacts.breakdown.finalCents).toBe(4500);
  });

  it("walk on a non-premium day → no premium line", async () => {
    const settings = makeSettings();
    const repo = makeRepo(settings, makeWalkService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "walk",
        startsAt: NON_PREMIUM_DAY_START,
        endsAt: NON_PREMIUM_DAY_END,
        quantities: { hours: 1, dogs: 1 },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(
      result.artifacts.breakdown.lines.find((l) =>
        l.label.toLowerCase().includes("premium"),
      ),
    ).toBeUndefined();
    expect(result.artifacts.breakdown.finalCents).toBe(3500);
  });

  it("walk on premium day: client-supplied holidayDays is ignored", async () => {
    // Client sends holidayDays:0, server should derive 1 and apply surcharge.
    const settings = makeSettings();
    const repo = makeRepo(settings, makeWalkService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "walk",
        startsAt: PREMIUM_DAY_START,
        endsAt: PREMIUM_DAY_END,
        // holidayDays not a recognized client quantity — just verify surcharge present
        quantities: { hours: 1, dogs: 1, holidayDays: 0 },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    // Server derives 1 → premium line must be present despite client sending 0.
    const premiumLine = result.artifacts.breakdown.lines.find((l) =>
      l.label.toLowerCase().includes("premium"),
    );
    expect(premiumLine).toBeDefined();
    expect(premiumLine!.amountCents).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// check_in
// ---------------------------------------------------------------------------

describe("computeBookingArtifacts — hourly holiday surcharge (check_in)", () => {
  it("check_in on a premium day → premium line at holiday_surcharge_cents", async () => {
    // 1h × $30 = $30 base + $10 premium = $40
    const settings = makeSettings();
    const repo = makeRepo(settings, makeCheckInService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "check-in",
        startsAt: PREMIUM_DAY_START,
        endsAt: PREMIUM_DAY_END,
        quantities: { hours: 1 },
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
    expect(premiumLine!.amountCents).toBe(1000);
    expect(result.artifacts.breakdown.finalCents).toBe(4000);
  });

  it("check_in on a non-premium day → no premium line", async () => {
    const settings = makeSettings();
    const repo = makeRepo(settings, makeCheckInService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "check-in",
        startsAt: NON_PREMIUM_DAY_START,
        endsAt: NON_PREMIUM_DAY_END,
        quantities: { hours: 1 },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(
      result.artifacts.breakdown.lines.find((l) =>
        l.label.toLowerCase().includes("premium"),
      ),
    ).toBeUndefined();
    expect(result.artifacts.breakdown.finalCents).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// training
// ---------------------------------------------------------------------------

describe("computeBookingArtifacts — hourly holiday surcharge (training)", () => {
  it("training on a premium day → premium line at holiday_surcharge_cents", async () => {
    // 1h × $35 = $35 base + $10 premium = $45
    const settings = makeSettings();
    const repo = makeRepo(settings, makeTrainingService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "training",
        startsAt: PREMIUM_DAY_START,
        endsAt: PREMIUM_DAY_END,
        quantities: { hours: 1 },
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
    expect(premiumLine!.amountCents).toBe(1000);
    expect(result.artifacts.breakdown.finalCents).toBe(4500);
  });

  it("training on a non-premium day → no premium line", async () => {
    const settings = makeSettings();
    const repo = makeRepo(settings, makeTrainingService());
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      {
        userId: USER_ID,
        serviceSlug: "training",
        startsAt: NON_PREMIUM_DAY_START,
        endsAt: NON_PREMIUM_DAY_END,
        quantities: { hours: 1 },
        recurringRule: null,
      },
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(
      result.artifacts.breakdown.lines.find((l) =>
        l.label.toLowerCase().includes("premium"),
      ),
    ).toBeUndefined();
    expect(result.artifacts.breakdown.finalCents).toBe(3500);
  });
});
