/**
 * Unit tests for premium-day toggle logic.
 *
 * Drives the cores through the recording Supabase double — no local Supabase
 * stack required, and the predicates each core issues are assertable.
 * Tests:
 *   1. Pure helper `togglePremiumDate` — add, remove, idempotent-add, remove-absent.
 *   2. `setPremiumDayCore` — non-admin → forbidden; admin → reads row, toggles,
 *      writes back at the row it read.
 */

import { describe, it, expect } from "vitest";
import type { DbClient } from "@/lib/supabase/db-client";
import {
  createFakeSupabase,
  type FakeSupabaseClient,
} from "@/test-stubs/fake-supabase";
import { togglePremiumDate } from "./premium-days-pure";
import {
  setPremiumDayCore,
  setPremiumDaysBatchCore,
} from "./premium-days-actions";
import type { SettingsDeps } from "./settings-actions";

// ─── togglePremiumDate ────────────────────────────────────────────────────────

describe("togglePremiumDate", () => {
  it("adds a date that is not present", () => {
    const result = togglePremiumDate(["2025-12-25"], "2025-12-31", true);
    expect(result).toEqual(["2025-12-25", "2025-12-31"]);
  });

  it("removes a date that is present", () => {
    const result = togglePremiumDate(
      ["2025-12-25", "2025-12-31"],
      "2025-12-25",
      false,
    );
    expect(result).toEqual(["2025-12-31"]);
  });

  it("idempotent add — adding an existing date does not duplicate", () => {
    const result = togglePremiumDate(["2025-12-25"], "2025-12-25", true);
    expect(result).toEqual(["2025-12-25"]);
  });

  it("remove-absent — removing a missing date is a no-op", () => {
    const result = togglePremiumDate(["2025-12-25"], "2025-12-31", false);
    expect(result).toEqual(["2025-12-25"]);
  });

  it("returns sorted result", () => {
    const result = togglePremiumDate(
      ["2025-12-31", "2025-12-01"],
      "2025-12-15",
      true,
    );
    expect(result).toEqual(["2025-12-01", "2025-12-15", "2025-12-31"]);
  });
});

// ─── The Supabase double ──────────────────────────────────────────────────────

interface FakeClientOptions {
  role?: string;
  /** Deliberately unknown: `holiday_dates` is a jsonb column, not a typed array. */
  holidayDates?: unknown;
  settingsId?: string;
  readError?: string | null;
  updateError?: string | null;
}

/**
 * Each core issues two `settings` chains — the read, then the write — and the
 * double serves the table as a FIFO queue, so the two responses go in order.
 */
function fakeClient({
  role = "admin",
  holidayDates = [],
  settingsId = "settings-row-1",
  readError = null,
  updateError = null,
}: FakeClientOptions = {}): FakeSupabaseClient {
  return createFakeSupabase({
    tables: {
      profiles: { data: { role }, error: null },
      settings: [
        readError
          ? { data: null, error: { message: readError } }
          : {
              data: { id: settingsId, holiday_dates: holidayDates },
              error: null,
            },
        { data: null, error: updateError ? { message: updateError } : null },
      ],
    },
  });
}

/** The recorded `settings` update, or undefined when no write was issued. */
function updateCall(client: FakeSupabaseClient) {
  return client.calls({ table: "settings", method: "update" })[0];
}

/**
 * The filters on the `settings` update. Only the write chain filters that table
 * — the read is a `limit(1).single()`.
 */
function updateFilters(client: FakeSupabaseClient) {
  return client.calls({ table: "settings", method: "eq" }).map((c) => c.args);
}

function adminDeps(client: DbClient): SettingsDeps {
  return { serviceClient: client, actorUserId: "actor-admin" };
}

function nonAdminDeps(client: DbClient): SettingsDeps {
  return { serviceClient: client, actorUserId: "actor-nonadmin" };
}

// ─── setPremiumDayCore ────────────────────────────────────────────────────────

