/**
 * Unit tests for the required-PROFILES booking gate.
 *
 * Follows the fake-repo pattern established in
 * src/features/booking/mutations/create-booking.mutation.test.ts.
 * No real DB; all deps are injected vi.fn stubs.
 *
 * Gate rule (split across two layers):
 *   - computeBookingArtifacts ALWAYS computes the quote and surfaces the
 *     required-profiles checklist as `artifacts.requirements` — the price
 *     receipt never depends on the forms being complete.
 *   - The COMMIT cores (createBookingCore / editBookingCore) enforce the gate:
 *     a missing or stale required profile → CLIENT_POLICY blocks with
 *     `profiles_incomplete`; ADMIN_POLICY (skipFormsGate) warns instead.
 *
 * A profile is complete only when submitted/confirmed within FRESHNESS_WINDOW_DAYS
 * of `now`. Per-pet 'pet' items are vacuous when no pets are assigned, so a walk
 * with owner complete + no pets passes. services.form_key is legacy and no longer
 * consulted.
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeBookingArtifacts,
  type CreateBookingInput,
} from "./booking-service-shared";
import { createBookingCore } from "./create-core";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import { FRESHNESS_WINDOW_DAYS } from "./required-profiles";
import type { BookingRepository, SettingsRow } from "./booking-repository";

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-16T12:00:00Z");
const USER_ID = "11111111-1111-4111-a111-111111111111";

const FRESH_OWNER = {
  formKey: "owner",
  petId: null,
  submittedAt: "2026-06-10T00:00:00Z", // ~6 days old → within window
};
const STALE_OWNER = {
  formKey: "owner",
  petId: null,
  submittedAt: "2025-01-01T00:00:00Z", // > 180 days old
};

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
  holiday_surcharge_cents: 0,
  drive_buffer_pct: 120,
} satisfies SettingsRow;

/** Near-origin lat so approval auto-confirms (< 8 mi). */
const NEAR_LAT = 40.087;
const NEAR_LNG = -105.27;

/** A walk service (manifest: owner + pet). */
const walkService = {
  id: "svc-walk",
  slug: "walk",
  pricing_type: "walk" as const,
  pricing_config: {
    modifiers: [{ kind: "base_per_hour", cents: 3000 }],
    constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
  },
  concurrency: "resident" as const,
  requires_approval: false,
  form_key: null,
};

/** A minimal valid walk input (no pets assigned → 'pet' requirement vacuous). */
const BASE_INPUT: CreateBookingInput = {
  userId: USER_ID,
  serviceSlug: "walk",
  startsAt: new Date("2026-07-01T14:00:00Z"),
  endsAt: new Date("2026-07-01T15:00:00Z"),
  quantities: { hours: 1, dogs: 1 },
  petIds: [],
  recurringRule: null,
};

type FormStatus = {
  formKey: string;
  petId: string | null;
  submittedAt: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Fake-repo factory
// ──────────────────────────────────────────────────────────────────────────────

function makeRepo(opts: { formStatuses?: FormStatus[] }): BookingRepository {
  const { formStatuses = [FRESH_OWNER] } = opts;
  return {
    getServiceBySlug: vi.fn(async () => walkService),
    getServiceById: vi.fn(async () => walkService),
    getSettings: vi.fn(async () => settings),
    getProfileLatLng: vi.fn(async () => ({ lat: NEAR_LAT, lng: NEAR_LNG })),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    getOutstandingDebtCents: vi.fn(async () => 0),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    hasFormResponse: vi.fn(async () => true),
    getFormStatuses: vi.fn(async () => formStatuses),
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

describe("computeBookingArtifacts — receipt computes regardless of forms", () => {
  it("passes when every required profile is complete (owner fresh, pet vacuous with no pets)", async () => {
    const repo = makeRepo({ formStatuses: [FRESH_OWNER] });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("success");
  });

  it("still computes the quote under CLIENT_POLICY when a required profile is missing, surfacing it in artifacts.requirements", async () => {
    const repo = makeRepo({ formStatuses: [] });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    // The price receipt must NOT depend on form state — success, with a quote.
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.artifacts.breakdown.finalCents).toBeGreaterThan(0);
      expect(result.artifacts.requirements).toContainEqual({
        formKey: "owner",
        status: "missing",
      });
    }
  });

  it("still computes the quote when a required profile is stale, surfacing it in artifacts.requirements", async () => {
    const repo = makeRepo({ formStatuses: [STALE_OWNER] });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.artifacts.requirements).toContainEqual({
        formKey: "owner",
        status: "stale",
      });
    }
  });

  it("warns (warn-don't-block) under ADMIN_POLICY when a required profile is missing", async () => {
    const repo = makeRepo({ formStatuses: [] });
    const result = await computeBookingArtifacts(
      { repo, now: NOW },
      BASE_INPUT,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.artifacts.warnings.some((w) => w.includes("owner"))).toBe(
        true,
      );
    }
  });

  it("sanity-checks the freshness window constant is the agreed 180 days", () => {
    expect(FRESHNESS_WINDOW_DAYS).toBe(180);
  });
});

describe("createBookingCore — forms gate enforced on commit", () => {
  it("blocks with profiles_incomplete under CLIENT_POLICY when a required profile is missing", async () => {
    const repo = makeRepo({ formStatuses: [] });
    const result = await createBookingCore(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("profiles_incomplete");
    if (result.kind === "profiles_incomplete") {
      expect(result.requirements).toContainEqual({
        formKey: "owner",
        status: "missing",
      });
    }
  });

  it("blocks with profiles_incomplete under CLIENT_POLICY when a required profile is stale", async () => {
    const repo = makeRepo({ formStatuses: [STALE_OWNER] });
    const result = await createBookingCore(
      { repo, now: NOW },
      BASE_INPUT,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("profiles_incomplete");
  });
});
