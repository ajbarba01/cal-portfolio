/**
 * Unit tests for completion cron: the `isCompletable` predicate, and the
 * queries `runCompletionCron` issues against a recording Supabase double.
 *
 * Integration tests for runCompletionCron against a real database live in
 * completion-cron.integration.test.ts (requires local Supabase / SUPABASE_TEST_* env vars).
 */

import { describe, it, expect } from "vitest";
import { createFakeSupabase } from "@/test-stubs/fake-supabase";
import { isCompletable, runCompletionCron } from "./completion-cron";

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests: isCompletable
// ──────────────────────────────────────────────────────────────────────────────

describe("isCompletable", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("confirmed + endsAt in the past → true", () => {
    expect(
      isCompletable(
        { status: "confirmed", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });

  it("confirmed + endsAt equals now → false (not strictly past)", () => {
    expect(isCompletable({ status: "confirmed", endsAt: now }, now)).toBe(
      false,
    );
  });

  it("confirmed + endsAt in the future → false", () => {
    expect(
      isCompletable(
        { status: "confirmed", endsAt: new Date("2026-06-01T13:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });

  it("pending_approval + endsAt in the past → false", () => {
    expect(
      isCompletable(
        {
          status: "pending_approval",
          endsAt: new Date("2026-06-01T11:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("completed + endsAt in the past → false", () => {
    expect(
      isCompletable(
        { status: "completed", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });

  it("cancelled + endsAt in the past → false", () => {
    expect(
      isCompletable(
        { status: "cancelled", endsAt: new Date("2026-06-01T11:00:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Queries: runCompletionCron against the recording double
// ──────────────────────────────────────────────────────────────────────────────

describe("runCompletionCron", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const past = "2026-06-01T10:00:00.000Z";

  /** The double answers the select from the first chain and the update from the second. */
  const doubleReturning = (rows: unknown) =>
    createFakeSupabase({
      tables: {
        bookings: [
          { data: rows, error: null },
          { data: null, error: null },
        ],
      },
    });

  it("completes every due booking in a single update", async () => {
    const serviceClient = doubleReturning(
      ["a", "b", "c"].map((id) => ({ id, status: "confirmed", ends_at: past })),
    );

    const result = await runCompletionCron({ serviceClient, now });

    expect(result).toEqual({ ok: true, completed: 3 });
    expect(
      serviceClient.calls({ table: "bookings", method: "update" }),
    ).toHaveLength(1);
    expect(
      serviceClient.calls({ table: "bookings", method: "in" })[0]?.args,
    ).toEqual(["id", ["a", "b", "c"]]);
  });

  it("bounds the batch it reads", async () => {
    const serviceClient = doubleReturning([]);

    await runCompletionCron({ serviceClient, now });

    expect(
      serviceClient.calls({ table: "bookings", method: "limit" }),
    ).toHaveLength(1);
  });

  it("issues no update when nothing is due", async () => {
    const serviceClient = doubleReturning([]);

    const result = await runCompletionCron({ serviceClient, now });

    expect(result).toEqual({ ok: true, completed: 0 });
    expect(
      serviceClient.calls({ table: "bookings", method: "update" }),
    ).toEqual([]);
  });

  it("leaves out rows the predicate rejects", async () => {
    const serviceClient = doubleReturning([
      { id: "due", status: "confirmed", ends_at: past },
      {
        id: "still-running",
        status: "confirmed",
        ends_at: "2026-06-02T10:00:00.000Z",
      },
      { id: "not-confirmed", status: "pending_approval", ends_at: past },
    ]);

    const result = await runCompletionCron({ serviceClient, now });

    expect(result).toEqual({ ok: true, completed: 1 });
    expect(
      serviceClient.calls({ table: "bookings", method: "in" })[0]?.args,
    ).toEqual(["id", ["due"]]);
  });

  it("reports a failed update rather than a silent success", async () => {
    const serviceClient = createFakeSupabase({
      tables: {
        bookings: [
          {
            data: [{ id: "a", status: "confirmed", ends_at: past }],
            error: null,
          },
          { data: null, error: { message: "update denied" } },
        ],
      },
    });

    const result = await runCompletionCron({ serviceClient, now });

    expect(result).toEqual({
      ok: false,
      error: "Failed to complete bookings: update denied",
    });
  });
});
