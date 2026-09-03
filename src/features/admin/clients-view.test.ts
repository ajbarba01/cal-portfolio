/**
 * TDD tests for clients-view.ts pure helpers.
 * applyClientFilter + sortClients + the client-detail projections.
 */

import { describe, expect, it } from "vitest";
import {
  applyClientFilter,
  hasUpcomingMeetGreet,
  MEET_GREET_SLUG,
  pickLivePayment,
  sortClients,
  toBookingViews,
  type DetailBookingRow,
  type DetailPaymentRow,
} from "./clients-view";
import type { ClientBookingRow, ClientListRow } from "./clients-actions";
import type { OnboardingStatus } from "@/features/booking";

function makeClient(
  overrides: Partial<ClientListRow> & { id: string },
): ClientListRow {
  return {
    full_name: null,
    email: null,
    phone: null,
    petCount: 0,
    bookingCount: 0,
    outstandingCents: 0,
    onboardingStatus: "info_pending" as OnboardingStatus,
    meetGreetUpcoming: false,
    unclaimed: false,
    ...overrides,
  };
}

const alice = makeClient({
  id: "a",
  full_name: "Alice",
  outstandingCents: 1000,
  bookingCount: 5,
  onboardingStatus: "approved",
});
const bob = makeClient({
  id: "b",
  full_name: "Bob",
  outstandingCents: 0,
  bookingCount: 2,
  onboardingStatus: "info_pending",
});
const carol = makeClient({
  id: "c",
  full_name: "Carol",
  outstandingCents: 0,
  bookingCount: 10,
  onboardingStatus: "meet_greet_pending",
});
const dave = makeClient({
  id: "d",
  full_name: "Dave",
  outstandingCents: 500,
  bookingCount: 0,
  onboardingStatus: "declined",
});

const all = [alice, bob, carol, dave];

