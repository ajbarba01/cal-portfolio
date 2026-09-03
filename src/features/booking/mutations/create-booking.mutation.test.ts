/**
 * Unit tests for createBookingMutation.
 *
 * Tests the auth-free orchestration layer: core delegation + the best-effort
 * hand-off to the confirmation sender. No Next.js runtime, no real DB. All deps
 * are stubbed.
 */

import { assert, describe, it, expect, vi } from "vitest";
import { createBookingMutation } from "./create-booking.mutation";
import type { CreateBookingMutationDeps } from "./create-booking.mutation";
import type { BookingRepository, SettingsRow } from "../booking-repository";
import type { CreateBookingInput } from "../create-core";
import { ADMIN_POLICY } from "../mutation-policy";

// ──────────────────────────────────────────────────────────────────────────────
// Minimal stubs
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-10T12:00:00Z");

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

const USER_ID = "11111111-1111-4111-a111-111111111111";

/** A walk service stub — sufficient for createBookingCore to quote it. */
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

/** A window wide enough to hold the slot PLUS the drive-time buffer on both sides. */
const WINDOW = {
  startsAt: new Date("2026-07-01T13:00:00Z"),
  endsAt: new Date("2026-07-01T17:00:00Z"),
};

/** Minimal CreateBookingInput — no recurrence, one walk with one dog. */
const BASE_INPUT: Omit<CreateBookingInput, "userId"> = {
  serviceSlug: "walk",
  startsAt: new Date("2026-07-01T14:00:00Z"),
  endsAt: new Date("2026-07-01T15:00:00Z"),
  quantities: { hours: 1, dogs: 1 },
  petIds: [],
  recurringRule: null,
};

/** The rows handed to the stub repo's first (and only) insertBookings call. */
function firstInsertedBatch(repo: BookingRepository) {
  const [call] = vi.mocked(repo.insertBookings).mock.calls;
  assert(call, "expected insertBookings to have been called");
  const [rows] = call;
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Factory for stub repo + notifier
// ──────────────────────────────────────────────────────────────────────────────

function makeRepo(
  overrides: {
    insertThrows?: Error & { code?: string };
    insertReturns?: string[];
  } = {},
): BookingRepository {
  return {
    getServiceBySlug: vi.fn(async () => walkService),
    getServiceById: vi.fn(async () => walkService),
    getSettings: vi.fn(async () => settings),
    getProfileLatLng: vi.fn(async () => ({ lat: NEAR_LAT, lng: NEAR_LNG })),
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
    getOpenWindows: vi.fn(async () => [WINDOW]),
    insertBookings: vi.fn(async () => {
      if (overrides.insertThrows) throw overrides.insertThrows;
      return overrides.insertReturns ?? ["bk-001"];
    }),
    insertBookingPets: vi.fn(async () => {}),
    insertSeries: vi.fn(async () => "series-1"),
    deleteSeries: vi.fn(async () => {}),
    // unused stubs (satisfy interface)
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

/** Stub confirmation sender — the real one decides for itself whether to send. */
function makeSendConfirmation(
  opts: { throws?: boolean } = {},
): CreateBookingMutationDeps["sendConfirmation"] & ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    if (opts.throws) throw new Error("SMTP unavailable");
  });
}

function makeDeps(
  repoOverrides: Parameters<typeof makeRepo>[0] = {},
  sendConfirmation = makeSendConfirmation(),
): CreateBookingMutationDeps & {
  sendConfirmation: ReturnType<typeof vi.fn>;
} {
  return {
    repo: makeRepo(repoOverrides),
    sendConfirmation,
    now: NOW,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("createBookingMutation", () => {
  it("delegates to createBookingCore and returns success with bookingIds", async () => {
    const deps = makeDeps({ insertReturns: ["bk-111"] });
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.bookingIds).toEqual(["bk-111"]);
    }
  });

  it("hands the new booking to the confirmation sender exactly once", async () => {
    const deps = makeDeps({ insertReturns: ["bk-111"] });
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });

    expect(result.kind).toBe("success");
    expect(deps.sendConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.sendConfirmation).toHaveBeenCalledWith("bk-111");
  });

  it("sends one confirmation for a series, not one per occurrence", async () => {
    const deps = makeDeps({ insertReturns: ["bk-1", "bk-2", "bk-3"] });
    await createBookingMutation(deps, { ...BASE_INPUT, userId: USER_ID });

    expect(deps.sendConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.sendConfirmation).toHaveBeenCalledWith("bk-1");
  });

  it("does NOT alter the success result when the confirmation sender throws", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps({}, makeSendConfirmation({ throws: true }));

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });

    expect(result.kind).toBe("success");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("does not try to confirm anything when the core did not succeed", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const deps = makeDeps({ insertThrows: conflict });
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });

    expect(result.kind).toBe("slot_taken");
    expect(deps.sendConfirmation).not.toHaveBeenCalled();
  });

  it("passes comments to insertBookings when provided", async () => {
    const repo = makeRepo({ insertReturns: ["bk-comments"] });
    const result = await createBookingMutation(
      { repo, sendConfirmation: makeSendConfirmation(), now: NOW },
      {
        ...BASE_INPUT,
        userId: USER_ID,
        comments: "Please use the side door.",
      },
    );

    expect(result.kind).toBe("success");
    const insertedRows = firstInsertedBatch(repo);
    expect(insertedRows[0]?.comments).toBe("Please use the side door.");
  });

  it("passes null comments to insertBookings when comments not provided", async () => {
    const repo = makeRepo({ insertReturns: ["bk-no-comments"] });
    const result = await createBookingMutation(
      { repo, sendConfirmation: makeSendConfirmation(), now: NOW },
      { ...BASE_INPUT, userId: USER_ID },
    );

    expect(result.kind).toBe("success");
    const insertedRows = firstInsertedBatch(repo);
    expect(insertedRows[0]?.comments).toBeNull();
  });

  it("returns refuse when the core refuses (e.g. too far)", async () => {
    // Repo returns a profile beyond the hard cutoff (refuse > 50 mi)
    const refuseRepo = makeRepo();
    (refuseRepo.getProfileLatLng as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        lat: 41.029, // ~70 mi
        lng: -105.27,
      },
    );
    const deps: CreateBookingMutationDeps = {
      repo: refuseRepo,
      sendConfirmation: makeSendConfirmation(),
      now: NOW,
    };

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });

    expect(result.kind).toBe("refuse");
  });

  it("applies the policy it is given (admin policy skips the client gates)", async () => {
    const repo = makeRepo({ insertReturns: ["bk-admin"] });
    (repo.getOnboardingStatus as ReturnType<typeof vi.fn>).mockResolvedValue(
      "info_pending",
    );
    const deps: CreateBookingMutationDeps = {
      repo,
      sendConfirmation: makeSendConfirmation(),
      now: NOW,
    };

    const asClient = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
    });
    expect(asClient.kind).toBe("onboarding_incomplete");

    const asAdmin = await createBookingMutation(
      deps,
      { ...BASE_INPUT, userId: USER_ID },
      ADMIN_POLICY,
    );
    expect(asAdmin.kind).toBe("success");
  });
});
