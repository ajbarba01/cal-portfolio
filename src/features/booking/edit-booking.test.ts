import { describe, it, expect, vi } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { editBookingCore, previewEditCore } from "./booking-service";
import { buildEditQuoteInput } from "./edit-core";
import { CLIENT_POLICY, ADMIN_POLICY } from "./mutation-policy";
import {
  createSupabaseBookingRepository,
  type BookingRepository,
  type BookingEditRow,
  type BusyRange,
} from "./booking-repository";

const NOW = new Date("2026-06-10T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const BOOKING = "00000000-0000-4000-8000-000000000002";

// A confirmed, unpaid, standalone check_in booking inside an open window.
function baseRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
  return {
    id: BOOKING,
    client_id: USER,
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

// A paid 2-night house-sitting stay carrying a walk add-on, priced by
// HOUSE_SITTING_SERVICE below.
const PAID_STAY_CENTS = 13000;

const HOUSE_SITTING_SERVICE = {
  id: "svc-house-sitting",
  slug: "house-sitting",
  pricing_type: "house_sitting",
  pricing_config: {
    modifiers: [
      { kind: "base_per_night", cents: 6000 },
      {
        kind: "allowance_then_per_unit",
        unit: "exercise",
        label: "Extra walk time",
        freeUnits: 45,
        cents: 500,
      },
    ],
    constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
  },
  concurrency: "exclusive",
  requires_approval: false,
  form_key: null,
};

// A pet belonging to another client: getPetsByIds (owner-scoped) returns nothing
// for it.
const FOREIGN_PET = "00000000-0000-4000-8000-000000000003";

const MEET_GREET_SERVICE = {
  id: "svc-meet-greet",
  slug: "meet-greet",
  pricing_type: "meet_greet",
  pricing_config: {
    modifiers: [],
    constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
  },
  concurrency: "exclusive",
  requires_approval: false,
  form_key: null,
};

function paidStayRow(): BookingEditRow {
  return baseRow({
    service_slug: "house-sitting",
    startsAt: new Date("2026-06-19T12:30:00Z"),
    endsAt: new Date("2026-06-21T12:30:00Z"),
    paidCents: PAID_STAY_CENTS,
    quote_inputs: {
      dogs: 1,
      cats: 0,
      nights: 2,
      exerciseMinutesPerDay: 60,
    },
  });
}

function makeRepo(
  row: BookingEditRow | null,
  over: Partial<Record<string, unknown>> = {},
) {
  const updateBookingEdited = vi.fn(async () => {});
  const swapBookingPets = vi.fn(async () => {});
  const appendSeriesSkip = vi.fn(async () => {});
  return {
    getBookingForEdit: vi.fn(async () => row),
    getServiceBySlug: vi.fn(async () => ({
      id: "svc-checkin",
      slug: "check-in",
      pricing_type: "check_in",
      // Modifier-config shape: $30/hr base with a $15 minimum floor.
      pricing_config: {
        modifiers: [
          { kind: "base_per_hour", cents: 3000 },
          { kind: "min_floor", cents: 1500 },
        ],
        constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
      },
      concurrency: "exclusive",
      requires_approval: false,
      form_key: null,
    })),
    getSettings: vi.fn(async () => SETTINGS),
    getProfileLatLng: vi.fn(async () => ({ lat: 40.0, lng: -105.27 })),
    getOutstandingDebtCents: vi.fn(async () => 0),
    getOnboardingStatus: vi.fn(async () => "approved"),
    hasActiveBookingForServiceSlug: vi.fn(async () => false),
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
    getPetsByIds: vi.fn(async () => []),
    getOpenWindows: vi.fn(async () => [
      {
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T20:00:00Z"),
      },
    ]),
    getActiveBusyRanges: vi.fn(async () => [] as BusyRange[]),
    updateBookingEdited,
    swapBookingPets,
    appendSeriesSkip,
    ...over,
  } as unknown as BookingRepository & {
    updateBookingEdited: typeof updateBookingEdited;
    swapBookingPets: typeof swapBookingPets;
    appendSeriesSkip: typeof appendSeriesSkip;
  };
}

// Settings permissive enough that guards pass for the times above. Every column
// the repository's settings schema parses is present, so the object doubles as
// the DB row in the settings-read tests at the bottom of this file.
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
  drive_buffer_pct: 120,
};

// A booking whose client lives ~34 miles from the origin above: at road factor
// 1.3, 30 mph and a 120% buffer that is a ~108-minute reservation on each side.
const FAR_LAT = 40.5;

function busyRange(over: Partial<BusyRange> = {}): BusyRange {
  return {
    id: "00000000-0000-4000-8000-0000000000ff",
    startsAt: new Date("2026-06-20T15:30:00Z"),
    endsAt: new Date("2026-06-20T16:30:00Z"),
    concurrency: "exclusive",
    clientLat: FAR_LAT,
    clientLng: -105.27,
    pets: [],
    ...over,
  };
}

describe("editBookingCore", () => {
  it("rejects a price-affecting edit on a PAID booking", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { quantities: { hours: 2 } },
      },
    );
    expect(result.kind).toBe("price_locked");
  });

  it("allows a time move on a PAID booking (price preserved)", async () => {
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.updateBookingEdited).toHaveBeenCalled();
  });

  it("rejects a duration change on a PAID booking", async () => {
    // Nights/hours are priced quantities the edit derives from the timestamps,
    // so a longer or shorter span re-prices a booking the client already paid.
    const repo = makeRepo(baseRow({ paidCents: 1500 }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { endsAt: new Date("2026-06-20T19:00:00Z") },
      },
    );
    expect(result.kind).toBe("price_locked");
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("keeps the stored walk add-on when re-quoting an edited stay", async () => {
    // The stay persists its walk minutes as `exerciseMinutesPerDay`; the merge
    // has to read them back or the re-quote drops the add-on and lowers the
    // price. This pins the re-quote, not the paid-lock: the edit still writes
    // whatever the re-quote produces (see the premium-day case below).
    const repo = makeRepo(paidStayRow(), {
      getServiceBySlug: vi.fn(async () => HOUSE_SITTING_SERVICE),
      getOpenNights: vi.fn(async () => new Set(["2026-06-19", "2026-06-20"])),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "gate code 4321" },
      },
    );
    expect(result.kind).toBe("success");
    // 2 nights × $60 + one 15-min block over the 45-min allowance × 2 days × $5.
    expect(repo.updateBookingEdited).toHaveBeenCalledWith(
      BOOKING,
      expect.objectContaining({
        final_cents: PAID_STAY_CENTS,
        comments: "gate code 4321",
      }),
    );
  });

  it("rejects a move that changes the premium days of a paid stay", async () => {
    // Premium days are derived from the booked dates, so a same-length move
    // onto a holiday re-prices the stay even though the patch names no priced
    // field — and the edit persists the re-quote, not the price already paid.
    const repo = makeRepo(paidStayRow(), {
      getServiceBySlug: vi.fn(async () => HOUSE_SITTING_SERVICE),
      getSettings: vi.fn(async () => ({
        ...SETTINGS,
        holiday_dates: ["2026-06-27"],
      })),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-26T12:30:00Z"),
          endsAt: new Date("2026-06-28T12:30:00Z"),
        },
      },
    );
    expect(result.kind).toBe("price_locked");
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("rejects pets the client does not own on a meet-and-greet", async () => {
    // meet_greet derives no headcount, but it still accepts pet ids. The
    // ownership lookup runs for every service that was sent some, or a client
    // could attach another client's pets to their booking.
    const repo = makeRepo(
      baseRow({ service_slug: "meet-greet", quote_inputs: {} }),
      { getServiceBySlug: vi.fn(async () => MEET_GREET_SERVICE) },
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { petIds: [FOREIGN_PET] },
      },
    );
    expect(result).toEqual({
      kind: "validation_error",
      message: "One or more selected pets were not found.",
    });
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("returns the standard error text for a mis-configured service", async () => {
    // The parser's message names schema internals — a mis-configured service is
    // Cal's problem, so the client sees the standard text instead.
    const repo = makeRepo(baseRow(), {
      getServiceBySlug: vi.fn(async () => ({
        id: "svc-broken",
        slug: "check-in",
        pricing_type: "check_in",
        pricing_config: { modifiers: [{ kind: "not_a_modifier" }] },
        concurrency: "exclusive",
        requires_approval: false,
        form_key: null,
      })),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result).toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("forbids editing someone else's booking under client policy", async () => {
    const repo = makeRepo(baseRow({ client_id: "other" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("rejects editing a terminal booking", async () => {
    const repo = makeRepo(baseRow({ status: "cancelled" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("invalid_status");
  });

  it("blocks a client edit inside the cancellation cutoff", async () => {
    // Booking starts 24h out; cutoff is 48h → inside cutoff → blocked for client.
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("unavailable");
  });

  it("admin overrides the cancellation cutoff (warns, succeeds)", async () => {
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-11T12:00:00Z"),
        endsAt: new Date("2026-06-11T13:00:00Z"),
      }),
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: "admin",
        policy: ADMIN_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("success");
  });

  it("detaches a series occurrence and records the skip", async () => {
    const repo = makeRepo(baseRow({ series_id: "series-1" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "edited" },
      },
    );
    expect(result.kind).toBe("success");
    expect(repo.appendSeriesSkip).toHaveBeenCalledWith(
      "series-1",
      baseRow().startsAt.toISOString(),
    );
    // The persisted update detaches the row.
    expect(repo.updateBookingEdited).toHaveBeenCalledWith(
      BOOKING,
      expect.objectContaining({ series_id: null }),
    );
  });

  it("maps a 23P01 update conflict to slot_taken", async () => {
    const conflict = Object.assign(new Error("overlap"), { code: "23P01" });
    const repo = makeRepo(baseRow(), {
      updateBookingEdited: vi.fn(async () => {
        throw conflict;
      }),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("slot_taken");
  });

  it("refuses a move that leaves too little drive time around another booking", async () => {
    // 18:00–19:00 sits inside the open window and clear of the other booking's
    // raw 15:30–16:30 range, so only the drive-time buffer refuses it: that
    // booking is ~34 miles out, reserving ~108 minutes on each side.
    const repo = makeRepo(baseRow(), {
      getActiveBusyRanges: vi.fn(async () => [busyRange()]),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result).toEqual({
      kind: "unavailable",
      reason:
        "That time doesn't leave enough travel time around another booking. Please pick another slot.",
    });
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("refuses a move whose own drive time no longer fits the open window", async () => {
    // No other booking exists: this client lives ~34 miles out, so an
    // 18:00–19:00 slot reserves travel from ~16:14 to ~20:46 and runs past the
    // 20:00 end of the open window. The candidate's own padding is the only
    // thing that can refuse it.
    const repo = makeRepo(baseRow(), {
      getProfileLatLng: vi.fn(async () => ({ lat: FAR_LAT, lng: -105.27 })),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result).toEqual({
      kind: "unavailable",
      reason:
        "That time doesn't leave enough travel time around another booking. Please pick another slot.",
    });
    expect(repo.updateBookingEdited).not.toHaveBeenCalled();
  });

  it("does not let the edited booking's own range refuse its move", async () => {
    // The only busy range is the booking itself, widened by its far client's
    // ~106-minute buffer to ~14:14–18:46 — which covers the 18:00 slot it is
    // moving to. Without the exclusion a booking could never move within reach
    // of where it already is.
    const getActiveBusyRanges = vi.fn(async () => [busyRange({ id: BOOKING })]);
    const repo = makeRepo(baseRow(), { getActiveBusyRanges });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("success");
    // Excluded in the query as well, so the row never crosses the wire.
    expect(getActiveBusyRanges).toHaveBeenCalledWith(NOW, "exclusive", BOOKING);
  });

  it("skips the buffer guard when the edit does not move the booking", async () => {
    // The booking sits flush against the 15:00 start of the open window and its
    // client is ~34 miles out, so padding it by its own ~106-minute buffer
    // refuses it. A comment or pet edit places nothing new on the calendar, so
    // the guard must not run at all — including its read.
    const getActiveBusyRanges = vi.fn(async () => [] as BusyRange[]);
    const repo = makeRepo(
      baseRow({
        startsAt: new Date("2026-06-20T15:00:00Z"),
        endsAt: new Date("2026-06-20T16:00:00Z"),
      }),
      {
        getProfileLatLng: vi.fn(async () => ({ lat: FAR_LAT, lng: -105.27 })),
        getActiveBusyRanges,
      },
    );
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "gate code 4321" },
      },
    );
    expect(result.kind).toBe("success");
    expect(getActiveBusyRanges).not.toHaveBeenCalled();
  });

  it("warns instead of refusing when the policy skips the buffer guard", async () => {
    const repo = makeRepo(baseRow(), {
      getActiveBusyRanges: vi.fn(async () => [busyRange()]),
    });
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: "admin",
        policy: ADMIN_POLICY,
        patch: {
          startsAt: new Date("2026-06-20T18:00:00Z"),
          endsAt: new Date("2026-06-20T19:00:00Z"),
        },
      },
    );
    // Warn, don't block: the edit saves AND the conflict is reported back.
    expect(result).toEqual(
      expect.objectContaining({
        kind: "success",
        warnings: expect.arrayContaining([
          "Occurrence at 2026-06-20T18:00:00.000Z conflicts with drive-time spacing.",
        ]),
      }),
    );
    expect(repo.updateBookingEdited).toHaveBeenCalled();
  });

  it("skips the buffer guard for a house-sitting stay", async () => {
    // A stay is resident, not a round trip: padding it would refuse every stay
    // (a multi-day range fits no intraday window).
    const repo = makeRepo(paidStayRow(), {
      getServiceBySlug: vi.fn(async () => HOUSE_SITTING_SERVICE),
      getOpenNights: vi.fn(async () => new Set(["2026-06-19", "2026-06-20"])),
      getActiveBusyRanges: vi.fn(async () => [busyRange()]),
    });
    // Moves the stay half an hour (same nights, same length, so the paid-lock
    // stays clear) — the guard is reached only by an edit that moves the time.
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: {
          startsAt: new Date("2026-06-19T13:00:00Z"),
          endsAt: new Date("2026-06-21T13:00:00Z"),
        },
      },
    );
    expect(result.kind).toBe("success");
  });

  it("reports the transition into confirmed so the caller can notify", async () => {
    const repo = makeRepo(baseRow({ status: "pending_approval" }));
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: "admin",
        policy: { ...ADMIN_POLICY, forceStatus: "confirmed" },
        patch: { comments: "x" },
      },
    );
    expect(result).toEqual(
      expect.objectContaining({ kind: "success", becameConfirmed: true }),
    );
  });

  it("does not report a transition when the booking was already confirmed", async () => {
    const repo = makeRepo(baseRow());
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result).toEqual(
      expect.objectContaining({ kind: "success", becameConfirmed: false }),
    );
  });

  it("returns not_found for a missing booking", async () => {
    const repo = makeRepo(null);
    const result = await editBookingCore(
      { repo, now: NOW },
      {
        bookingId: BOOKING,
        actorUserId: USER,
        policy: CLIENT_POLICY,
        patch: { comments: "x" },
      },
    );
    expect(result.kind).toBe("not_found");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Manual discounts survive an edit
// ──────────────────────────────────────────────────────────────────────────────

describe("editing a booking Cal discounted by hand", () => {
  // Same $30/hr check-in as makeRepo's default service, plus the manual
  // Friends & Family modifier the live configs carry.
  const DISCOUNTED_CHECK_IN = {
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
      ],
      constraints: { intervalMin: 15, allowedSpecies: ["dog", "cat"] },
    },
    concurrency: "exclusive",
    requires_approval: false,
    form_key: null,
  };

  /** A booking Cal has already discounted: the id is in its frozen quote input. */
  function discountedRepo() {
    return makeRepo(
      baseRow({
        quote_inputs: {
          pricingType: "check_in",
          hours: 1,
          enabledManualIds: ["friends_family"],
        },
      }),
      { getServiceBySlug: vi.fn(async () => DISCOUNTED_CHECK_IN) },
    );
  }

  const COMMENT_PATCH = {
    bookingId: BOOKING,
    actorUserId: USER,
    policy: ADMIN_POLICY,
    patch: { comments: "gate code 4321" },
  };

  it("keeps the discount when re-quoting the edit", async () => {
    // The discount is Cal's, not the client's, and it lives only in the frozen
    // quote inputs. An edit that names no priced field re-quotes from scratch,
    // so without carrying those inputs the booking silently returns to full
    // price — $30 instead of the $15 Cal granted.
    const repo = discountedRepo();
    const result = await editBookingCore({ repo, now: NOW }, COMMENT_PATCH);

    expect(result.kind).toBe("success");
    expect(repo.updateBookingEdited).toHaveBeenCalledWith(
      BOOKING,
      expect.objectContaining({ final_cents: 1500 }),
    );
  });

  it("previews the discounted price the save will write", async () => {
    const repo = discountedRepo();
    const result = await previewEditCore({ repo, now: NOW }, COMMENT_PATCH);

    expect(result.kind).toBe("preview");
    expect(result.kind === "preview" && result.preview.finalCents).toBe(1500);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEditQuoteInput — U24: nights must follow the merged times
// ──────────────────────────────────────────────────────────────────────────────

describe("buildEditQuoteInput (U24)", () => {
  // A 2-night house-sitting stay (6:30am Denver anchors → 12:30Z in June/MDT).
  function hsRow(over: Partial<BookingEditRow> = {}): BookingEditRow {
    return baseRow({
      service_slug: "house-sitting",
      startsAt: new Date("2026-06-19T12:30:00Z"),
      endsAt: new Date("2026-06-21T12:30:00Z"),
      quote_inputs: {}, // legacy/seeded row: nights never stored
      ...over,
    });
  }

  it("derives nights from the merged times when patch and stored inputs lack them", () => {
    // Pure date reschedule, same night count → diff legitimately omits
    // quantities; stored quote_inputs is empty. nights must still be present.
    const { merged } = buildEditQuoteInput(hsRow(), {
      startsAt: new Date("2026-06-24T12:30:00Z"),
      endsAt: new Date("2026-06-26T12:30:00Z"),
    });
    expect(merged.quantities.nights).toBe(2);
  });

  it("recomputes stale stored nights from the merged times", () => {
    // Stored nights says 5 (stale); the merged range is 2 nights.
    const row = hsRow({
      quote_inputs: { pricingType: "house_sitting", nights: 5 },
    });
    const { merged } = buildEditQuoteInput(row, {
      startsAt: new Date("2026-06-24T12:30:00Z"),
      endsAt: new Date("2026-06-26T12:30:00Z"),
    });
    expect(merged.quantities.nights).toBe(2);
  });

  it("leaves hourly bookings without a nights field", () => {
    const { merged } = buildEditQuoteInput(baseRow(), {
      startsAt: new Date("2026-06-20T18:00:00Z"),
      endsAt: new Date("2026-06-20T19:00:00Z"),
    });
    expect(merged.quantities.nights).toBeUndefined();
  });

  // B5: walk minutes persist on the QuoteInput as `exerciseMinutesPerDay`; the
  // merge has to translate them back or every re-quote silently drops the
  // add-on and lowers the price.
  it("carries the stored walk add-on into the re-quote", () => {
    const row = hsRow({
      quote_inputs: {
        pricingType: "house_sitting",
        nights: 2,
        exerciseMinutesPerDay: 60,
        needyTier: 3,
      },
    });
    const { merged } = buildEditQuoteInput(row, { comments: "gate code 4321" });
    expect(merged.quantities.walkMinutesPerDay).toBe(60);
    expect(merged.quantities.maxHoursAway).toBe(3);
  });

  it("lets a patch zero the stored walk add-on", () => {
    const row = hsRow({
      quote_inputs: {
        pricingType: "house_sitting",
        nights: 2,
        exerciseMinutesPerDay: 60,
      },
    });
    const { merged } = buildEditQuoteInput(row, {
      quantities: { walkMinutesPerDay: 0, maxHoursAway: 8 },
    });
    expect(merged.quantities.walkMinutesPerDay).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// The settings read the edit path (and every other booking surface) depends on
// ──────────────────────────────────────────────────────────────────────────────

describe("getSettings", () => {
  const settingsReturning = (row: unknown) =>
    createFakeSupabase({ tables: { settings: { data: row, error: null } } });

  it("selects exactly the columns it parses", async () => {
    // The select list is derived from the schema, so a column can never be
    // parsed but not asked for (or asked for and silently ignored).
    const client = settingsReturning(SETTINGS);
    await createSupabaseBookingRepository(client).getSettings();
    const [select] = client.calls({ table: "settings", method: "select" });
    expect(select?.args[0]).toBe(Object.keys(SETTINGS).join(", "));
  });

  it("rejects a row missing a column instead of handing on undefined", async () => {
    // The columns feed arithmetic (lead time, refund percentages, the drive
    // buffer); an absent one used to be cast to a number and become NaN.
    const { min_lead_time_hours: _dropped, ...incomplete } = SETTINGS;
    const repo = createSupabaseBookingRepository(settingsReturning(incomplete));
    await expect(repo.getSettings()).rejects.toThrow(/unexpected DB shape/);
  });
});