// ──────────────────────────────────────────────────────────────────────────────
// applyClientFilter
// ──────────────────────────────────────────────────────────────────────────────
describe("applyClientFilter", () => {
  it("all — returns every row unchanged", () => {
    expect(applyClientFilter(all, "all")).toEqual(all);
  });

  it("owing — returns only rows with outstandingCents > 0", () => {
    const result = applyClientFilter(all, "owing");
    expect(result.map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("owing — excludes zero-balance rows", () => {
    const result = applyClientFilter(all, "owing");
    expect(result.every((r) => r.outstandingCents > 0)).toBe(true);
  });

  it("needs_onboarding — includes info_pending and meet_greet_pending", () => {
    const result = applyClientFilter(all, "needs_onboarding");
    const ids = result.map((r) => r.id);
    expect(ids).toContain("b"); // info_pending
    expect(ids).toContain("c"); // meet_greet_pending
  });

  it("needs_onboarding — excludes approved and declined", () => {
    const result = applyClientFilter(all, "needs_onboarding");
    const ids = result.map((r) => r.id);
    expect(ids).not.toContain("a"); // approved
    expect(ids).not.toContain("d"); // declined
  });

  it("active — returns only approved rows", () => {
    const result = applyClientFilter(all, "active");
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("active — excludes non-approved rows", () => {
    const result = applyClientFilter(all, "active");
    expect(result.every((r) => r.onboardingStatus === "approved")).toBe(true);
  });

  it("returns empty array when no rows match", () => {
    const empty: ClientListRow[] = [];
    expect(applyClientFilter(empty, "owing")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    applyClientFilter(input, "owing");
    expect(input).toEqual(all);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// sortClients
// ──────────────────────────────────────────────────────────────────────────────
describe("sortClients — name", () => {
  it("asc — sorts A→Z by full_name (case-insensitive)", () => {
    const result = sortClients(all, "name", "asc");
    expect(result.map((r) => r.full_name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
      "Dave",
    ]);
  });

  it("desc — sorts Z→A by full_name", () => {
    const result = sortClients(all, "name", "desc");
    expect(result.map((r) => r.full_name)).toEqual([
      "Dave",
      "Carol",
      "Bob",
      "Alice",
    ]);
  });

  it("falls back to email when full_name is null", () => {
    const noName = makeClient({
      id: "e",
      full_name: null,
      email: "z@test.com",
    });
    const result = sortClients([alice, noName], "name", "asc");
    expect(result[0]!.id).toBe("a"); // Alice < z@test.com
  });

  it("is case-insensitive", () => {
    const lower = makeClient({ id: "x", full_name: "aaron" });
    const result = sortClients([alice, lower], "name", "asc");
    expect(result[0]!.id).toBe("x"); // aaron < Alice
  });

  it("does not mutate the input array", () => {
    const input = [...all];
    sortClients(input, "name", "asc");
    expect(input).toEqual(all);
  });
});

describe("sortClients — balance", () => {
  it("asc — sorts by outstandingCents ascending", () => {
    const result = sortClients(all, "balance", "asc");
    // bob=0, carol=0, dave=500, alice=1000
    expect(result.map((r) => r.outstandingCents)).toEqual([0, 0, 500, 1000]);
  });

  it("desc — sorts by outstandingCents descending", () => {
    const result = sortClients(all, "balance", "desc");
    expect(result.map((r) => r.outstandingCents)).toEqual([1000, 500, 0, 0]);
  });

  it("tie-handling — stable relative order preserved for equal cents", () => {
    const result = sortClients(all, "balance", "asc");
    const zeros = result.filter((r) => r.outstandingCents === 0);
    // bob comes before carol in original; stable sort preserves that
    expect(zeros.map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("sortClients — bookings", () => {
  it("asc — sorts by bookingCount ascending", () => {
    const result = sortClients(all, "bookings", "asc");
    expect(result.map((r) => r.bookingCount)).toEqual([0, 2, 5, 10]);
  });

  it("desc — sorts by bookingCount descending", () => {
    const result = sortClients(all, "bookings", "desc");
    expect(result.map((r) => r.bookingCount)).toEqual([10, 5, 2, 0]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// pickLivePayment
// ──────────────────────────────────────────────────────────────────────────────

function makePayment(
  overrides: Partial<DetailPaymentRow> = {},
): DetailPaymentRow {
  return {
    booking_id: "booking-1",
    stripe_payment_intent_id: "pi_1",
    status: "succeeded",
    refunded_cents: 0,
    disputed_at: null,
    dispute_status: null,
    ...overrides,
  };
}

describe("pickLivePayment", () => {
  it("returns empty fields when the booking has no payment rows", () => {
    expect(pickLivePayment([])).toEqual({
      paymentIntentId: null,
      refundedCents: 0,
      disputedAt: null,
      disputeStatus: null,
    });
  });

  it("reads the intent and dispute fields off a single row", () => {
    const summary = pickLivePayment([
      makePayment({
        stripe_payment_intent_id: "pi_live",
        refunded_cents: 2500,
        disputed_at: "2026-01-02T00:00:00Z",
        dispute_status: "needs_response",
      }),
    ]);
    expect(summary).toEqual({
      paymentIntentId: "pi_live",
      refundedCents: 2500,
      disputedAt: "2026-01-02T00:00:00Z",
      disputeStatus: "needs_response",
    });
  });

  it("skips a failed newest row in favour of the newest that succeeded", () => {
    const summary = pickLivePayment([
      makePayment({ status: "failed", stripe_payment_intent_id: "pi_failed" }),
      makePayment({ stripe_payment_intent_id: "pi_ok" }),
    ]);
    expect(summary.paymentIntentId).toBe("pi_ok");
  });

  it("falls back to the newest row when every attempt failed", () => {
    const summary = pickLivePayment([
      makePayment({ status: "failed", stripe_payment_intent_id: "pi_new" }),
      makePayment({ status: "failed", stripe_payment_intent_id: "pi_old" }),
    ]);
    expect(summary.paymentIntentId).toBe("pi_new");
  });

  it("sums refunds across every row, not just the live one", () => {
    const summary = pickLivePayment([
      makePayment({ stripe_payment_intent_id: "pi_2", refunded_cents: 1000 }),
      makePayment({ stripe_payment_intent_id: "pi_1", refunded_cents: 4000 }),
    ]);
    expect(summary.refundedCents).toBe(5000);
  });

  it("counts a refund recorded against a failed row", () => {
    const summary = pickLivePayment([
      makePayment({ refunded_cents: 500 }),
      makePayment({ status: "failed", refunded_cents: 250 }),
    ]);
    expect(summary.refundedCents).toBe(750);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// toBookingViews
// ──────────────────────────────────────────────────────────────────────────────

function makeDetailBooking(
  overrides: Partial<DetailBookingRow> = {},
): DetailBookingRow {
  return {
    id: "booking-1",
    status: "confirmed",
    starts_at: "2026-03-01T17:00:00Z",
    ends_at: "2026-03-01T18:00:00Z",
    final_cents: 8000,
    payment_status: "paid",
    quote_breakdown: {},
    services: { name: "Dog Walk", slug: "dog-walk" },
    ...overrides,
  };
}

describe("toBookingViews", () => {
  it("reads the service name and slug off an object embed", () => {
    const [view] = toBookingViews([makeDetailBooking()], []);
    expect(view?.service_name).toBe("Dog Walk");
    expect(view?.service_slug).toBe("dog-walk");
  });

  it("reads the service off a single-element array embed", () => {
    const [view] = toBookingViews(
      [
        makeDetailBooking({
          services: [{ name: "Dog Walk", slug: "dog-walk" }],
        }),
      ],
      [],
    );
    expect(view?.service_slug).toBe("dog-walk");
  });

  it("tolerates a missing service embed", () => {
    const [view] = toBookingViews([makeDetailBooking({ services: null })], []);
    expect(view?.service_name).toBeNull();
    expect(view?.service_slug).toBeNull();
  });

  it("defaults a null payment_status to unpaid", () => {
    const [view] = toBookingViews(
      [makeDetailBooking({ payment_status: null })],
      [],
    );
    expect(view?.payment_status).toBe("unpaid");
  });

  it("leaves a booking with no payment rows at zero refunded", () => {
    const [view] = toBookingViews([makeDetailBooking()], []);
    expect(view?.refunded_cents).toBe(0);
    expect(view?.payment_intent_id).toBeNull();
    expect(view?.disputed_at).toBeNull();
  });

  it("totals the refunds of a booking paid through two intents", () => {
    const [view] = toBookingViews(
      [makeDetailBooking({ final_cents: 20000 })],
      [
        makePayment({ stripe_payment_intent_id: "pi_2", refunded_cents: 6000 }),
        makePayment({ stripe_payment_intent_id: "pi_1", refunded_cents: 4000 }),
      ],
    );
    expect(view?.refunded_cents).toBe(10000);
  });

  it("keeps each booking's payments to itself", () => {
    const views = toBookingViews(
      [
        makeDetailBooking({ id: "booking-1" }),
        makeDetailBooking({ id: "booking-2" }),
      ],
      [
        makePayment({ booking_id: "booking-1", refunded_cents: 100 }),
        makePayment({ booking_id: "booking-2", refunded_cents: 900 }),
      ],
    );
    expect(views.map((v) => v.refunded_cents)).toEqual([100, 900]);
  });

  it("carries the stored breakdown through to the card", () => {
    // The itemized lines are how Cal sees a manual discount on a booking; the
    // projection has to pass the jsonb through untouched.
    const breakdown = {
      lines: [{ label: "Friends & Family (−50%)", amountCents: -1250 }],
      finalCents: 1250,
    };
    const [view] = toBookingViews(
      [makeDetailBooking({ quote_breakdown: breakdown })],
      [],
    );
    expect(view?.quote_breakdown).toEqual(breakdown);
  });

  it("surfaces the dispute fields of the live payment row", () => {
    const [view] = toBookingViews(
      [makeDetailBooking()],
      [
        makePayment({
          disputed_at: "2026-02-02T00:00:00Z",
          dispute_status: "under_review",
        }),
      ],
    );
    expect(view?.disputed_at).toBe("2026-02-02T00:00:00Z");
    expect(view?.dispute_status).toBe("under_review");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// hasUpcomingMeetGreet
// ──────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-03-01T00:00:00Z");

function makeBookingView(
  overrides: Partial<ClientBookingRow> = {},
): ClientBookingRow {
  return {
    id: "booking-1",
    service_name: "Meet & Greet",
    service_slug: MEET_GREET_SLUG,
    status: "pending_approval",
    starts_at: "2026-03-05T17:00:00Z",
    ends_at: "2026-03-05T17:30:00Z",
    final_cents: 0,
    payment_status: "unpaid",
    refunded_cents: 0,
    disputed_at: null,
    dispute_status: null,
    payment_intent_id: null,
    quote_breakdown: {},
    ...overrides,
  };
}

describe("hasUpcomingMeetGreet", () => {
  it("is true for a future pending meet & greet", () => {
    expect(hasUpcomingMeetGreet([makeBookingView()], "client-1", NOW)).toBe(
      true,
    );
  });

  it("is true when Cal has renamed the service", () => {
    const renamed = makeBookingView({ service_name: "Intro visit" });
    expect(hasUpcomingMeetGreet([renamed], "client-1", NOW)).toBe(true);
  });

  it("is false for a past meet & greet", () => {
    const past = makeBookingView({ starts_at: "2026-02-01T17:00:00Z" });
    expect(hasUpcomingMeetGreet([past], "client-1", NOW)).toBe(false);
  });

  it("is false for a cancelled meet & greet", () => {
    const cancelled = makeBookingView({ status: "cancelled" });
    expect(hasUpcomingMeetGreet([cancelled], "client-1", NOW)).toBe(false);
  });

  it("ignores upcoming bookings for other services", () => {
    const walk = makeBookingView({
      service_name: "Dog Walk",
      service_slug: "dog-walk",
    });
    expect(hasUpcomingMeetGreet([walk], "client-1", NOW)).toBe(false);
  });

  it("is false when the client has no bookings", () => {
    expect(hasUpcomingMeetGreet([], "client-1", NOW)).toBe(false);
  });
});
