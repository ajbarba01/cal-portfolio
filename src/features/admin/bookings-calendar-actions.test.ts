import { describe, expect, it } from "vitest";

import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";

import { listBookingsInRangeCore } from "./bookings-calendar-actions";

const ADMIN: FakeResponse = { data: { role: "admin" }, error: null };
const NOT_ADMIN: FakeResponse = { data: { role: "client" }, error: null };

const WINDOW = {
  startIso: "2026-09-01T06:00:00.000Z",
  endIso: "2026-10-01T06:00:00.000Z",
};

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    client_id: "client-1",
    status: "confirmed",
    starts_at: "2026-09-10T16:00:00.000Z",
    ends_at: "2026-09-10T17:00:00.000Z",
    final_cents: 4500,
    payment_status: "paid",
    profiles: { full_name: "Jane Doe" },
    services: { name: "Dog Walk" },
    ...overrides,
  };
}

/**
 * A client for the two booking reads the core issues. A single response is
 * served to both chains; an array is the FIFO queue [window read, pending read].
 */
function clientWith(
  bookings: FakeResponse | FakeResponse[],
  profile: FakeResponse = ADMIN,
) {
  return createFakeSupabase({ tables: { profiles: profile, bookings } });
}

describe("listBookingsInRangeCore", () => {
  it("selects every booking overlapping the window, not only those starting in it", async () => {
    // A stay that began in August and ends in September is in progress all
    // month, so the hub has to show it — a start-only predicate hides it.
    const supabase = clientWith({ data: [], error: null });

    await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    const filters = supabase
      .calls({ table: "bookings" })
      .map((call) => [call.method, ...call.args]);
    expect(filters).toContainEqual(["lt", "starts_at", WINDOW.endIso]);
    expect(filters).toContainEqual(["gte", "ends_at", WINDOW.startIso]);
    expect(filters).not.toContainEqual(["gte", "starts_at", WINDOW.startIso]);
  });

  it("orders every read by start time", async () => {
    const supabase = clientWith({ data: [], error: null });

    await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    const orders = supabase.calls({ table: "bookings", method: "order" });
    expect(orders.length).toBeGreaterThan(0);
    for (const order of orders) {
      expect(order.args).toEqual(["starts_at", { ascending: true }]);
    }
  });

  it("reads every pending booking as well, whatever month it starts in", async () => {
    // A booking pends because it starts beyond the auto-confirm horizon, so the
    // month window hid the very bookings the nav badge counts. Reading them
    // alongside the window is what lets Cal approve a next-month request from
    // the hub the badge links to.
    const supabase = clientWith([
      { data: [bookingRow()], error: null },
      {
        data: [
          bookingRow({
            id: "booking-next-month",
            status: "pending_approval",
            starts_at: "2026-11-02T16:00:00.000Z",
            ends_at: "2026-11-02T17:00:00.000Z",
          }),
        ],
        error: null,
      },
    ]);

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(
      result.kind === "success" && result.bookings.map((b) => b.id),
    ).toEqual(["booking-1", "booking-next-month"]);
    const pendingRead = supabase._queries
      .filter((query) => query.table === "bookings")[1]
      ?._calls.map((call) => [call.method, ...call.args]);
    expect(pendingRead).toContainEqual(["eq", "status", "pending_approval"]);
  });

  it("returns a pending booking inside the window only once", async () => {
    const inWindow = bookingRow({ status: "pending_approval" });
    const supabase = clientWith([
      { data: [inWindow], error: null },
      { data: [inWindow], error: null },
    ]);

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(result.kind === "success" && result.bookings).toHaveLength(1);
  });

  it("returns the window and the pending reads merged in start order", async () => {
    const supabase = clientWith([
      { data: [bookingRow({ id: "later" })], error: null },
      {
        data: [
          bookingRow({
            id: "earlier",
            status: "pending_approval",
            starts_at: "2026-09-02T16:00:00.000Z",
          }),
        ],
        error: null,
      },
    ]);

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(
      result.kind === "success" && result.bookings.map((b) => b.id),
    ).toEqual(["earlier", "later"]);
  });

  it("fails the read when the pending query fails", async () => {
    const supabase = clientWith([
      { data: [], error: null },
      { data: null, error: { message: "boom" } },
    ]);

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(result).toEqual({ kind: "error", message: "boom" });
  });

  it("returns the window start it read, so the caller can caption the month", async () => {
    const supabase = clientWith({ data: [], error: null });

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(result).toEqual({
      kind: "success",
      bookings: [],
      startIso: WINDOW.startIso,
    });
  });

  // Both joins are to-one on a non-null foreign key, so PostgREST returns one
  // embedded object per booking — never an array and never null.
  it("flattens the joined client and service names onto the row", async () => {
    const supabase = clientWith({
      data: [
        bookingRow(),
        bookingRow({
          id: "booking-2",
          profiles: { full_name: "Sam Reyes" },
          services: { name: "House Sitting" },
        }),
      ],
      error: null,
    });

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(result.kind === "success" && result.bookings).toMatchObject([
      {
        id: "booking-1",
        client_name: "Jane Doe",
        service_name: "Dog Walk",
        payment_status: "paid",
      },
      {
        id: "booking-2",
        client_name: "Sam Reyes",
        service_name: "House Sitting",
      },
    ]);
  });

  it("keeps a client with no name on file, rather than dropping the booking", async () => {
    const supabase = clientWith({
      data: [bookingRow({ profiles: { full_name: null } })],
      error: null,
    });

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      WINDOW,
    );

    expect(result.kind === "success" && result.bookings).toMatchObject([
      { id: "booking-1", client_name: null },
    ]);
  });

  it("refuses a non-admin actor before reading any booking", async () => {
    const supabase = clientWith({ data: [], error: null }, NOT_ADMIN);

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "client-1" },
      WINDOW,
    );

    expect(result).toEqual({ kind: "forbidden" });
    expect(supabase.calls({ table: "bookings" })).toEqual([]);
  });

  it("rejects a window that is not a pair of instants", async () => {
    const supabase = clientWith({ data: [], error: null });

    const result = await listBookingsInRangeCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      { startIso: "2026-09", endIso: WINDOW.endIso },
    );

    expect(result.kind).toBe("validation_error");
    expect(supabase.calls({ table: "bookings" })).toEqual([]);
  });
});
