/**
 * Unit tests for premium-day toggle logic.
 *
 * Mocks the Supabase client — no local Supabase stack required.
 * Tests:
 *   1. Pure helper `togglePremiumDate` — add, remove, idempotent-add, remove-absent.
 *   2. `setPremiumDayCore` — non-admin → forbidden; admin → reads row, toggles, writes back.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { togglePremiumDate, setPremiumDayCore } from "./premium-days-actions";
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

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockClient({
  role = "admin",
  holidayDates = [] as string[],
  settingsId = "settings-row-1",
  selectError = null as string | null,
  updateError = null as string | null,
}: {
  role?: string;
  holidayDates?: string[];
  settingsId?: string;
  selectError?: string | null;
  updateError?: string | null;
} = {}) {
  const writes = {
    update: null as Record<string, unknown> | null,
  };

  function makeBuilder(table: string) {
    let pendingUpdate: Record<string, unknown> | null = null;
    const eqFilters: Array<{ col: string; val: unknown }> = [];

    const builder: Record<string, unknown> = {};

    builder.select = vi.fn(() => builder);

    builder.limit = vi.fn(() => builder);

    builder.update = vi.fn((payload: Record<string, unknown>) => {
      pendingUpdate = payload;
      writes.update = payload;
      return builder;
    });

    builder.eq = vi.fn((_col: string, _val: unknown) => {
      eqFilters.push({ col: _col, val: _val });
      return builder;
    });

    builder.single = vi.fn(async () => {
      if (table === "profiles") {
        return { data: { role }, error: null };
      }
      if (table === "settings") {
        if (selectError) return { data: null, error: { message: selectError } };
        return {
          data: { id: settingsId, holiday_dates: holidayDates },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    // Make builder awaitable for update chains.
    builder.then = vi.fn(
      (
        resolve: (v: {
          data: unknown;
          error: { message: string } | null;
        }) => void,
      ) => {
        const decide = async () => {
          if (table === "settings" && pendingUpdate !== null) {
            if (updateError)
              return { data: null, error: { message: updateError } };
            return { data: null, error: null };
          }
          return { data: null, error: null };
        };
        decide().then(resolve);
        return builder;
      },
    );

    return builder;
  }

  const client = {
    from: vi.fn((table: string) => makeBuilder(table)),
    auth: { getUser: vi.fn() },
  } as unknown as SupabaseClient;

  return { client, writes };
}

function adminDeps(client: SupabaseClient): SettingsDeps {
  return { serviceClient: client, actorUserId: "actor-admin" };
}

function nonAdminDeps(client: SupabaseClient): SettingsDeps {
  return { serviceClient: client, actorUserId: "actor-nonadmin" };
}

// ─── setPremiumDayCore ────────────────────────────────────────────────────────

describe("setPremiumDayCore", () => {
  it("non-admin actor → forbidden, no write", async () => {
    const { client, writes } = makeMockClient({ role: "client" });
    const result = await setPremiumDayCore(
      nonAdminDeps(client),
      "2025-12-25",
      true,
    );
    expect(result.kind).toBe("forbidden");
    expect(writes.update).toBeNull();
  });

  it("admin actor → reads settings row, applies toggle, writes holiday_dates back", async () => {
    const existing = ["2025-12-25"];
    const { client, writes } = makeMockClient({
      role: "admin",
      holidayDates: existing,
      settingsId: "row-abc",
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-31",
      true,
    );
    expect(result.kind).toBe("success");
    // Written payload must include the updated holiday_dates array.
    expect(writes.update).not.toBeNull();
    expect(writes.update?.holiday_dates).toEqual(["2025-12-25", "2025-12-31"]);
  });

  it("admin actor toggle off → removes date from written array", async () => {
    const existing = ["2025-12-25", "2025-12-31"];
    const { client, writes } = makeMockClient({
      role: "admin",
      holidayDates: existing,
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-25",
      false,
    );
    expect(result.kind).toBe("success");
    expect(writes.update?.holiday_dates).toEqual(["2025-12-31"]);
  });

  it("settings row not found → not_found", async () => {
    const { client } = makeMockClient({
      role: "admin",
      selectError: "No rows found",
    });
    const result = await setPremiumDayCore(
      adminDeps(client),
      "2025-12-25",
      true,
    );
    expect(result.kind).toBe("not_found");
  });

  it("DB update error → error result", async () => {
    const { client } = makeMockClient({
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
