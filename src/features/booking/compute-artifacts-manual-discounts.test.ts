/**
 * Manual discounts surviving a re-quote, against an in-memory repository.
 *
 * Split out of booking-service.integration.test.ts, which needs no database for
 * any of it. Every re-quote — an edit, a reschedule, a series roll — rebuilds
 * the price from the booking's quantities, so a discount Cal applied by hand has
 * to be carried in from the stored quote or the next unrelated edit silently
 * undoes it. The pure half of this (toggling ids, re-pricing one input) lives in
 * manual-discounts.test.ts; what is pinned here is the carry-through across the
 * whole artifact pipeline.
 */

import { describe, it, expect, vi } from "vitest";

import { computeBookingArtifacts } from "./booking-service";
import type { CreateBookingInput } from "./booking-service";
import type { BookingRepository } from "./booking-repository";
import { requoteWithManual } from "./manual-discounts";
import { CLIENT_POLICY } from "./mutation-policy";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";

/** check-in at $30/h, two manual discounts, travel billed past five miles. */
const MANUAL_DISCOUNT_SERVICE = {
  id: "svc-checkin",
  slug: "check-in",
  pricing_type: "check_in",
  pricing_config: {
    modifiers: [
      { kind: "base_per_hour", cents: 3000 },
      {
        kind: "pct_discount",
        id: "friends_family",
        label: "Friends & Family (−50%)",
        pct: 50,
        condition: "always",
        manual: true,
      },
      {
        kind: "pct_discount",
        id: "complimentary",
        label: "Complimentary",
        pct: 100,
        condition: "always",
        manual: true,
      },
      {
        kind: "allowance_then_per_unit",
        unit: "mile",
        label: "Travel",
        freeUnits: 5,
        cents: 100,
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
  },
  concurrency: "exclusive",
  requires_approval: false,
  form_key: null,
};

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
  holiday_dates: [] as string[],
  holiday_surcharge_cents: 0,
  drive_buffer_pct: 0,
};

/** ~10 miles north of the settings origin, so travel actually bills. */
const TEN_MILES_NORTH = { lat: 40.145, lng: -105.27 };

const MANUAL_DISCOUNT_INPUT: CreateBookingInput = {
  userId: USER,
  serviceSlug: "check-in",
  startsAt: new Date("2026-06-20T16:00:00Z"),
  endsAt: new Date("2026-06-20T17:00:00Z"),
  quantities: { hours: 1 },
  recurringRule: null,
};

/** Only the reads `computeBookingArtifacts` makes; the rest of the interface is inert. */
function makeManualDiscountRepo(): BookingRepository {
  return {
    getServiceBySlug: vi.fn(async () => MANUAL_DISCOUNT_SERVICE),
    getSettings: vi.fn(async () => SETTINGS),
    getProfileLatLng: vi.fn(async () => TEN_MILES_NORTH),
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved"),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
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
    getOpenWindows: vi.fn(async () => [
      {
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T20:00:00Z"),
      },
    ]),
    getActiveBusyRanges: vi.fn(async () => []),
  } as unknown as BookingRepository;
}

async function requoteWithStored(storedQuoteInputs: unknown) {
  const result = await computeBookingArtifacts(
    { repo: makeManualDiscountRepo(), now: NOW },
    MANUAL_DISCOUNT_INPUT,
    CLIENT_POLICY,
    { applyKiche: false, storedQuoteInputs },
  );
  if (result.kind !== "success") {
    throw new Error(`expected success, got ${result.kind}`);
  }
  return result.artifacts;
}

describe("computeBookingArtifacts — manual discount carry-through", () => {
  // 1h at $30 = 3000, plus travel: ~10.02 straight-line miles × 1.3 road
  // factor = 13.02, less the 5 free = 8.02 billable at $1 = 802.
  const TRAVEL = 802;
  const UNDISCOUNTED = 3000 + TRAVEL;

  it("prices a booking that carries no manual discount at full rate", async () => {
    const artifacts = await requoteWithStored(undefined);
    expect(artifacts.breakdown.finalCents).toBe(UNDISCOUNTED);
    expect(artifacts.quoteInput.enabledManualIds).toEqual([]);
  });

  it("keeps a discount Cal applied when an unrelated edit re-quotes", async () => {
    const artifacts = await requoteWithStored({
      enabledManualIds: ["friends_family"],
    });

    expect(artifacts.quoteInput.enabledManualIds).toEqual(["friends_family"]);
    // 3000 −50% = 1500, plus the travel no discount touches.
    expect(artifacts.breakdown.finalCents).toBe(1500 + TRAVEL);
    expect(artifacts.breakdown.lines.map((line) => line.label)).toContain(
      "Friends & Family (−50%)",
    );
  });

  it("re-quotes a complimentary booking to zero, travel included", async () => {
    const artifacts = await requoteWithStored({
      enabledManualIds: ["complimentary"],
    });
    expect(artifacts.breakdown.finalCents).toBe(0);
  });

  it("freezes the real miles on a complimentary booking so removing it restores travel", async () => {
    // The quote drops the travel line, but the input written to the booking
    // keeps the miles — otherwise the next re-quote after Cal removes the
    // discount has no travel to bill and undercharges for the trip.
    const artifacts = await requoteWithStored({
      enabledManualIds: ["complimentary"],
    });

    expect(artifacts.quoteInput.billableMiles).toBeGreaterThan(0);
    expect(
      requoteWithManual(artifacts.quoteInput, "complimentary", false)
        .finalCents,
    ).toBe(UNDISCOUNTED);
  });

  it("carries a one-off adjustment recorded on the stored quote", async () => {
    const artifacts = await requoteWithStored({
      customAdjustments: [{ label: "Goodwill", amountCents: 500 }],
    });
    expect(artifacts.breakdown.finalCents).toBe(UNDISCOUNTED - 500);
  });

  it("ignores a legacy or malformed stored quote", async () => {
    const artifacts = await requoteWithStored({});
    expect(artifacts.breakdown.finalCents).toBe(UNDISCOUNTED);
  });
});
