/**
 * Unit tests for the settings editor's write path.
 *
 * The editor shows each rejected value at its own field, which only works while
 * the keys `updateSettingsCore` returns are settings column names. That contract
 * is what these tests pin — the schema and the key-building helper are covered
 * on their own elsewhere; this is the one place they are composed.
 */

import { describe, expect, it } from "vitest";

import {
  createFakeSupabase,
  type FakeResponse,
} from "@/test-stubs/fake-supabase";

import { updateSettingsCore } from "./settings-actions";

const ADMIN: FakeResponse = { data: { role: "admin" }, error: null };
const NOT_ADMIN: FakeResponse = { data: { role: "client" }, error: null };

describe("updateSettingsCore", () => {
  it("keys a rejected value by its settings column, so the editor can place it", async () => {
    const supabase = createFakeSupabase({ tables: { profiles: ADMIN } });

    const result = await updateSettingsCore(
      { serviceClient: supabase, actorUserId: "admin-1" },
      // A percentage above 100 — rejected by the update schema, not the DB.
      { late_cancel_refund_pct: 500 },
    );

    expect(result.kind).toBe("validation_error");
    if (result.kind !== "validation_error") return;
    expect(Object.keys(result.fieldErrors ?? {})).toEqual([
      "late_cancel_refund_pct",
    ]);
    // A rejected input must not reach the row.
    expect(supabase.calls({ table: "settings" })).toEqual([]);
  });

  it("refuses a non-admin actor before reading or writing settings", async () => {
    const supabase = createFakeSupabase({ tables: { profiles: NOT_ADMIN } });

    const result = await updateSettingsCore(
      { serviceClient: supabase, actorUserId: "client-1" },
      { late_cancel_refund_pct: 50 },
    );

    expect(result).toEqual({ kind: "forbidden" });
    expect(supabase.calls({ table: "settings" })).toEqual([]);
  });
});
