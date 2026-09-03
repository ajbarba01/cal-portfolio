import { describe, expect, it, vi } from "vitest";

import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";

import { attentionCountsCore } from "./attention-counts-query";

const ADMIN: FakeResponse = { data: { role: "admin" }, error: null };
const NOT_ADMIN: FakeResponse = { data: { role: "client" }, error: null };

const NOW = new Date("2026-06-12T12:00:00.000Z");

/**
 * A `head: true` count read. The double's response type carries only data and
 * error, so `count` rides along on the inferred type — the double spreads the
 * object through untouched.
 */
function counted(count: number) {
  return { data: null, error: null, count };
}

function clientWith(
  tables: Record<string, FakeResponse>,
  profile: FakeResponse = ADMIN,
) {
  return createFakeSupabase({ tables: { profiles: profile, ...tables } });
}

describe("attentionCountsCore", () => {
  it("takes each count from the database rather than from a list of rows", async () => {
    const supabase = clientWith({
      bookings: counted(3),
      inquiries: counted(2),
      reviews: counted(1),
    });

    const counts = await attentionCountsCore({
      serviceClient: supabase,
      actorUserId: "admin-1",
      now: NOW,
    });

    expect(counts).toEqual({
      pendingApprovals: 3,
      newInquiries: 2,
      recentReviews: 1,
    });
    for (const table of ["bookings", "inquiries", "reviews"]) {
      expect(supabase.calls({ table, method: "select" })).toEqual([
        {
          table,
          method: "select",
          args: ["id", { count: "exact", head: true }],
        },
      ]);
    }
  });

  it("counts every pending booking, whatever month it starts in", async () => {
    // A booking pends because it starts beyond the auto-confirm horizon, so a
    // window on the count hides exactly the bookings that need approving.
    const supabase = clientWith({ bookings: counted(3) });

    await attentionCountsCore({
      serviceClient: supabase,
      actorUserId: "admin-1",
      now: NOW,
    });

    const calls = supabase
      .calls({ table: "bookings" })
      .map((call) => [call.method, ...call.args]);
    expect(calls).toContainEqual(["eq", "status", "pending_approval"]);
    expect(calls.some(([method]) => method === "lt" || method === "gte")).toBe(
      false,
    );
  });

  it("counts new inquiries and reviews from the last seven days", async () => {
    const supabase = clientWith({ inquiries: counted(0), reviews: counted(0) });

    await attentionCountsCore({
      serviceClient: supabase,
      actorUserId: "admin-1",
      now: NOW,
    });

    expect(supabase.calls({ table: "inquiries", method: "eq" })).toEqual([
      { table: "inquiries", method: "eq", args: ["status", "new"] },
    ]);
    // Strictly greater than: a review posted exactly seven days ago is outside.
    expect(supabase.calls({ table: "reviews", method: "gt" })).toEqual([
      {
        table: "reviews",
        method: "gt",
        args: ["created_at", "2026-06-05T12:00:00.000Z"],
      },
    ]);
  });

  it("resolves to zeros for a caller who is not an admin", async () => {
    const supabase = clientWith({ bookings: counted(3) }, NOT_ADMIN);

    const counts = await attentionCountsCore({
      serviceClient: supabase,
      actorUserId: "client-1",
      now: NOW,
    });

    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 0,
      recentReviews: 0,
    });
    expect(supabase.calls({ table: "bookings" })).toEqual([]);
  });

  it("logs a failed count and keeps the others", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = clientWith({
      bookings: { data: null, error: { message: "boom" } },
      inquiries: counted(2),
      reviews: counted(1),
    });

    const counts = await attentionCountsCore({
      serviceClient: supabase,
      actorUserId: "admin-1",
      now: NOW,
    });

    expect(counts).toEqual({
      pendingApprovals: 0,
      newInquiries: 2,
      recentReviews: 1,
    });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
