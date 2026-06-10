/**
 * Unit tests for createBookingMutation.
 *
 * Tests the auth-free orchestration layer: core delegation + best-effort email.
 * No Next.js runtime, no real DB. All deps are stubbed.
 */

import { describe, it, expect, vi } from "vitest";
import { createBookingMutation } from "./create-booking.mutation";
import type { CreateBookingMutationDeps } from "./create-booking.mutation";
import type { BookingRepository, SettingsRow } from "../booking-repository";
import type { Notifier } from "@/features/notifications";
import type { CreateBookingInput } from "../create-core";

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
} satisfies SettingsRow;

/** Near-origin lat so approval auto-confirms (< 8 mi). */
const NEAR_LAT = 40.087;
const NEAR_LNG = -105.27;

const USER_ID = "11111111-1111-4111-a111-111111111111";
const USER_EMAIL = "client@example.com";

/** A walk service stub — sufficient for createBookingCore to quote it. */
const walkService = {
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
};

/** A single 1h window that covers our test slot. */
const WINDOW = {
  startsAt: new Date("2026-07-01T14:00:00Z"),
  endsAt: new Date("2026-07-01T16:00:00Z"),
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

function makeNotifier(
  opts: { failNotify?: boolean; throwNotify?: boolean } = {},
): Notifier & { notify: ReturnType<typeof vi.fn> } {
  const notify = vi.fn(async () => {
    if (opts.throwNotify) throw new Error("SMTP unavailable");
    // best-effort: notify never rejects (failures are swallowed inside ResendNotifier)
    // For the failNotify stub we just resolve (notifier swallows errors internally)
  });
  return { notify };
}

/** Stub for loadConfirmationRow — returns a valid booking row for email. */
const stubLoadRow = vi.fn(async () => ({
  starts_at: "2026-07-01T14:00:00Z",
  ends_at: "2026-07-01T15:00:00Z",
  final_cents: 3000,
  services: { name: "Walk" },
}));

function makeDeps(
  repoOverrides: Parameters<typeof makeRepo>[0] = {},
  notifierOpts: Parameters<typeof makeNotifier>[0] = {},
  loadRow: CreateBookingMutationDeps["loadConfirmationRow"] = stubLoadRow,
): CreateBookingMutationDeps {
  return {
    repo: makeRepo(repoOverrides),
    notifier: makeNotifier(notifierOpts),
    loadConfirmationRow: loadRow,
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
      userEmail: USER_EMAIL,
    });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.bookingIds).toEqual(["bk-111"]);
    }
  });

  it("sends confirmation notification on success and does NOT alter result when notify succeeds", async () => {
    const deps = makeDeps();
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    expect(result.kind).toBe("success");
    // notifier.notify was called once
    expect(
      (deps.notifier as ReturnType<typeof makeNotifier>).notify,
    ).toHaveBeenCalledTimes(1);
    // result still has the expected structure
    if (result.kind === "success") {
      expect(result.bookingIds).toHaveLength(1);
    }
  });

  it("does NOT alter success result when notifier resolves silently (best-effort)", async () => {
    const deps = makeDeps({}, { failNotify: true });
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    // Core succeeded — email failure must NOT change the result kind
    expect(result.kind).toBe("success");
  });

  it("does NOT alter success result when notifier throws (best-effort)", async () => {
    const throwingNotifier: Notifier = {
      notify: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };
    const deps: CreateBookingMutationDeps = {
      repo: makeRepo(),
      notifier: throwingNotifier,
      loadConfirmationRow: stubLoadRow,
      now: NOW,
    };

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    expect(result.kind).toBe("success");
  });

  it("skips email when userEmail is undefined", async () => {
    const notifier = makeNotifier();
    const deps: CreateBookingMutationDeps = {
      repo: makeRepo(),
      notifier,
      loadConfirmationRow: stubLoadRow,
      now: NOW,
    };

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: undefined,
    });

    expect(result.kind).toBe("success");
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("skips email when loadConfirmationRow fails to parse (best-effort)", async () => {
    const badLoadRow = vi.fn(async () => null);
    const notifier = makeNotifier();
    const deps: CreateBookingMutationDeps = {
      repo: makeRepo(),
      notifier,
      loadConfirmationRow: badLoadRow,
      now: NOW,
    };

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    // Still success — email step is best-effort
    expect(result.kind).toBe("success");
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it("returns slot_taken when the core signals a conflict", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const deps = makeDeps({ insertThrows: conflict });
    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    expect(result.kind).toBe("slot_taken");
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
      notifier: makeNotifier(),
      loadConfirmationRow: stubLoadRow,
      now: NOW,
    };

    const result = await createBookingMutation(deps, {
      ...BASE_INPUT,
      userId: USER_ID,
      userEmail: USER_EMAIL,
    });

    expect(result.kind).toBe("refuse");
  });
});
