/**
 * Unit tests for overnight-actions cores.
 *
 * Uses a hand-rolled fake Supabase client — no live DB, no Supabase stack
 * required. Tests call the DI cores directly, injecting the fake client and
 * a controlled actorUserId.
 *
 * Mock strategy:
 *   - assertActorIsAdmin is vi.mock'd so tests control admin/non-admin without
 *     a real profiles table.
 *   - The fake client exposes only the builder methods the cores actually call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listOvernightNightsCore,
  setOvernightNightsBatchCore,
} from "./overnight-actions";

// ──────────────────────────────────────────────────────────────────────────────
// Mock assertActorIsAdmin (same pattern as in other DI tests)
// ──────────────────────────────────────────────────────────────────────────────

const mockAssertActorIsAdmin = vi.fn<() => Promise<boolean>>();

vi.mock("./admin-guard", () => ({
  assertActorIsAdmin: () => mockAssertActorIsAdmin(),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Fake Supabase builder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal fake Supabase client whose .from() returns a fluent builder.
 *
 * Each call to .from(tableName) consults the `tables` map for a pre-loaded
 * response ({ data, error }). The builder records which methods were called so
 * tests can assert on side-effects (upsert, delete, etc.).
 */
function makeFakeClient(
  tables: Record<string, { data: unknown; error: unknown }>,
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  const makeBuilder = (table: string) => {
    // The actual response for this table query.
    const response = tables[table] ?? { data: [], error: null };

    // A chainable builder where every method returns `this` (or the response).
    const builder: Record<string, unknown> = {};

    const chain = () => builder;

    builder.select = (...args: unknown[]) => {
      calls.push({ table, method: "select", args });
      return builder;
    };
    builder.order = chain;
    builder.lt = chain;
    builder.gt = chain;
    builder.eq = chain;
    builder.in = (...args: unknown[]) => {
      calls.push({ table, method: "in", args });
      return builder;
    };
    builder.upsert = (...args: unknown[]) => {
      calls.push({ table, method: "upsert", args });
      return Promise.resolve(response);
    };
    builder.delete = (...args: unknown[]) => {
      calls.push({ table, method: "delete", args });
      return builder;
    };
    // Terminal: awaiting the builder resolves to the response.
    builder.then = (
      resolve: (v: { data: unknown; error: unknown }) => void,
    ) => {
      resolve(response);
      return Promise.resolve(response);
    };

    return builder;
  };

  const client = {
    from: (table: string) => makeBuilder(table),
    _calls: calls,
  };

  return client as unknown as import("@supabase/supabase-js").SupabaseClient & {
    _calls: typeof calls;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const ADMIN_ID = "admin-user-id";
const NON_ADMIN_ID = "non-admin-user-id";

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Non-admin guard
// ──────────────────────────────────────────────────────────────────────────────

describe("non-admin guard", () => {
  it("listOvernightNightsCore returns forbidden for non-admin", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeFakeClient({});
    const result = await listOvernightNightsCore({
      serviceClient: client,
      actorUserId: NON_ADMIN_ID,
    });
    expect(result.kind).toBe("forbidden");
  });

  it("setOvernightNightsBatchCore returns forbidden for non-admin", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeFakeClient({});
    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: NON_ADMIN_ID },
      { nights: ["2026-07-01"], on: true },
    );
    expect(result.kind).toBe("forbidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. listOvernightNightsCore
// ──────────────────────────────────────────────────────────────────────────────

describe("listOvernightNightsCore", () => {
  it("returns the night strings on success", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      overnight_nights: {
        data: [{ night: "2026-07-01" }, { night: "2026-07-02" }],
        error: null,
      },
    });
    const result = await listOvernightNightsCore({
      serviceClient: client,
      actorUserId: ADMIN_ID,
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.nights).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("returns error when query fails", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      overnight_nights: { data: null, error: { message: "db error" } },
    });
    const result = await listOvernightNightsCore({
      serviceClient: client,
      actorUserId: ADMIN_ID,
    });
    expect(result.kind).toBe("error");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. setOvernightNightsBatchCore — on = true
// ──────────────────────────────────────────────────────────────────────────────

describe("setOvernightNightsBatchCore (on: true)", () => {
  it("upserts and returns success", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      overnight_nights: { data: [], error: null },
    });
    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01", "2026-07-02"], on: true },
    );
    expect(result.kind).toBe("success");
    const upsertCall = client._calls.find((c) => c.method === "upsert");
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.table).toBe("overnight_nights");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. setOvernightNightsBatchCore — on = false, no conflict
// ──────────────────────────────────────────────────────────────────────────────

describe("setOvernightNightsBatchCore (on: false, no conflict)", () => {
  it("deletes and returns success when no overlapping resident booking", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    // Conflict query (bookings table) returns empty — no conflicts.
    const client = makeFakeClient({
      bookings: { data: [], error: null },
      overnight_nights: { data: [], error: null },
    });
    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01"], on: false },
    );
    expect(result.kind).toBe("success");
    const deleteCalls = client._calls.filter((c) => c.method === "delete");
    expect(deleteCalls.length).toBeGreaterThan(0);
    const overnightDelete = deleteCalls.find(
      (c) => c.table === "overnight_nights",
    );
    expect(overnightDelete).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. setOvernightNightsBatchCore — on = false, WITH conflict
// ──────────────────────────────────────────────────────────────────────────────

describe("setOvernightNightsBatchCore (on: false, with conflict)", () => {
  it("returns conflict with booking(s), no delete or cancel", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const conflictBooking = {
      id: "booking-abc",
      starts_at: "2026-07-01T06:00:00Z",
      ends_at: "2026-07-02T06:00:00Z",
      client_id: "client-xyz",
    };

    const client = makeFakeClient({
      // Conflict query returns an active resident booking.
      bookings: { data: [conflictBooking], error: null },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["2026-07-01"], on: false },
    );

    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("booking-abc");

    // No delete on overnight_nights.
    const overnightDeletes = client._calls.filter(
      (c) => c.method === "delete" && c.table === "overnight_nights",
    );
    expect(overnightDeletes).toHaveLength(0);

    // No upsert either.
    const upsertCalls = client._calls.filter((c) => c.method === "upsert");
    expect(upsertCalls).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Non-contiguous batch: post-filter narrows to actual nights
// ──────────────────────────────────────────────────────────────────────────────

describe("setOvernightNightsBatchCore (on: false, non-contiguous batch)", () => {
  it("returns success when conflict booking falls in gap between toggled nights", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    // Booking on Jun 5 — sits in the gap between Jun 1 and Jun 10.
    const gapBooking = {
      id: "booking-gap",
      starts_at: "2026-06-05T18:00:00Z",
      ends_at: "2026-06-06T15:00:00Z",
      client_id: "client-xyz",
    };

    const client = makeFakeClient({
      bookings: { data: [gapBooking], error: null },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    // Jun-5 booking must NOT block — post-filter should exclude it.
    expect(result.kind).toBe("success");

    const deleteCalls = client._calls.filter(
      (c) => c.method === "delete" && c.table === "overnight_nights",
    );
    expect(deleteCalls.length).toBeGreaterThan(0);
  });

  it("returns conflict when booking overlaps one of the toggled nights", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    // Booking spans Jun 10 — directly overlaps the second toggled night.
    const conflictBooking = {
      id: "booking-jun10",
      starts_at: "2026-06-10T18:00:00Z",
      ends_at: "2026-06-11T15:00:00Z",
      client_id: "client-xyz",
    };

    const client = makeFakeClient({
      bookings: { data: [conflictBooking], error: null },
      overnight_nights: { data: [], error: null },
    });

    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["2026-06-01", "2026-06-10"], on: false },
    );

    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("booking-jun10");

    // No delete issued.
    const overnightDeletes = client._calls.filter(
      (c) => c.method === "delete" && c.table === "overnight_nights",
    );
    expect(overnightDeletes).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Validation
// ──────────────────────────────────────────────────────────────────────────────

describe("setOvernightNightsBatchCore validation", () => {
  it("returns validation_error for malformed night string", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});
    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: ["not-a-date"], on: true },
    );
    expect(result.kind).toBe("validation_error");
  });

  it("returns validation_error for empty nights array", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});
    const result = await setOvernightNightsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { nights: [], on: true },
    );
    expect(result.kind).toBe("validation_error");
  });
});
