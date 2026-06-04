/**
 * Unit tests for availability-actions refuse-not-cancel cores:
 *   - createWindowsBatchCore
 *   - setWindowUnavailableCore
 *
 * Uses a hand-rolled fake Supabase client — no live DB, no Supabase stack
 * required. Tests call the DI cores directly, injecting the fake client and
 * a controlled actorUserId.
 *
 * Mock strategy:
 *   - assertActorIsAdmin is vi.mock'd so tests control admin/non-admin without
 *     a real profiles table.
 *   - The fake client exposes only the builder methods the cores actually call.
 *   - Per-table responses are keyed by table name; call recording lets us
 *     assert on side-effects (insert, delete).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWindowsBatchCore,
  setWindowUnavailableCore,
} from "./availability-actions";
import { denverMidnight } from "@/features/booking/availability";

// ──────────────────────────────────────────────────────────────────────────────
// Mock assertActorIsAdmin
// ──────────────────────────────────────────────────────────────────────────────

const mockAssertActorIsAdmin = vi.fn<() => Promise<boolean>>();

vi.mock("./admin-guard", () => ({
  assertActorIsAdmin: () => mockAssertActorIsAdmin(),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Fake Supabase builder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal fake Supabase client.
 *
 * Each call to .from(table) returns a fluent builder backed by a pre-loaded
 * response. Multiple calls to the same table each consume the NEXT item from
 * that table's response queue (FIFO). If the queue is exhausted, falls back to
 * { data: [], error: null }.
 *
 * Recorded calls: insert, delete and their payloads.
 */
function makeFakeClient(
  tables: Record<
    string,
    { data: unknown; error: unknown } | { data: unknown; error: unknown }[]
  >,
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  // Track which index we're at per-table for queue-style responses.
  const tableIndex: Record<string, number> = {};

  const getResponse = (table: string): { data: unknown; error: unknown } => {
    const entry = tables[table];
    if (!entry) return { data: [], error: null };
    if (Array.isArray(entry)) {
      const idx = tableIndex[table] ?? 0;
      tableIndex[table] = idx + 1;
      return entry[idx] ?? { data: [], error: null };
    }
    return entry;
  };

  const makeBuilder = (table: string) => {
    const response = getResponse(table);

    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = (...args: unknown[]) => {
      calls.push({ table, method: "select", args });
      return builder;
    };
    builder.order = chain;
    builder.lt = chain;
    builder.gt = chain;
    builder.eq = (...args: unknown[]) => {
      calls.push({ table, method: "eq", args });
      return builder;
    };
    builder.in = (...args: unknown[]) => {
      calls.push({ table, method: "in", args });
      return builder;
    };
    builder.insert = (...args: unknown[]) => {
      calls.push({ table, method: "insert", args });
      return Promise.resolve(response);
    };
    builder.delete = (...args: unknown[]) => {
      calls.push({ table, method: "delete", args });
      return builder;
    };
    // Terminal: awaiting the builder resolves to the pre-loaded response.
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

/** Builds the ISO string for a Denver wall-clock minute on a given dayKey. */
function denverInstant(dayKey: string, minute: number): string {
  return new Date(
    denverMidnight(dayKey).getTime() + minute * 60000,
  ).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Non-admin guard
// ──────────────────────────────────────────────────────────────────────────────

describe("non-admin guard", () => {
  it("createWindowsBatchCore returns forbidden for non-admin", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeFakeClient({});
    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: NON_ADMIN_ID },
      { dayKeys: ["2026-07-01"], openMinute: 480, closeMinute: 1020 },
    );
    expect(result.kind).toBe("forbidden");
  });

  it("setWindowUnavailableCore returns forbidden for non-admin", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(false);
    const client = makeFakeClient({});
    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: NON_ADMIN_ID },
      { dayKey: "2026-07-01", fromMinute: 480, toMinute: 600 },
    );
    expect(result.kind).toBe("forbidden");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. createWindowsBatchCore
// ──────────────────────────────────────────────────────────────────────────────

describe("createWindowsBatchCore", () => {
  it("inserts one row per dayKey with correct starts_at/ends_at", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      availability_windows: { data: [], error: null },
    });

    const dayKeys = ["2026-07-01", "2026-07-02", "2026-07-03"];
    const openMinute = 480; // 8:00 AM Denver
    const closeMinute = 1020; // 5:00 PM Denver

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys, openMinute, closeMinute },
    );

    expect(result.kind).toBe("success");

    const insertCall = client._calls.find(
      (c) => c.method === "insert" && c.table === "availability_windows",
    );
    expect(insertCall).toBeDefined();

    const rows = insertCall!.args[0] as {
      starts_at: string;
      ends_at: string;
      note: null;
    }[];

    expect(rows).toHaveLength(3);

    for (let i = 0; i < dayKeys.length; i++) {
      expect(rows[i].starts_at).toBe(denverInstant(dayKeys[i], openMinute));
      expect(rows[i].ends_at).toBe(denverInstant(dayKeys[i], closeMinute));
      expect(rows[i].note).toBeNull();
    }
  });

  it("validation_error when openMinute >= closeMinute", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys: ["2026-07-01"], openMinute: 600, closeMinute: 480 },
    );

    expect(result.kind).toBe("validation_error");
  });

  it("validation_error when openMinute === closeMinute", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys: ["2026-07-01"], openMinute: 480, closeMinute: 480 },
    );

    expect(result.kind).toBe("validation_error");
  });

  it("validation_error on malformed dayKey", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys: ["not-a-date"], openMinute: 480, closeMinute: 1020 },
    );

    expect(result.kind).toBe("validation_error");
  });

  it("validation_error on empty dayKeys array", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({});

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys: [], openMinute: 480, closeMinute: 1020 },
    );

    expect(result.kind).toBe("validation_error");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. setWindowUnavailableCore — conflict check