describe("setPremiumDayCore", () => {
  it("non-admin actor → forbidden, no write", async () => {
    const client = fakeClient({ role: "client" });
    const result = await setPremiumDayCore(
      nonAdminDeps(client),
      "2025-12-25",
      true,
    );
    expect(result.kind).toBe("forbidden");
    expect(updateCall(client)).toBeUndefined();
  });

  it("admin actor → reads settings row, applies toggle, writes holiday_dates back", async () => {
    const client = fakeClient({
      role: "admin",
      holidayDates: ["2025-12-25"],
      settingsId: "row-abc",
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-31",
      true,
    );
    expect(result.kind).toBe("success");
    // Written payload must carry the updated holiday_dates array.
    expect(updateCall(client)?.args).toEqual([
      { holiday_dates: ["2025-12-25", "2025-12-31"] },
    ]);
    // And it must be aimed at the row it just read. `settings` is a singleton
    // today, so a dropped filter would pass every other assertion here while
    // rewriting whatever rows a future migration adds.
    expect(updateFilters(client)).toEqual([["id", "row-abc"]]);
  });

  it("admin actor toggle off → removes date from written array", async () => {
    const client = fakeClient({
      role: "admin",
      holidayDates: ["2025-12-25", "2025-12-31"],
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-25",
      false,
    );
    expect(result.kind).toBe("success");
    expect(updateCall(client)?.args).toEqual([
      { holiday_dates: ["2025-12-31"] },
    ]);
  });

  it("settings row not found → not_found", async () => {
    const client = fakeClient({ role: "admin", readError: "No rows found" });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-25",
      true,
    );
    expect(result.kind).toBe("not_found");
  });

  it("refuses rather than overwrite a holiday_dates value that is not a day list", async () => {
    // The column is jsonb. Toggling against a value the code cannot read would
    // write a one-element array over whatever was there.
    const client = fakeClient({
      role: "admin",
      holidayDates: { "2025-12-25": true },
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-31",
      true,
    );
    expect(result.kind).toBe("error");
    expect(updateCall(client)).toBeUndefined();
  });

  it("DB update error → error result", async () => {
    const client = fakeClient({
      role: "admin",
      holidayDates: [],
      updateError: "update failed",
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-25",
      true,
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("update failed");
  });
});

// ─── setPremiumDaysBatchCore ──────────────────────────────────────────────────

describe("setPremiumDaysBatchCore", () => {
  it("non-admin actor → forbidden, no write", async () => {
    const client = fakeClient({ role: "client" });
    const result = await setPremiumDaysBatchCore(
      nonAdminDeps(client),
      ["2025-12-25", "2025-12-31"],
      true,
    );
    expect(result.kind).toBe("forbidden");
    expect(updateCall(client)).toBeUndefined();
  });

  it("empty dayKeys → validation_error", async () => {
    const client = fakeClient({ role: "admin" });
    const result = await setPremiumDaysBatchCore(adminDeps(client), [], true);
    expect(result.kind).toBe("validation_error");
    expect(updateCall(client)).toBeUndefined();
  });

  it("admin actor multi-key add → folds all keys, writes union once", async () => {
    const client = fakeClient({
      role: "admin",
      holidayDates: ["2025-12-25"],
      settingsId: "row-xyz",
    });
    const result = await setPremiumDaysBatchCore(
      adminDeps(client),
      ["2025-12-31", "2026-01-01"],
      true,
    );
    expect(result.kind).toBe("success");
    // One write for the whole selection, not one per day.
    expect(client.calls({ table: "settings", method: "update" })).toHaveLength(
      1,
    );
    expect(updateCall(client)?.args).toEqual([
      { holiday_dates: ["2025-12-25", "2025-12-31", "2026-01-01"] },
    ]);
    expect(updateFilters(client)).toEqual([["id", "row-xyz"]]);
  });

  it("admin actor multi-key remove → folds all keys, writes remainder once", async () => {
    const client = fakeClient({
      role: "admin",
      holidayDates: ["2025-12-25", "2025-12-31", "2026-01-01"],
    });
    const result = await setPremiumDaysBatchCore(
      adminDeps(client),
      ["2025-12-25", "2026-01-01"],
      false,
    );
    expect(result.kind).toBe("success");
    expect(updateCall(client)?.args).toEqual([
      { holiday_dates: ["2025-12-31"] },
    ]);
  });
});
