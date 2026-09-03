/**
 * The create path's policy gates, against an in-memory repository.
 *
 * Split out of booking-service.integration.test.ts: none of this needs a
 * database, and running it there kept ~10 pure cases inside the serialized
 * integration project. What the DB-backed suite still owns is persistence and
 * the exclusion constraint; what is pinned here is the decision each policy
 * makes — client blocks, admin warns — and the arguments the core asks the
 * repository for, since a gate that quietly stops filtering its inputs looks
 * exactly like a gate that passes.
 */

import { describe, it, expect, vi } from "vitest";

import { createBookingCore, computeBookingQuoteCore } from "./booking-service";
import type { CreateBookingInput } from "./booking-service";
import type {
  BookingInsert,
  BookingRepository,
  BusyRange,
} from "./booking-repository";
import { ADMIN_POLICY, CLIENT_POLICY } from "./mutation-policy";

/** Origin and thresholds the distance gate reasons with (mirrors the seed). */
const MOCK_SETTINGS = {
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

/**
 * A minimal in-memory BookingRepository for the policy gates.
 *
 * opts:
 *   outstandingDebtCents — controls the debt gate (default 0)
 *   openWindows          — returned by getOpenWindows (default [])
 *   profileLatLng        — returned by getProfileLatLng (default near-client coords)
 *   activeBusyRanges     — returned by getActiveBusyRanges (default [])
 *   driveBufferPct       — the settings percentage the buffer guard scales by
 *   captureInserts       — when true, records rows passed to insertBookings;
 *                          access via the returned getLastInsertedStatuses accessor
 */
function makeMockRepo(
  opts: {
    outstandingDebtCents?: number;
    openWindows?: { startsAt: Date; endsAt: Date }[];
    profileLatLng?: { lat: number | null; lng: number | null };
    captureInserts?: boolean;
    activeBusyRanges?: BusyRange[];
    driveBufferPct?: number;
  } = {},
): {
  repo: BookingRepository;
  getLastInsertedStatuses: () => string[];
} {
  let lastInsertedStatuses: string[] = [];

  const repo: BookingRepository = {
    getOutstandingDebtCents: vi.fn(async () => opts.outstandingDebtCents ?? 0),
    getOnboardingStatus: vi.fn(async () => "approved" as const),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in" as const,
      // Modifier-list shape (parsePricingConfig rejects the legacy
      // rate_cents_per_hour/minimum_cents pair). Same economics: $30/h, $15 floor.
      pricing_config: {
        modifiers: [
          { kind: "base_per_hour", cents: 3000 },
          { kind: "min_floor", cents: 1500 },
        ],
        constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
      },
      concurrency: "exclusive" as const,
      requires_approval: false,
      form_key: null,
    })),
    getSettings: vi.fn(async () => ({
      ...MOCK_SETTINGS,
      drive_buffer_pct: opts.driveBufferPct ?? MOCK_SETTINGS.drive_buffer_pct,
    })),
    getProfileLatLng: vi.fn(
      async () => opts.profileLatLng ?? { lat: 40.087, lng: -105.27 },
    ),
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
    getOpenWindows: vi.fn(async () => opts.openWindows ?? []),
    getActiveBusyRanges: vi.fn(async () => opts.activeBusyRanges ?? []),
    insertBookings: vi.fn(async (rows: BookingInsert[]) => {
      if (opts.captureInserts) {
        lastInsertedStatuses = rows.map((r) => r.status as string);
      }
      return ["bk-1"];
    }),
    insertBookingPets: vi.fn(async () => {}),
    insertSeries: vi.fn(async () => "series-1"),
    deleteSeries: vi.fn(async () => {}),
    // Stub remaining interface methods (not exercised by policy gate tests)
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

  return { repo, getLastInsertedStatuses: () => lastInsertedStatuses };
}

/** A valid check-in input for the near-client mock profile. */
const MOCK_NOW = new Date("2026-06-10T12:00:00Z");
const mockValidInput: CreateBookingInput = {
  userId: "a0000000-0000-4000-8000-000000000001",
  serviceSlug: "check-in",
  startsAt: new Date("2026-06-20T17:00:00Z"),
  endsAt: new Date("2026-06-20T18:00:00Z"),
  quantities: { hours: 1 },
  recurringRule: null,
};

