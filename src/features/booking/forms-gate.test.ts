/**
 * Unit tests for the required-forms booking gate in computeBookingArtifacts.
 *
 * Follows the fake-repo pattern established in
 * src/features/booking/mutations/create-booking.mutation.test.ts.
 * No real DB; all deps are injected vi.fn stubs.
 *
 * Gate rule: a service with form_key != null requires the client to have a
 * matching row in form_responses (repo.hasFormResponse). A service with
 * form_key = null has no form requirement (gate trivially passes).
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeBookingArtifacts,
  type CreateBookingInput,
} from "./booking-service-shared";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import type { BookingRepository, SettingsRow } from "./booking-repository";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-10T12:00:00Z");
const USER_ID = "11111111-1111-4111-a111-111111111111";

/** Permissive settings so all guards pass in core. */
const settings = {
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
} satisfies SettingsRow;

/** Near-origin lat so approval auto-confirms (< 8 mi). */
const NEAR_LAT = 40.087;
const NEAR_LNG = -105.27;

/** A walk service WITHOUT a required form. */
const walkServiceNoForm = {
  id: "svc-walk",
  slug: "walk",
  pricing_type: "walk" as const,
  pricing_config: {
    rate_cents_per_hour: 3000,
    per_dog_cents: 1000,
    kiche_discount_pct: 0,
  },
  concurrency: "resident" as const,
  requires_approval: false,
  form_key: null,
};

/** A walk service WITH a required emergency form. */
const walkServiceWithForm = {
  ...walkServiceNoForm,
  form_key: "emergency",
};

/** A minimal valid walk input (start is well within the permissive settings). */
const BASE_INPUT: CreateBookingInput = {
  userId: USER_ID,
  serviceSlug: "walk",
  startsAt: new Date("2026-07-01T14:00:00Z"),
  endsAt: new Date("2026-07-01T15:00:00Z"),
  quantities: { hours: 1, dogs: 1 },
  petIds: [],
  recurringRule: null,
};

// ──────────────────────────────────────────────────────────────────────────────
// Fake-repo factory
// ──────────────────────────────────────────────────────────────────────────────

function makeRepo(opts: {
  service?: typeof walkServiceNoForm | typeof walkServiceWithForm;
  hasFormResponse?: boolean;
}): BookingRepository {
  const { service = walkServiceNoForm, hasFormResponse = true } = opts;
  return {
    getServiceBySlug: vi.fn(async () => service),
    getServiceById: vi.fn(async () => service),
    getSettings: vi.fn(async () => settings),
    getProfileLatLng: vi.fn(async () => ({ lat: NEAR_LAT, lng: NEAR_LNG })),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    getOutstandingDebtCents: vi.fn(async () => 0),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    hasFormResponse: vi.fn(async () => hasFormResponse),
    getOpenWindows: vi.fn(async () => []),
    // unused stubs (satisfy interface)
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
    getPetsByIds: vi.fn(async () => []),
    getActiveBusyRanges: vi.fn(async () => []),
    getActiveBusyRangesEnriched: vi.fn(async () => []),
    getBookingForEdit: vi.fn(async () => null),
    updateBookingEdited: vi.fn(async () => {}),
    swapBookingPets: vi.fn(async () => {}),
    appendSeriesSkip: vi.fn(async () => {}),
  } as unknown as BookingRepository;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("computeBookingArtifacts — forms gate", () => {
  it("passes when the service has no required form (form_key = null)", async () => {
    const repo = makeRepo({
      service: walkServiceNoForm,
      hasFormResponse: false,
    });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("success");
    // hasFormResponse should never be called when form_key is null
    expect(repo.hasFormResponse).not.toHaveBeenCalled();
  });

  it("passes when the service requires a form and the client has submitted it", async () => {
    const repo = makeRepo({
      service: walkServiceWithForm,
      hasFormResponse: true,
    });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("success");
    expect(repo.hasFormResponse).toHaveBeenCalledWith(USER_ID, "emergency");
  });

  it("returns forms_incomplete under CLIENT_POLICY when required form is missing", async () => {
    const repo = makeRepo({
      service: walkServiceWithForm,
      hasFormResponse: false,
    });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("forms_incomplete");
  });

  it("bypasses the forms gate under ADMIN_POLICY (warn-don't-block)", async () => {
    const repo = makeRepo({
      service: walkServiceWithForm,
      hasFormResponse: false,
    });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(
        result.artifacts.warnings.some((w) => w.includes("emergency")),
      ).toBe(true);
    }
  });
});
