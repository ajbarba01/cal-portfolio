/**
 * previewEditCore's gates, against an in-memory repository.
 *
 * Split out of booking-service.integration.test.ts, which needs a database for
 * none of it. The cases are the refusals a client can hit on the edit screen —
 * someone else's booking, a finished one, a paid one whose price would move —
 * plus the drift guard that keeps the previewed total and the persisted total
 * the same number, and the arguments the core hands the repository so its own
 * range cannot block its own move.
 */

import { describe, it, expect, vi } from "vitest";

import { previewEditCore, editBookingCore } from "./booking-service";
import type { BookingEditRow, BookingRepository } from "./booking-repository";
import { CLIENT_POLICY } from "./mutation-policy";

const PREVIEW_NOW = new Date("2026-06-10T12:00:00Z");
const PREVIEW_USER = "00000000-0000-4000-8000-000000000001";
const PREVIEW_BOOKING = "00000000-0000-4000-8000-000000000002";

const PREVIEW_SETTINGS = {
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

function previewBaseRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: PREVIEW_BOOKING,
    client_id: PREVIEW_USER,
    service_slug: "check-in",
    status: "confirmed",
    startsAt: new Date("2026-06-20T16:00:00Z"),
    endsAt: new Date("2026-06-20T17:00:00Z"),
    series_id: null,
    comments: null,
    quote_inputs: { pricingType: "check_in", hours: 1 },
    petIds: [],
    paidCents: 0,
    kiche_applied: false,
    ...over,
  };
}

function makePreviewRepo(
  row: BookingEditRow | null,
  over: Partial<Record<string, unknown>> = {},
) {
  const updateBookingEdited = vi.fn(async () => {});
  const swapBookingPets = vi.fn(async () => {});
  const appendSeriesSkip = vi.fn(async () => {});
  const getActiveBusyRanges = vi.fn(async () => []);
  return {
    getBookingForEdit: vi.fn(async () => row),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in",
      // Modifier-list shape (parsePricingConfig rejects the legacy
      // rate_cents_per_hour/minimum_cents pair). Same economics: $30/h, $15 floor.
      pricing_config: {
        modifiers: [
          { kind: "base_per_hour", cents: 3000 },
          { kind: "min_floor", cents: 1500 },
        ],
        constraints: { intervalMin: 15, allowedSpecies: ["dog"] },
      },
      concurrency: "exclusive",
      requires_approval: false,
      form_key: null,
    })),
    getSettings: vi.fn(async () => PREVIEW_SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.0, lng: -105.27 })),
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
    getActiveBusyRanges,
    updateBookingEdited,
    swapBookingPets,
    appendSeriesSkip,
    ...over,
  } as unknown as BookingRepository & {
    getActiveBusyRanges: typeof getActiveBusyRanges;
    updateBookingEdited: typeof updateBookingEdited;
    swapBookingPets: typeof swapBookingPets;
    appendSeriesSkip: typeof appendSeriesSkip;
  };
}

describe("previewEditCore", () => {
  it("returns forbidden on ownership mismatch under client policy", async () => {
    const repo = makePreviewRepo(previewBaseRow({ client_id: "other-user" }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("returns invalid_status for a completed booking", async () => {
    const repo = makePreviewRepo(previewBaseRow({ status: "completed" }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("returns price_locked for a paid booking with a price-affecting patch", async () => {
    const repo = makePreviewRepo(previewBaseRow({ paidCents: 3000 }));
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { quantities: { hours: 2 } },
      },
    );
    expect(result.kind).toBe("price_locked");
  });

  it("drift guard: unpaid quantities change — preview.finalCents matches editBookingCore persisted value", async () => {
    const patch = { quantities: { hours: 2 } };

    // preview
    const previewRepo = makePreviewRepo(previewBaseRow());
    const previewResult = await previewEditCore(
      { repo: previewRepo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch,
      },
    );
    expect(previewResult.kind).toBe("preview");
    if (previewResult.kind !== "preview") throw new Error("unreachable");
    const previewCents = previewResult.preview.finalCents;

    // edit (persist)
    const editRepo = makePreviewRepo(previewBaseRow());
    const editResult = await editBookingCore(
      { repo: editRepo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch,
      },
    );
    expect(editResult.kind).toBe("success");

    const [persistedId, persistedFields] = editRepo.updateBookingEdited.mock
      .calls[0] as unknown as [string, { final_cents: number }];
    expect(persistedFields.final_cents).toBe(previewCents);
    // The write has to name the booking it edits, not just carry the fields.
    expect(persistedId).toBe(PREVIEW_BOOKING);
  });

  it("unpaid time-only move on confirmed booking → preview with requiresApproval reflecting re-derivation", async () => {
    const repo = makePreviewRepo(previewBaseRow());
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") throw new Error("unreachable");
    // Near user (distance < auto threshold) → should not require approval
    expect(result.preview.requiresApproval).toBe(false);
    expect(result.requiresApproval).toBe(false);
  });

  it("never pays for the busy-range read — the guard belongs to Save", async () => {
    const repo = makePreviewRepo(previewBaseRow());

    await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );

    // The preview re-runs on every keystroke, so the drive-time guard's two
    // extra reads are deliberately left to editBookingCore (see the comment in
    // edit-core). Wiring them in here would put a DB round trip behind the
    // spinner on each character typed.
    expect(repo.getActiveBusyRanges).not.toHaveBeenCalled();
  });

  it("not_found: getBookingForEdit returns null → not_found", async () => {
    const repo = makePreviewRepo(null);
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("not_found");
  });

  it("unavailable: unpaid patch whose new start is outside the open window → unavailable", async () => {
    // Open window: 2026-06-20 15:00–20:00 UTC (from makePreviewRepo default).
    // Patch to a start OUTSIDE the window: 2026-06-20 21:00 UTC.
    const repo = makePreviewRepo(previewBaseRow());
    const result = await previewEditCore(
      { repo, now: PREVIEW_NOW },
      {
        bookingId: PREVIEW_BOOKING,
        actorUserId: PREVIEW_USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T21:00:00Z"),
          endsAt: new Date("2026-06-20T22:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("unavailable");
  });
});

describe("editBookingCore — the guards Save runs and the preview does not", () => {
  const timeMove = {
    bookingId: PREVIEW_BOOKING,
    actorUserId: PREVIEW_USER,
    policy: CLIENT_POLICY,
    patch: {
      startsAt: new Date("2026-06-20T18:00:00Z"),
      endsAt: new Date("2026-06-20T19:00:00Z"),
    },
  };

  it("leaves the booking being moved out of its own overlap check", async () => {
    const repo = makePreviewRepo(previewBaseRow());

    const result = await editBookingCore({ repo, now: PREVIEW_NOW }, timeMove);

    expect(result.kind).toBe("success");
    // Drop the third argument and the booking's own range comes back from the
    // read, so the drive-buffer guard finds it conflicting with itself and
    // every move inside the buffer is refused as unavailable.
    expect(repo.getActiveBusyRanges).toHaveBeenCalledWith(
      PREVIEW_NOW,
      "exclusive",
      PREVIEW_BOOKING,
    );
  });

  it("does not consult the calendar when nothing about the time changed", async () => {
    const repo = makePreviewRepo(previewBaseRow());

    await editBookingCore(
      { repo, now: PREVIEW_NOW },
      { ...timeMove, patch: { comments: "gate code 4321" } },
    );

    expect(repo.getActiveBusyRanges).not.toHaveBeenCalled();
  });
});
