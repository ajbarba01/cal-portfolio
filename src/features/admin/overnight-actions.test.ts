/**
 * Unit tests for the overnight-nights cores, against the recording Supabase
 * double.
 *
 * The predicates are the point of this suite. The hand-rolled fake this file
 * used to carry returned the builder from every filter method and threw the
 * arguments away, so the whole file stayed green with the production
 * `.in("night", …)` deleted — a delete that would have cleared every night in
 * the table. Each query assertion below reads the recorded arguments, so a
 * dropped or retargeted filter fails.
 *
 * The admin guard is the real one: it reads `profiles.role` through the same
 * double, so "refuses before reading a booking" is provable rather than mocked.
 */

import { describe, it, expect } from "vitest";

import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";

import {
  listOvernightNightsCore,
  setOvernightNightsBatchCore,
} from "./overnight-actions";

const ADMIN: FakeResponse = { data: { role: "admin" }, error: null };
const NOT_ADMIN: FakeResponse = { data: { role: "client" }, error: null };

const ADMIN_ID = "admin-user-id";
const NON_ADMIN_ID = "non-admin-user-id";

/** Denver midnight for the nights used below — MDT, so 06:00 UTC. */
const JUN_01 = "2026-06-01T06:00:00.000Z";
const JUN_11 = "2026-06-11T06:00:00.000Z";

const ERROR_RESULT = {
  kind: "error",
  message: "Something went wrong. Please try again.",
};

function client(
  tables: Record<string, FakeResponse | FakeResponse[]> = {},
  profile: FakeResponse = ADMIN,
) {
  return createFakeSupabase({ tables: { profiles: profile, ...tables } });
}

/** The recorded calls of one table as `[method, ...args]` rows, in call order. */
function filtersOn(
  supabase: ReturnType<typeof client>,
  table: string,
): unknown[][] {
  return supabase
    .calls({ table })
    .map((call) => [call.method, ...call.args] as unknown[]);
}

function residentBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-abc",
    starts_at: "2026-06-01T18:00:00.000Z",
    ends_at: "2026-06-02T15:00:00.000Z",
    client_id: "client-xyz",
    ...overrides,
  };
}

describe("listOvernightNightsCore", () => {
  it("returns the night strings on success, oldest first", async () => {
    const supabase = client({
      overnight_nights: {
        data: [{ night: "2026-07-01" }, { night: "2026-07-02" }],
        error: null,
      },
    });

    const result = await listOvernightNightsCore({
      serviceClient: supabase,
      actorUserId: ADMIN_ID,
    });

    expect(result).toEqual({
      kind: "success",
      nights: ["2026-07-01", "2026-07-02"],
    });
    expect(filtersOn(supabase, "overnight_nights")).toEqual([
      ["select", "night"],
      ["order", "night", { ascending: true }],
    ]);
  });

  it("keeps the Postgres message out of the result when the read fails", async () => {
    const supabase = client({
      overnight_nights: { data: null, error: { message: "relation missing" } },
    });

    const result = await listOvernightNightsCore({
      serviceClient: supabase,
      actorUserId: ADMIN_ID,
    });

    expect(result).toEqual(ERROR_RESULT);
  });

  it("refuses a non-admin actor before reading any night", async () => {
    const supabase = client({}, NOT_ADMIN);

    const result = await listOvernightNightsCore({
      serviceClient: supabase,
      actorUserId: NON_ADMIN_ID,
    });

    expect(result).toEqual({ kind: "forbidden" });
    expect(supabase.calls({ table: "overnight_nights" })).toEqual([]);
  });
});

describe("setOvernightNightsBatchCore — turning nights on", () => {
  it("upserts one row per night and lets an already-open night pass", async () => {
    const supabase = client({ overnight_nights: { data: [], error: null } });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01", "2026-07-02"], on: true },
    );

    expect(result).toEqual({ kind: "success" });
    expect(filtersOn(supabase, "overnight_nights")).toEqual([
      [
        "upsert",
        [{ night: "2026-07-01" }, { night: "2026-07-02" }],
        { onConflict: "night", ignoreDuplicates: true },
      ],
    ]);
  });

  it("never reads bookings — opening a night cannot conflict with one", async () => {
    const supabase = client({ overnight_nights: { data: [], error: null } });

    await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01"], on: true },
    );

    expect(supabase.calls({ table: "bookings" })).toEqual([]);
  });

  it("keeps the Postgres message out of the result when the upsert fails", async () => {
    const supabase = client({
      overnight_nights: { data: null, error: { message: "duplicate key" } },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01"], on: true },
    );

    expect(result).toEqual(ERROR_RESULT);
  });
});