// ──────────────────────────────────────────────────────────────────────────────

describe("setWindowUnavailableCore — active booking conflict", () => {
  it("returns conflict and performs NO window delete or insert", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const conflictBooking = {
      id: "booking-conflict",
      starts_at: denverInstant("2026-07-01", 500),
      ends_at: denverInstant("2026-07-01", 580),
    };

    // bookings query returns conflict; availability_windows query should NOT be reached.
    const client = makeFakeClient({
      bookings: { data: [conflictBooking], error: null },
      availability_windows: { data: [], error: null },
    });

    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey: "2026-07-01", fromMinute: 480, toMinute: 600 },
    );

    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("booking-conflict");

    // No delete or insert on availability_windows.
    const windowMutations = client._calls.filter(
      (c) =>
        c.table === "availability_windows" &&
        (c.method === "delete" || c.method === "insert"),
    );
    expect(windowMutations).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. setWindowUnavailableCore — middle-split
// ──────────────────────────────────────────────────────────────────────────────

describe("setWindowUnavailableCore — middle-split", () => {
  it("deletes the window and inserts TWO remainders with correct bounds", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const dayKey = "2026-07-01";
    // Window: 480–1200 (8am–8pm). R: 600–720 (10am–noon).
    const windowId = "window-split";
    const window = {
      id: windowId,
      starts_at: denverInstant(dayKey, 480),
      ends_at: denverInstant(dayKey, 1200),
      note: "split-test",
    };

    // Each .from("availability_windows") call gets its own response in order:
    // first call = window query (select overlapping), second+ = insert then delete
    // (insert-before-delete ordering — see setWindowUnavailableCore doc comment).
    const client = makeFakeClient({
      bookings: { data: [], error: null },
      // First call to availability_windows = the select (returns our window).
      // Subsequent calls (insert, delete) get { data: null, error: null }.
      availability_windows: [
        { data: [window], error: null },
        { data: null, error: null }, // insert response
        { data: null, error: null }, // delete response
      ],
    });

    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey, fromMinute: 600, toMinute: 720 },
    );

    expect(result.kind).toBe("success");

    const deleteCalls = client._calls.filter(
      (c) => c.table === "availability_windows" && c.method === "eq",
    );
    // The delete chain issues .delete().eq("id", windowId).
    expect(deleteCalls.some((c) => c.args[1] === windowId)).toBe(true);

    const insertCall = client._calls.find(
      (c) => c.table === "availability_windows" && c.method === "insert",
    );
    expect(insertCall).toBeDefined();

    const insertedRows = insertCall!.args[0] as {
      starts_at: string;
      ends_at: string;
      note: string | null;
    }[];

    expect(insertedRows).toHaveLength(2);

    // Left remainder: [480, 600)
    const left = insertedRows.find(
      (r) => r.starts_at === denverInstant(dayKey, 480),
    );
    expect(left).toBeDefined();
    expect(left!.ends_at).toBe(denverInstant(dayKey, 600));
    expect(left!.note).toBe("split-test");

    // Right remainder: [720, 1200)
    const right = insertedRows.find(
      (r) => r.starts_at === denverInstant(dayKey, 720),
    );
    expect(right).toBeDefined();
    expect(right!.ends_at).toBe(denverInstant(dayKey, 1200));
    expect(right!.note).toBe("split-test");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. setWindowUnavailableCore — trim-end (left remainder only)
// ──────────────────────────────────────────────────────────────────────────────

describe("setWindowUnavailableCore — trim-end", () => {
  it("inserts only the left remainder when R extends to/beyond window end", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const dayKey = "2026-07-02";
    // Window: 480–840. R: 720–900 (R.end > window.end → right remainder absent).
    const window = {
      id: "window-trim-end",
      starts_at: denverInstant(dayKey, 480),
      ends_at: denverInstant(dayKey, 840),
      note: null,
    };

    const client = makeFakeClient({
      bookings: { data: [], error: null },
      availability_windows: [
        { data: [window], error: null },
        { data: null, error: null }, // insert
        { data: null, error: null }, // delete
      ],
    });

    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey, fromMinute: 720, toMinute: 900 },
    );

    expect(result.kind).toBe("success");

    const insertCall = client._calls.find(
      (c) => c.table === "availability_windows" && c.method === "insert",
    );
    expect(insertCall).toBeDefined();

    const rows = insertCall!.args[0] as {
      starts_at: string;
      ends_at: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].starts_at).toBe(denverInstant(dayKey, 480));
    expect(rows[0].ends_at).toBe(denverInstant(dayKey, 720));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. setWindowUnavailableCore — trim-start (right remainder only)
// ──────────────────────────────────────────────────────────────────────────────

describe("setWindowUnavailableCore — trim-start", () => {
  it("inserts only the right remainder when R starts at/before window start", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const dayKey = "2026-07-03";
    // Window: 600–1200. R: 480–720 (R.start < window.start → left remainder absent).
    const window = {
      id: "window-trim-start",
      starts_at: denverInstant(dayKey, 600),
      ends_at: denverInstant(dayKey, 1200),
      note: null,
    };

    const client = makeFakeClient({
      bookings: { data: [], error: null },
      availability_windows: [
        { data: [window], error: null },
        { data: null, error: null }, // insert
        { data: null, error: null }, // delete
      ],
    });

    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey, fromMinute: 480, toMinute: 720 },
    );

    expect(result.kind).toBe("success");

    const insertCall = client._calls.find(
      (c) => c.table === "availability_windows" && c.method === "insert",
    );
    expect(insertCall).toBeDefined();

    const rows = insertCall!.args[0] as {
      starts_at: string;
      ends_at: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].starts_at).toBe(denverInstant(dayKey, 720));
    expect(rows[0].ends_at).toBe(denverInstant(dayKey, 1200));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. setWindowUnavailableCore — full-cover (window ⊆ R)
// ──────────────────────────────────────────────────────────────────────────────

describe("setWindowUnavailableCore — full-cover", () => {
  it("deletes the window and inserts zero remainders", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);

    const dayKey = "2026-07-04";
    // Window: 540–660. R: 480–720 (fully covers window).
    const window = {
      id: "window-full-cover",
      starts_at: denverInstant(dayKey, 540),
      ends_at: denverInstant(dayKey, 660),
      note: null,
    };

    const client = makeFakeClient({
      bookings: { data: [], error: null },
      availability_windows: [
        { data: [window], error: null },
        { data: null, error: null }, // delete
      ],
    });

    const result = await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey, fromMinute: 480, toMinute: 720 },
    );

    expect(result.kind).toBe("success");

    // Delete happened.
    const eqCalls = client._calls.filter(
      (c) => c.table === "availability_windows" && c.method === "eq",
    );
    expect(eqCalls.some((c) => c.args[1] === "window-full-cover")).toBe(true);

    // No insert.
    const insertCalls = client._calls.filter(
      (c) => c.table === "availability_windows" && c.method === "insert",
    );
    expect(insertCalls).toHaveLength(0);
  });
});
