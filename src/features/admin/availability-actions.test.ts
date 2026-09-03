/**
 * Unit tests for the availability-actions refuse-not-cancel cores:
 *   - createWindowsBatchCore
 *   - setWindowUnavailableCore
 *
 * The cores are called directly with an injected client, so no Supabase stack
 * is needed. `assertActorIsAdmin` is mocked, which is what lets a test choose
 * an admin or non-admin actor without a profiles row.
 *
 * The client is the shared recording double. The hand-rolled fake this file
 * carried threw the arguments of `order`, `lt` and `gt` away, so the overlap
 * predicate on the conflict read was unassertable — exactly the gap that let a
 * dropped filter stay green elsewhere.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createFakeSupabase,
  type FakeSupabaseOptions,
} from "@/test-stubs/fake-supabase";
import {
  createWindowsBatchCore,
  setWindowUnavailableCore,
} from "./availability-actions";
import { denverMidnight } from "@/features/booking/availability";

// ──────────────────────────────────────────────────────────────────────────────
// Mock assertActorIsAdmin
// ──────────────────────────────────────────────────────────────────────────────

const mockAssertActorIsAdmin = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/admin-guard", () => ({
  assertActorIsAdmin: () => mockAssertActorIsAdmin(),
}));

/** Pre-loads a response per table; an array is that table's FIFO queue. */
function makeFakeClient(tables: FakeSupabaseOptions["tables"]) {
  return createFakeSupabase({ tables });
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

    dayKeys.forEach((dayKey, i) => {
      expect(rows[i]?.starts_at).toBe(denverInstant(dayKey, openMinute));
      expect(rows[i]?.ends_at).toBe(denverInstant(dayKey, closeMinute));
      expect(rows[i]?.note).toBeNull();
    });
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

    // Zod's issue list names internal field paths — the operator gets the one
    // static sentence and the detail goes to the log.
    expect(result).toEqual({
      kind: "validation_error",
      message: "Please check your entries and try again.",
    });
  });

  it("returns the static error text when the insert fails", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      availability_windows: {
        data: null,
        error: { message: 'duplicate key value violates "availability_pkey"' },
      },
    });

    const result = await createWindowsBatchCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKeys: ["2026-07-01"], openMinute: 480, closeMinute: 1020 },
    );

    // Postgres names tables and constraints; none of that reaches Cal's toast.
    expect(result).toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
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
    expect(result.bookings[0]?.id).toBe("booking-conflict");

    // No delete or insert on availability_windows.
    const windowMutations = client._calls.filter(
      (c) =>
        c.table === "availability_windows" &&
        (c.method === "delete" || c.method === "insert"),
    );
    expect(windowMutations).toHaveLength(0);
  });

  it("looks for bookings that overlap the slice, not ones that start inside it", async () => {
    mockAssertActorIsAdmin.mockResolvedValue(true);
    const client = makeFakeClient({
      bookings: { data: [], error: null },
      availability_windows: { data: [], error: null },
    });

    await setWindowUnavailableCore(
      { serviceClient: client, actorUserId: ADMIN_ID },
      { dayKey: "2026-07-01", fromMinute: 480, toMinute: 600 },
    );

    // A booking that began before 08:00 and is still running at 08:30 has to
    // block the block-out; a start-only predicate would let Cal close the hour
    // out from under it.
    const predicates = client
      .calls({ table: "bookings" })
      .map((call) => [call.method, ...call.args]);
    expect(predicates).toContainEqual([
      "lt",
      "starts_at",
      denverInstant("2026-07-01", 600),
    ]);
    expect(predicates).toContainEqual([
      "gt",
      "ends_at",
      denverInstant("2026-07-01", 480),
    ]);
    expect(predicates).toContainEqual([
      "in",
      "status",
      ["pending_approval", "confirmed"],
    ]);
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
    expect(rows[0]?.starts_at).toBe(denverInstant(dayKey, 480));
    expect(rows[0]?.ends_at).toBe(denverInstant(dayKey, 720));
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
    expect(rows[0]?.starts_at).toBe(denverInstant(dayKey, 720));
    expect(rows[0]?.ends_at).toBe(denverInstant(dayKey, 1200));
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