describe("setOvernightNightsBatchCore — turning nights off", () => {
  it("looks for active resident bookings across the span the nights cover", async () => {
    const supabase = client({
      bookings: { data: [], error: null },
      overnight_nights: { data: [], error: null },
    });

    await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    // The span runs from the first night's Denver midnight to the morning after
    // the last one, so a stay that starts on the final night is still seen.
    expect(filtersOn(supabase, "bookings")).toEqual([
      ["select", "id, starts_at, ends_at"],
      ["lt", "starts_at", JUN_11],
      ["gt", "ends_at", JUN_01],
      ["eq", "concurrency", "resident"],
      ["in", "status", ["pending_approval", "confirmed"]],
    ]);
  });

  it("deletes only the nights it was given", async () => {
    const supabase = client({
      bookings: { data: [], error: null },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    expect(result).toEqual({ kind: "success" });
    // Without the `in`, the delete clears every night Cal has ever opened.
    expect(filtersOn(supabase, "overnight_nights")).toEqual([
      ["delete"],
      ["in", "night", ["2026-06-01", "2026-06-10"]],
    ]);
  });

  it("refuses the batch and deletes nothing when a resident booking overlaps", async () => {
    const supabase = client({
      bookings: { data: [residentBooking()], error: null },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01"], on: false },
    );

    expect(result).toEqual({
      kind: "conflict",
      bookings: [
        {
          id: "booking-abc",
          startsAt: "2026-06-01T18:00:00.000Z",
          endsAt: "2026-06-02T15:00:00.000Z",
        },
      ],
    });
    expect(supabase.calls({ table: "overnight_nights" })).toEqual([]);
  });

  it("lets a booking in the gap between two non-adjacent nights through", async () => {
    // The conflict query reads one span for both nights, so a booking on the
    // 5th comes back from the database and only the post-filter can tell that
    // it touches neither the 1st nor the 10th.
    const supabase = client({
      bookings: {
        data: [
          residentBooking({
            id: "booking-gap",
            starts_at: "2026-06-05T18:00:00.000Z",
            ends_at: "2026-06-06T15:00:00.000Z",
          }),
        ],
        error: null,
      },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    expect(result).toEqual({ kind: "success" });
    expect(
      supabase.calls({ table: "overnight_nights", method: "delete" }),
    ).toHaveLength(1);
  });

  it("still refuses when the booking overlaps the later of two nights", async () => {
    const supabase = client({
      bookings: {
        data: [
          residentBooking({
            id: "booking-jun10",
            starts_at: "2026-06-10T18:00:00.000Z",
            ends_at: "2026-06-11T15:00:00.000Z",
          }),
        ],
        error: null,
      },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    expect(
      result.kind === "conflict" && result.bookings.map((b) => b.id),
    ).toEqual(["booking-jun10"]);
    expect(supabase.calls({ table: "overnight_nights" })).toEqual([]);
  });

  it("fails closed when the conflict query itself fails", async () => {
    const supabase = client({
      bookings: { data: null, error: { message: "connection reset" } },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01"], on: false },
    );

    expect(result).toEqual(ERROR_RESULT);
    expect(supabase.calls({ table: "overnight_nights" })).toEqual([]);
  });

  it("keeps the Postgres message out of the result when the delete fails", async () => {
    const supabase = client({
      bookings: { data: [], error: null },
      overnight_nights: { data: null, error: { message: "deadlock" } },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01"], on: false },
    );

    expect(result).toEqual(ERROR_RESULT);
  });

  it("refuses a non-admin actor before reading a booking", async () => {
    const supabase = client({}, NOT_ADMIN);

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: NON_ADMIN_ID },
      { nights: ["2026-07-01"], on: true },
    );

    expect(result).toEqual({ kind: "forbidden" });
    expect(new Set(supabase._calls.map((call) => call.table))).toEqual(
      new Set(["profiles"]),
    );
  });
});

describe("setOvernightNightsBatchCore — validation", () => {
  it.each([
    ["a night that is not a date", ["not-a-date"]],
    ["a night with a two-digit year", ["26-07-01"]],
    ["an empty batch", []],
  ])("refuses %s without touching the table", async (_label, nights) => {
    const supabase = client();

    const result = await setOvernightNightsBatchCore(
      { serviceClient: supabase, actorUserId: ADMIN_ID },
      { nights, on: true },
    );

    // Zod's issue list stays in the log; the operator gets the one sentence.
    expect(result).toEqual({
      kind: "validation_error",
      message: "Please check your entries and try again.",
    });
    expect(supabase.calls({ table: "overnight_nights" })).toEqual([]);
  });
});