describe("computeBookingQuoteCore — policy gates", () => {
  it("ADMIN_POLICY: out-of-horizon occurrence requires approval (not auto-confirmed)", async () => {
    // Near client (lat=40.087 → under 8 mi auto threshold → baseRequiresApproval=false).
    // Start is NOW + 2 years → beyond hard_max_advance_days=365 → timeDecision="refuse".
    // skipHorizonRefuse=true (ADMIN_POLICY) → should warn + set requiresApproval=true.
    const { repo } = makeMockRepo();
    const farFutureStart = new Date(
      MOCK_NOW.getTime() + 2 * 365 * 24 * 60 * 60 * 1000,
    );
    const farFutureEnd = new Date(farFutureStart.getTime() + 60 * 60 * 1000);
    const input: CreateBookingInput = {
      userId: "a0000000-0000-4000-8000-000000000001",
      serviceSlug: "check-in",
      startsAt: farFutureStart,
      endsAt: farFutureEnd,
      quantities: { hours: 1 },
      recurringRule: null,
    };

    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      input,
      ADMIN_POLICY,
    );

    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.preview.requiresApproval).toBe(true);
    expect(result.preview.warnings.join(" ")).toMatch(/beyond|limit/i);
  });

  it("blocks a debtor under CLIENT_POLICY", async () => {
    const { repo } = makeMockRepo({ outstandingDebtCents: 4000 });
    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      mockValidInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("blocked_debt");
    // The gate is per-client; asking without the id would total the whole book.
    expect(repo.getOutstandingDebtCents).toHaveBeenCalledWith(
      mockValidInput.userId,
    );
  });

  it("warns (not blocks) a debtor under ADMIN_POLICY", async () => {
    const { repo } = makeMockRepo({ outstandingDebtCents: 4000 });
    const result = await computeBookingQuoteCore(
      { repo, now: MOCK_NOW },
      mockValidInput,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.preview.warnings.join(" ")).toMatch(/owes/i);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createBookingCore policy-aware
// ──────────────────────────────────────────────────────────────────────────────

const CREATE_POLICY_NOW = new Date("2026-06-10T12:00:00Z");

/** A valid check-in input within the auto-confirm horizon (10 days out). */
const validClientInput: CreateBookingInput = {
  userId: "a0000000-0000-4000-8000-000000000001",
  serviceSlug: "check-in",
  startsAt: new Date("2026-06-20T17:00:00Z"),
  endsAt: new Date("2026-06-20T18:00:00Z"),
  quantities: { hours: 1 },
  recurringRule: null,
};

/**
 * An availability window that covers the validClientInput slot
 * (2026-06-20T17:00–18:00Z).
 */
const openWindowCoveringSlot = {
  startsAt: new Date("2026-06-20T15:00:00Z"),
  endsAt: new Date("2026-06-20T20:00:00Z"),
};

/** An exclusive booking ending five minutes before the candidate starts. */
const adjacentBusy = (clientLat: number): BusyRange => ({
  startsAt: new Date("2026-06-20T16:00:00Z"),
  endsAt: new Date("2026-06-20T16:55:00Z"),
  concurrency: "exclusive",
  clientLat,
  clientLng: -105.27,
  pets: [],
});

/** A window wide enough to cover the candidate and everything its buffer adds. */
const allDayWindow = {
  startsAt: new Date("2026-06-20T00:00:00Z"),
  endsAt: new Date("2026-06-21T00:00:00Z"),
};

describe("createBookingCore policy-aware", () => {
  // 1. Client policy unchanged: a slot outside all windows → unavailable.
  it("client policy still blocks an out-of-window slot", async () => {
    const { repo } = makeMockRepo({ openWindows: [] });
    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
    );
    expect(result.kind).toBe("unavailable");
  });

  // 2. Admin policy: same out-of-window slot succeeds with a warning.
  it("admin policy turns out-of-window into a warning, not a block", async () => {
    const { repo } = makeMockRepo({ openWindows: [] });
    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.warnings.some((w) => /availability window/i.test(w))).toBe(
        true,
      );
    }
  });

  // 3. Admin forceStatus forces the inserted status regardless of derived approval.
  it("admin forceStatus forces the inserted status", async () => {
    // Use null lat/lng so distance gate → manual approval → pending_approval by default.
    // The input itself is identical to validClientInput; manual-approval is triggered
    // by the repo mock's profileLatLng: { lat: null, lng: null }.
    const { repo, getLastInsertedStatuses } = makeMockRepo({
      openWindows: [openWindowCoveringSlot],
      profileLatLng: { lat: null, lng: null },
      captureInserts: true,
    });
    const policy = { ...ADMIN_POLICY, forceStatus: "confirmed" as const };
    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
      policy,
    );
    expect(result.kind).toBe("success");
    const statuses = getLastInsertedStatuses();
    expect(statuses.every((s) => s === "confirmed")).toBe(true);
  });

  // 4. Client success now carries an empty warnings array (back-compat shape).
  it("client success returns empty warnings", async () => {
    const { repo } = makeMockRepo({
      openWindows: [openWindowCoveringSlot],
    });
    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.warnings).toEqual([]);
  });

  it("checks the overlap against this service's class, excluding nothing", async () => {
    const { repo } = makeMockRepo({
      openWindows: [openWindowCoveringSlot],
    });

    await createBookingCore({ repo, now: CREATE_POLICY_NOW }, validClientInput);

    // A create has no booking of its own to leave out, and it must not widen
    // the read to every class: a resident stay does not block an exclusive
    // visit. Both are arguments the repository can only honour if it gets them.
    expect(repo.getActiveBusyRanges).toHaveBeenCalledWith(
      CREATE_POLICY_NOW,
      "exclusive",
    );
  });

  // 5. Buffer guard (CLIENT_POLICY): buffered candidate overlaps existing booking → unavailable.
  //    Raw ranges do NOT overlap; buffers make them conflict.
  //    Candidate: check-in 2026-06-20T17:00–18:00Z (1h)
  //    Client is ~5mi from origin (lat=40.087, lng=-105.27).
  //    driveBufferPct=200 → large buffer → makes the padded range wide.
  //    Existing exclusive booking: ends at 2026-06-20T16:55Z (5 min before candidate start).
  //    Raw ranges do not overlap; but with a multi-minute buffer they do.
  it("buffer guard (CLIENT_POLICY): buffered overlap with existing booking → unavailable", async () => {
    // The existing client is also ~5 mi away, so its buffer widens
    // [16:00, 16:55) outward while the candidate's widens [17:00, 18:00)
    // backward — and the two meet.
    const { repo } = makeMockRepo({
      openWindows: [allDayWindow],
      activeBusyRanges: [adjacentBusy(40.087)],
      driveBufferPct: 200,
    });

    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toMatch(/travel time/i);
    }
  });

  // 6. Buffer guard (ADMIN_POLICY): same scenario → success with a warning (warn-don't-block).
  it("buffer guard (ADMIN_POLICY): buffered overlap downgrades to warning, not block", async () => {
    const { repo } = makeMockRepo({
      openWindows: [allDayWindow],
      activeBusyRanges: [adjacentBusy(40.087)],
      driveBufferPct: 200,
    });

    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
      ADMIN_POLICY,
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.warnings.some((w) => /drive-time spacing/i.test(w))).toBe(
        true,
      );
    }
  });

  // 7. Buffer guard: zero-buffer candidate (no coords) still blocked by existing booking's buffer.
  //    Candidate client has NO coords → distanceMiles=null → candBufMin=0.
  //    Existing client is ~70 mi away (lat=41.029); with drive_buffer_pct=200:
  //      dist≈70mi, road_factor=1.3, avg_speed=30mph → drive=(70*1.3/30)*60≈182min × 2=364min buffer.
  //      Widened existing: [16:00-364min, 16:55+364min) → covers [17:00,18:00) → conflict.
  //    The old `candBufMin > 0` gate silently skipped this check; the
  //    `service.pricing_type !== "house_sitting"` gate runs it and returns unavailable.
  it("buffer guard: zero-buffer candidate still blocked by an existing booking's buffer", async () => {
    const { repo } = makeMockRepo({
      openWindows: [allDayWindow],
      profileLatLng: { lat: null, lng: null },
      activeBusyRanges: [adjacentBusy(41.029)],
      driveBufferPct: 200,
    });

    const result = await createBookingCore(
      { repo, now: CREATE_POLICY_NOW },
      validClientInput,
      CLIENT_POLICY,
    );
    expect(result.kind).toBe("unavailable");
  });
});
